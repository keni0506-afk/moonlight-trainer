const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { pathToFileURL } = require('node:url');
const { chromium, devices, webkit } = require('playwright');

const url = process.env.TRAINER_URL || pathToFileURL(path.resolve(__dirname, '../index.html')).href;
const firstMeasure = ['ソ♯2', 'ド♯3', 'ミ3', 'ソ♯3', 'ド♯3', 'ミ3', 'ソ♯3', 'ド♯4',
  'ミ3', 'ソ♯3', 'ド♯4', 'ミ4', 'ソ♯3', 'ド♯4', 'ミ4'];

async function createPage(t, engine, device) {
  const browser = await engine.launch();
  t.after(() => browser.close());
  const page = await browser.newPage(devices[device]);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  return page;
}

async function layout(page) {
  return page.evaluate(() => {
    const root = document.scrollingElement;
    const viewport = window.visualViewport;
    const piano = document.querySelector('#piano').getBoundingClientRect();
    return {
      overflow: [root.scrollWidth - root.clientWidth, root.scrollHeight - root.clientHeight],
      offset: [scrollX, scrollY, viewport.offsetLeft, viewport.offsetTop],
      piano: [piano.left, piano.top, piano.right, piano.bottom],
      viewport: [viewport.width, viewport.height],
    };
  });
}

