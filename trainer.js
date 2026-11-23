'use strict';

const $ = id => document.getElementById(id);
const piano = $('piano');
const canvas = $('fall');
const paint = canvas.getContext('2d');
const keyMap = new Map();
const minPitch = 33; // A1
const maxPitch = 86; // D6, white right edge next to C♯6
const colors = { right: '#57bfff', left: '#f59864' };
const names = ['ド','ド♯','レ','レ♯','ミ','ファ','ファ♯','ソ','ソ♯','ラ','ラ♯','シ'];
const label = pitch => names[pitch % 12] + (Math.floor(pitch / 12) - 1);
const isBlack = pitch => [1, 3, 6, 8, 10].includes(pitch % 12);
const practice = moonlightScore.measures[0].right;
const fingers = [1,2,3,5,1,2,3,5,1,2,3,5,1,2,5];
const practiceLength = () => Number($('length').value);
const fastBpm = 168;
let progress = 0;
let audio;
let playback;

const whites = [];
for (let pitch = minPitch; pitch <= maxPitch; pitch++) {
  if (!isBlack(pitch)) whites.push(pitch);
}
const whiteWidth = 1 / whites.length;
for (const [index, pitch] of whites.entries()) makeKey(pitch, false, index * whiteWidth, whiteWidth);
for (let pitch = minPitch; pitch <= maxPitch; pitch++) {
  if (!isBlack(pitch)) continue;
  const position = whites.filter(white => white < pitch).length * whiteWidth;
  makeKey(pitch, true, position - whiteWidth * 0.32, whiteWidth * 0.64);
}
piano.addEventListener('touchmove', event => event.preventDefault(), { passive: false });

function makeKey(pitch, black, left, width) {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'key ' + (black ? 'black' : 'white');
  element.style.left = left * 100 + '%';
  element.style.width = width * 100 + '%';
  if (pitch % 12 === 0) element.textContent = label(pitch);
  element.setAttribute('aria-label', label(pitch));
  element.addEventListener('pointerdown', event => {
    event.preventDefault();
    press(pitch);
  });
  element.addEventListener('click', event => {
    if (event.detail === 0) press(pitch);
  });
  piano.append(element);
  keyMap.set(pitch, { element, left, width });
}

function message(text, type = '') {
  $('msg').textContent = text;
  $('msg').className = type;
}

function renderPractice() {
  const limit = practiceLength();
  const end = progress >= limit;
  $('next').textContent = end ? 'クリア！' : '次：' + label(practice[progress].pitches[0]);
  $('finger').textContent = end ? '' : '指の目安：' + fingers[progress];
  $('count').textContent = Math.min(progress + 1, limit) + ' / ' + limit + '音';
  $('progress').max = limit;
  $('progress').value = progress;
  for (const { element } of keyMap.values()) element.classList.remove('target');
  if (!end) keyMap.get(practice[progress].pitches[0]).element.classList.add('target');
  $('roll').replaceChildren();
  for (const note of practice.slice(progress, Math.min(limit, progress + 5))) {
    const element = document.createElement('span');
    element.className = 'note';
    element.textContent = label(note.pitches[0]);
    $('roll').append(element);
  }
  if (end) message('よくできました！', 'good');
}

function press(pitch) {
  const following = playback && playback.mode !== 'demo';
  if (!following) stop();
  previewPitch(pitch);
  const { element } = keyMap.get(pitch);
  element.classList.add('active');
  setTimeout(() => element.classList.remove('active'), 140);
  if (following || progress >= practiceLength()) return;
  if (pitch === practice[progress].pitches[0]) {
    progress++;
    message('正解！', 'good');
    renderPractice();
  } else {
    message('もう一度。黄色い鍵盤を押してください', 'bad');
  }
}

async function getAudio() {
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) throw new Error('Web Audio unavailable');
  audio ??= new Audio();
  if (audio.state !== 'running') await audio.resume();
  return audio;
}

function tone(context, pitch, start, end, volume, output) {
  const voice = context.createOscillator();
  const envelope = context.createGain();
  voice.type = 'triangle';
  voice.frequency.value = 440 * 2 ** ((pitch - 69) / 12);
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.008, (end - start) / 3));
  envelope.gain.exponentialRampToValueAtTime(0.0001, end);
  voice.connect(envelope);
  envelope.connect(output);
  voice.start(start);
  voice.stop(end);
  return voice;
}

