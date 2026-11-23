'use strict';

// MIDI note numbers; at and length use sixteenth-note units (4 units per quarter).
// Transcribed from Wiener, p. 42, and checked against Mutopia, p. 8.
const moonlightScore = {
  unitsPerQuarter: 4,
  measures: [
    {
      length: 16,
      right: rightHand(1, [44,49,52,56,49,52,56,61,52,56,61,64,56,61,64]),
      left: bass(37, 44),
    },
    {
      length: 16,
      right: rightHand(0, [68,61,64,68,73,64,68,73,76,68,73,76], [68,73,76,80]),
      left: bass(37, 44, true),
    },
    {
      length: 16,
      right: rightHand(1, [44,48,51,56,48,51,56,60,51,56,60,63,56,60,63]),
      left: bass(36, 44),
    },
    {
      length: 16,
      right: rightHand(0, [68,60,63,68,72,63,68,72,75,68,72,75], [68,72,75,80]),
      left: bass(36, 44, true),
    },
    {
      length: 16,
      right: rightHand(1, [49,53,56,61,53,56,61,65,56,61,65,68,61,65,68]),
      left: bass(35, 44),
    },
    {
      length: 16,
      right: rightHand(0, [73,65,68,73,77,68,73,77,80,73,77,80], [73,77,80,85]),
      left: bass(35, 44, true),
    },
    {
      length: 16,
      right: rightHand(1, [49,54,57,61,61,66,69,73,73,78,81], [73,78,85], [4,8]),
      left: bass(33, 45),
    },
    {
      length: 16,
      right: rightHand(1, [49,52,55,61,61,64,67,73,73,76,79], [73,79,85], [4,8]),
      left: bass(33, 45),
    },
  ],
};

function rightHand(first, notes, chord, detached = []) {
  const events = notes.map((pitch, index) => {
    const at = first + index;
    return { at, length: 1, pitches: [pitch], staccato: detached.includes(at) };
  });
  if (chord) {
    for (const at of [12, 14]) {
      events.push({ at, length: 2, pitches: chord, staccato: true, accent: true });
    }
  }
  return events;
}

function bass(low, high, double = false) {
  return Array.from({ length: 8 }, (_, index) => ({
    at: index * 2,
    length: 2,
    pitches: double && index === 6 ? [low, low + 12] : [index % 2 ? high : low],
    staccato: true,
  }));
}
