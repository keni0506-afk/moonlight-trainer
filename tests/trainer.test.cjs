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

  test(`${engine.name()} · お手本の休符、音価、速度切替と停止`, async t => {
    const page = await createPage(t, engine, 'iPhone 14 landscape');
    await page.addInitScript(() => {
      window.tones = [];
      // Playwright WebKit on Windows may be built without Web Audio.
      if (!window.AudioContext && !window.webkitAudioContext) {
        window.AudioContext = class {
          state = 'running';
          destination = {};
          get currentTime() { return performance.now() / 1000; }
          createOscillator() {
            return { frequency: {}, connect() {}, start() {}, stop() {} };
          }
          createGain() {
            return {
              gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
              connect() {},
              disconnect() {},
            };
          }
        };
      }
      const audio = window.AudioContext || window.webkitAudioContext;
      const create = audio.prototype.createOscillator;
      audio.prototype.createOscillator = function () {
        const oscillator = create.call(this);
        const start = oscillator.start.bind(oscillator);
        const stop = oscillator.stop.bind(oscillator);
        const tone = {};
        oscillator.start = time => {
          tone.start = time;
          tone.pitch = Math.round(69 + 12 * Math.log2(oscillator.frequency.value / 440));
          window.tones.push(tone);
          return start(time);
        };
        oscillator.stop = time => {
          tone.duration = time - tone.start;
          return stop(time);
        };
        return oscillator;
      };
    });
    await page.goto(url);
    await page.selectOption('#length', '4');
    const before = await layout(page);
    assert.deepEqual(before.overflow, [0, 0]);

    for (const speed of [1100, 750, 430]) {
      await page.selectOption('#speed', String(speed));
      await page.evaluate(() => { window.tones = []; });
      await page.locator('#demo').tap();
      await page.waitForFunction(() => window.tones.length === 4, null, { timeout: 5000 });
      const tones = await page.evaluate(() => window.tones);
      assert.deepEqual(tones.map(tone => tone.pitch), [44, 49, 52, 56]);
      for (let i = 0; i < tones.length; i++) {
        assert.equal(Math.round((tones[i].start - tones[0].start) * 1000), i * speed);
        assert.equal(Math.round(tones[i].duration * 1000), speed);
      }
      assert.equal(await page.locator('.demo-active').count(), 0);
      await page.locator('#demo').tap();
      assert.equal(await page.locator('.piano.playing').count(), 0);
    }

    await page.evaluate(() => { window.tones = []; });
    await page.locator('#fast').tap();
    await page.waitForFunction(() => window.tones.length === 52, null, { timeout: 5000 });
    const tones = await page.evaluate(() => window.tones);
    const tick = 60 / 168 / 4;
    const start = Math.min(...tones.map(tone => tone.start));
    const at = n => tones.filter(tone => Math.abs(tone.start - start - n * tick) < 1e-6);
    const pitchesAt = n => at(n).map(tone => tone.pitch).sort((a, b) => a - b);
    assert.deepEqual(pitchesAt(0), [37]);
    assert.deepEqual(pitchesAt(1), [44]);
    assert.deepEqual(pitchesAt(16), [37, 68]);
    assert.deepEqual(pitchesAt(28), [37, 49, 68, 73, 76, 80]);
    assert.deepEqual(pitchesAt(29), []);
    assert.deepEqual(pitchesAt(30), [44, 68, 73, 76, 80]);
    assert.ok(at(28).every(tone => Math.abs(tone.duration - tick) < 1e-6));
    assert.deepEqual(await layout(page), before);
    await page.waitForFunction(() => !document.querySelector('.piano.playing'), null, { timeout: 5000 });
    assert.match(await page.locator('#msg').textContent(), /終わりました/);
    assert.equal(await page.locator('#count').textContent(), '1 / 4音');
    await page.locator('#demo').tap();
    await page.selectOption('#speed', '750');
    assert.equal(await page.locator('.piano.playing').count(), 0);
    assert.deepEqual(await layout(page), before);
  });
}