async function previewPitch(pitch) {
  try {
    const context = await getAudio();
    const start = context.currentTime;
    tone(context, pitch, start, start + 0.45, 0.15, context.destination);
  } catch {
    if ($('msg').className !== 'good' && $('msg').className !== 'bad') {
      message('音を再生できませんでした');
    }
  }
}

for (const [index] of moonlightScore.measures.entries()) {
  const number = index + 1;
  for (const id of ['from', 'to']) $(id).add(new Option(number, number));
}
$('to').value = '2';

function sectionScore(mode) {
  const left = Number($('from').value);
  const right = Number($('to').value);
  if (mode === 'demo') {
    const events = practice.slice(0, practiceLength()).map(note => ({ ...note, hand: 'right' }));
    return { events, bars: [{ at: 0, number: 1 }], length: events.at(-1).at + 1 };
  }
  const hand = $('hand').value;
  const hands = hand === 'both' ? ['right', 'left'] : [hand];
  const events = [];
  const bars = [];
  let length = 0;
  for (let number = left; number <= right; number++) {
    const measure = moonlightScore.measures[number - 1];
    bars.push({ at: length, number });
    for (const side of hands) {
      events.push(...measure[side].map(note => ({ ...note, at: length + note.at, hand: side })));
    }
    length += measure.length;
  }
  events.sort((a, b) => a.at - b.at);
  return { events, bars, length };
}

function secondsPerUnit(mode) {
  const speed = $('speed').value;
  return mode === 'fast' || speed === 'fast'
    ? 60 / fastBpm / moonlightScore.unitsPerQuarter
    : Number(speed) / 1000;
}

function gate(note) {
  return note.length * (note.staccato ? 0.5 : 1);
}

function renderControls() {
  const paused = playback?.paused;
  $('pause').disabled = !playback || playback.pending;
  $('pause').textContent = paused ? '再開' : '一時停止';
  $('stop').disabled = !playback;
  piano.classList.toggle('playing', Boolean(playback));
}

function cancelAudio(run) {
  cancelAnimationFrame(run.frame);
  run.output?.disconnect();
  for (const voice of run.voices) {
    voice.onended = null;
    voice.stop();
  }
  run.voices.clear();
}

function stop() {
  if (!playback) return false;
  cancelAudio(playback);
  playback = undefined;
  renderControls();
  draw();
  return true;
}

function draw(time) {
  const width = canvas.width;
  const height = canvas.height;
  paint.clearRect(0, 0, width, height);
  for (const { element, left } of keyMap.values()) {
    element.classList.remove('demo-left', 'demo-right');
    if (element.classList.contains('black')) continue;
    paint.fillStyle = '#1a2b44';
    paint.fillRect(Math.round(left * width), 0, 1, height);
  }
  if (!playback || time === undefined) {
    $('measure').textContent = '';
    return;
  }

  const { score, tick, repeat } = playback;
  const lead = Math.max(1, 1.05 / tick);
  const cycle = repeat ? Math.max(0, Math.floor(time / score.length)) : 0;
  const phase = time - cycle * score.length;
  const bar = score.bars.findLast(item => item.at <= phase) ?? score.bars[0];
  $('measure').textContent = '第' + bar.number + '小節';
  const pixelsPerUnit = height / lead;
  // Blocks show written duration. The key light follows the sounding duration.
  for (let pass = cycle; pass <= cycle + (repeat ? 1 : 0); pass++) {
    const local = time - pass * score.length;
    for (const note of score.events) {
      const bottom = height - (note.at - local) * pixelsPerUnit;
      const top = bottom - note.length * pixelsPerUnit;
      if (bottom <= 0 || top >= height) continue;
      for (const pitch of note.pitches) {
        const { element, left, width: keyWidth } = keyMap.get(pitch);
        const shared = score.events.some(other => other.hand !== note.hand &&
          other.at === note.at && other.pitches.includes(pitch));
        const size = keyWidth * (shared ? 0.36 : 0.76);
        const x = left + (keyWidth - size) / 2 +
          (shared ? size / 2 * (note.hand === 'right' ? 1 : -1) : 0);
        paint.fillStyle = colors[note.hand];
        paint.fillRect(x * width, Math.max(0, top), size * width, Math.min(height, bottom) - Math.max(0, top));
        if (local >= note.at && local < note.at + gate(note)) {
          element.classList.add('demo-' + note.hand);
        }
      }
    }
  }
}

function resizeFall() {
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.round(canvas.clientWidth * scale);
  canvas.height = Math.round(canvas.clientHeight * scale);
  draw(playback?.time);
}
new ResizeObserver(resizeFall).observe(canvas);