for (const engine of [webkit, chromium]) {
  test(`${engine.name()} · 4/8/15音の練習と横画面`, async t => {
    const page = await createPage(t, engine, 'iPhone SE (3rd gen) landscape');
    await page.goto(url);
    const before = await layout(page);
    assert.deepEqual(before.overflow, [0, 0]);
    assert.deepEqual(before.offset, [0, 0, 0, 0]);
    const [left, top, right, bottom] = before.piano;
    assert.ok(left >= 0 && top >= 0 && right <= before.viewport[0] && bottom <= before.viewport[1]);

    await page.evaluate(() => window.scrollTo(1000, 1000));
    assert.equal(await page.locator('#piano').evaluate(piano =>
      piano.dispatchEvent(new Event('touchmove', { cancelable: true, bubbles: true }))), false);
    if (engine === chromium) {
      const session = await page.context().newCDPSession(page);
      await session.send('Input.synthesizeScrollGesture', {
        x: (left + right) / 2, y: (top + bottom) / 2,
        xDistance: 180, yDistance: 100, gestureSourceType: 'touch'
      });
    }
    for (const length of [4, 8, 15]) {
      await page.selectOption('#length', String(length));
      await page.getByRole('button', { name: 'ファ2', exact: true }).tap();
      assert.match(await page.locator('#msg').textContent(), /もう一度/);
      assert.equal(await page.locator('#count').textContent(), `1 / ${length}音`);
      for (const name of firstMeasure.slice(0, length)) {
        assert.equal(await page.locator('.key.target').getAttribute('aria-label'), name);
        await page.getByRole('button', { name, exact: true }).tap();
      }
      assert.match(await page.locator('#next').textContent(), /クリア/);
      assert.deepEqual(await layout(page), before);
    }
    await page.locator('#restart').tap();
    assert.equal(await page.locator('#count').textContent(), '1 / 15音');
  });

  test(`${engine.name()} · 練習速度、落下と発音の同期、一時停止`, async t => {
    const page = await createPage(t, engine, 'iPhone 14 landscape');
    await useAudioClock(page);
    await page.goto(url);
    const before = await layout(page);
    assert.equal(await page.locator('.version').textContent(), 'v0.5.0');
    await page.selectOption('#length', '4');

    for (const speed of [1100, 750, 430]) {
      const tick = speed / 1000;
      await page.selectOption('#speed', String(speed));
      await page.evaluate(() => { window.tones = []; window.audioTime = 100; });
      await page.locator('#demo').tap();
      const downbeat = 100.035 + Math.max(tick, 1.05);
      await atTime(page, downbeat);
      assert.equal(await page.locator('.key.demo-right').count(), 0);
      for (let unit = 1; unit <= 4; unit++) await atTime(page, downbeat + unit * tick - 0.04);
      const tones = await page.evaluate(() => window.tones);
      assert.deepEqual(tones.map(tone => tone.pitch), [44, 49, 52, 56]);
      for (let i = 0; i < tones.length; i++) {
        assert.equal(Math.round((tones[i].start - downbeat) * 1000), (i + 1) * speed);
        assert.equal(Math.round((tones[i].end - tones[i].start) * 1000), speed);
      }
      await page.locator('#stop').tap();
    }

    await page.evaluate(() => { window.tones = []; window.audioTime = 100; });
    await page.locator('#fast').tap();
    const downbeat = 101.085;
    const tick = 60 / 168 / 4;
    await atTime(page, downbeat + tick - 0.05);
    const high = await lowestPixel(page, 'ソ♯2', [87, 191, 255]);
    await atTime(page, downbeat + tick - 0.01);
    const low = await lowestPixel(page, 'ソ♯2', [87, 191, 255]);
    assert.ok(high >= 0 && low > high && low > 0.95 * await page.locator('#fall').evaluate(c => c.height));
    await atTime(page, downbeat + tick + 0.004);
    assert.equal(await page.locator('.key.demo-right').getAttribute('aria-label'), 'ソ♯2');
    const right = (await page.evaluate(() => window.tones)).find(tone => tone.pitch === 44);
    assert.ok(Math.abs(right.start - (downbeat + tick)) < 1e-6);

    await page.locator('#pause').tap();
    const pausedImage = await page.locator('#fall').evaluate(c => c.toDataURL());
    const pausedTones = await page.evaluate(() => window.tones.length);
    await atTime(page, 108);
    assert.equal(await page.locator('#fall').evaluate(c => c.toDataURL()), pausedImage);
    assert.equal(await page.evaluate(() => window.tones.length), pausedTones);
    assert.equal(await page.locator('#pause').textContent(), '再開');
    await page.locator('#pause').tap();
    await atTime(page, 108.05);
    assert.equal(await page.locator('.key.demo-right').getAttribute('aria-label'), 'ソ♯2');
    assert.ok(await page.evaluate(previous => window.tones.length > previous, pausedTones));
    await page.locator('#stop').tap();
    assert.equal(await page.locator('.piano.playing').count(), 0);
    assert.equal(await page.locator('.key.demo-right,.key.demo-left').count(), 0);
    assert.deepEqual(await layout(page), before);
  });

  test(`${engine.name()} · 収録全小節の音域、左右の手、区間ループ`, async t => {
    const page = await createPage(t, engine, 'iPhone SE (3rd gen) landscape');
    await useAudioClock(page);
    await page.goto(url);
    const before = await layout(page);
    const score = await page.evaluate(() => moonlightScore);
    assert.equal(score.measures.length, 8);
    for (const [i, measure] of score.measures.entries()) {
      assert.equal(measure.length, 16);
      assert.deepEqual(measure.left.map(note => note.at), [0,2,4,6,8,10,12,14]);
      assert.equal(measure.right[0].at, [0,2,4,6,7].includes(i) ? 1 : 0);
      assert.equal(measure.right.at(-1).at + measure.right.at(-1).length, 16);
      assert.ok([...measure.left, ...measure.right].flatMap(note => note.pitches).every(pitch => pitch >= 33 && pitch <= 86));
    }
    assert.deepEqual(score.measures.map(measure => measure.left[0].pitches[0]), [37,37,36,36,35,35,33,33]);
    assert.deepEqual(score.measures[3].left[6].pitches, [36,48]);
    assert.deepEqual(score.measures[5].right.at(-1).pitches, [73,77,80,85]);
    assert.deepEqual(score.measures[6].right.at(-1).pitches, [73,78,85]);
    assert.deepEqual(score.measures[7].right.at(-1).pitches, [73,79,85]);
    assert.equal(await page.getByRole('button', { name: 'ラ1', exact: true }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'ド♯6', exact: true }).count(), 1);

    await page.selectOption('#from', '7');
    assert.equal(await page.inputValue('#to'), '7');
    await page.selectOption('#to', '8');
    await page.selectOption('#hand', 'left');
    await page.check('#repeat');
    await page.locator('#fast').tap();
    const start = 101.085;
    const tick = 60 / 168 / 4;
    await atTime(page, start + 0.01);
    assert.equal(await page.locator('#measure').textContent(), '第7小節');
    assert.equal(await page.locator('.key.demo-left').getAttribute('aria-label'), 'ラ1');
    assert.equal(await page.locator('.key.demo-right').count(), 0);
    await atTime(page, start + 16 * tick + 0.01);
    assert.equal(await page.locator('#measure').textContent(), '第8小節');
    const lap = start + 32 * tick;
    await atTime(page, lap - 0.03);
    assert.ok(await page.evaluate(lap => window.tones.some(tone =>
      tone.pitch === 33 && Math.abs(tone.start - lap) < 1e-6), lap));
    await atTime(page, lap + 0.01);
    await page.getByRole('button', { name: 'ソ♯2', exact: true }).tap();
    assert.equal(await page.locator('#count').textContent(), '1 / 8音');
    assert.equal(await page.locator('#measure').textContent(), '第7小節');
    assert.deepEqual(await layout(page), before);

    await page.selectOption('#hand', 'right');
    assert.equal(await page.locator('.piano.playing').count(), 0);
    assert.ok(await page.evaluate(() => window.tones.some(tone => tone.cancelled)));
    await page.uncheck('#repeat');
    await page.selectOption('#speed', '125');
    await page.evaluate(() => { window.audioTime = 100; window.tones = []; });
    await page.locator('#section').tap();
    await atTime(page, start + 0.126);
    assert.equal(await page.locator('.key.demo-right').getAttribute('aria-label'), 'ド♯3');
    assert.equal(await page.locator('.key.demo-left').count(), 0);
    await page.selectOption('#speed', 'fast');
    await atTime(page, start + 0.17);
    assert.equal(await page.locator('.piano.playing').count(), 1);
    assert.deepEqual(await layout(page), before);

    await page.selectOption('#from', '2');
    await page.selectOption('#to', '2');
    await page.selectOption('#hand', 'both');
    await page.evaluate(() => { window.audioTime = 100; window.tones = []; });
    await page.locator('#fast').tap();
    const accent = start + 12 * tick;
    await atTime(page, accent - 0.03);
    const result = await page.evaluate(({ accent, tick }) => window.tones
      .filter(tone => Math.abs(tone.start - accent) < 1e-6 && Math.abs(tone.end - tone.start - tick) < 1e-6)
      .map(tone => tone.pitch).sort((a,b) => a-b), { accent, tick });
    assert.deepEqual(result, [37,49,68,73,76,80]);
    await atTime(page, accent + 0.01);
    assert.equal(await page.locator('.key.demo-right').count(), 4);
    assert.equal(await page.locator('.key.demo-left').count(), 2);
    await atTime(page, start + 16 * tick + 0.02);
    assert.match(await page.locator('#msg').textContent(), /終わりました/);
    await page.evaluate(() => { moonlightScore.measures[1].right[0].pitches = [88]; });
    await page.locator('#fast').tap();
    assert.match(await page.locator('#msg').textContent(), /固定鍵盤の音域/);
    assert.equal(await page.locator('.piano.playing').count(), 0);
    assert.deepEqual(await layout(page), before);
  });
}