function schedule(run, now, until) {
  const { score, context, anchor, tick } = run;
  // The cursor is monotonic across loop boundaries. Each event is queued once.
  while (run.cycle === 0 || run.repeat) {
    const note = score.events[run.index];
    const start = anchor + (run.cycle * score.length + note.at) * tick;
    if (start > until) break;
    const end = start + gate(note) * tick;
    const attack = Math.max(start, now, run.start);
    if (end - attack > 0.002) {
      const volume = note.accent ? 0.11 : note.hand === 'right' ? 0.16 : 0.10;
      for (const pitch of note.pitches) {
        const voice = tone(context, pitch, attack, end, volume, run.output);
        run.voices.add(voice);
        voice.onended = () => run.voices.delete(voice);
      }
    }
    run.index++;
    if (run.index === score.events.length) {
      run.index = 0;
      run.cycle++;
    }
  }
}

async function begin(mode, score = sectionScore(mode), offset) {
  stop();
  if (!score.events.length || score.events.some(note => note.pitches.some(pitch => !keyMap.has(pitch)))) {
    message('この区間は固定鍵盤の音域で再生できません', 'bad');
    return;
  }
  const tick = secondsPerUnit(mode);
  const lead = Math.max(1, 1.05 / tick);
  const run = {
    mode, score, tick, repeat: $('repeat').checked,
    time: offset ?? -lead, pending: true,
    index: 0, cycle: 0, voices: new Set(),
  };
  playback = run;
  renderControls();
  draw(run.time);
  try {
    const context = await getAudio();
    if (playback !== run) return;
    run.context = context;
    run.output = context.createGain();
    run.output.connect(context.destination);
    run.start = context.currentTime + 0.035;
    run.anchor = run.start - run.time * tick;
    run.pending = false;
    renderControls();
    message(mode === 'fast' ? '高速再生 · ♩=168（目安）' : 'お手本を再生中');
    function frame() {
      const now = context.currentTime;
      run.time = (Math.max(now, run.start) - run.anchor) / tick;
      if (!run.repeat && run.time >= score.length) {
        stop();
        message('お手本の再生が終わりました');
        return;
      }
      schedule(run, now, now + 0.16);
      draw(run.time);
      run.frame = requestAnimationFrame(frame);
    }
    frame();
  } catch {
    if (playback !== run) return;
    stop();
    message('お手本を再生できませんでした', 'bad');
  }
}

function position(run) {
  if (run.pending || run.paused) return run.time;
  const elapsed = (Math.max(run.context.currentTime, run.start) - run.anchor) / run.tick;
  return run.repeat && elapsed >= 0 ? elapsed % run.score.length : elapsed;
}

function pause() {
  const run = playback;
  if (!run || run.pending) return;
  if (run.paused) {
    begin(run.mode, run.score, run.time);
    return;
  }
  run.time = position(run);
  run.paused = true;
  cancelAudio(run);
  renderControls();
  draw(run.time);
  message('一時停止中');
}

function updateTiming() {
  const run = playback;
  if (!run || run.paused) return;
  begin(run.mode, run.score, position(run));
}

function changeSection(id) {
  if (Number($('from').value) > Number($('to').value)) {
    $(id === 'from' ? 'to' : 'from').value = $(id).value;
  }
  if (stop()) message('区間または手を変更しました');
}

function restart() {
  stop();
  progress = 0;
  message('黄色い鍵盤を順番に押してください');
  renderPractice();
}

for (const mode of ['demo', 'section', 'fast']) {
  $(mode).addEventListener('click', () => begin(mode));
}
for (const id of ['from', 'to', 'hand']) {
  $(id).addEventListener('change', () => changeSection(id));
}
$('speed').addEventListener('change', () => {
  if (playback?.mode !== 'fast') updateTiming();
});
$('repeat').addEventListener('change', updateTiming);
$('pause').addEventListener('click', pause);
$('stop').addEventListener('click', () => {
  if (stop()) message('お手本を停止しました');
});
$('restart').addEventListener('click', restart);
$('length').addEventListener('change', restart);
$('hear').addEventListener('click', () => {
  if (stop()) message('お手本を停止しました');
  previewPitch(practice[Math.min(progress, practiceLength() - 1)].pitches[0]);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && playback && !playback.paused) {
    if (playback.pending) stop();
    else pause();
  }
});

renderPractice();
resizeFall();