async function useAudioClock(page) {
  await page.addInitScript(() => {
    window.audioTime = 100;
    window.tones = [];
    window.AudioContext = class {
      state = 'running';
      destination = {};
      get currentTime() { return window.audioTime; }
      createOscillator() {
        const note = {};
        return {
          frequency: {},
          connect() {},
          start(start) {
            note.pitch = Math.round(69 + 12 * Math.log2(this.frequency.value / 440));
            note.start = start;
            window.tones.push(note);
          },
          stop(end) {
            if (end === undefined) note.cancelled = true;
            else note.end = end;
          },
        };
      }
      createGain() {
        return {
          gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
          connect() {},
          disconnect() {},
        };
      }
    };
  });
}

async function atTime(page, time) {
  await page.evaluate(time => {
    window.audioTime = time;
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, time);
}

async function lowestPixel(page, name, color) {
  return page.evaluate(({ name, color }) => {
    const canvas = document.querySelector('#fall');
    const bounds = canvas.getBoundingClientRect();
    const key = document.querySelector('.key[aria-label="' + name + '"]').getBoundingClientRect();
    const x = Math.round((key.left + key.width / 2 - bounds.left) * canvas.width / bounds.width);
    const pixels = canvas.getContext('2d').getImageData(x, 0, 1, canvas.height).data;
    for (let y = canvas.height - 1; y >= 0; y--) {
      if (color.every((channel, i) => pixels[y * 4 + i] === channel)) return y;
    }
    return -1;
  }, { name, color });
}

test('chromium · 実際の Web Audio で高速再生が完了する', async t => {
  const page = await createPage(t, chromium, 'iPhone 14 landscape');
  await page.goto(url);
  await page.selectOption('#to', '1');
  await page.locator('#fast').tap();
  await page.waitForFunction(() => document.querySelector('#msg').textContent.includes('終わりました'),
    null, { timeout: 6500 });
});
