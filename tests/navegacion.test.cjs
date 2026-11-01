'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PlaybackQueue } = require('../playback-queue.js');
const songs = [
  { id: 'c1', type: 'cancion' },
  { id: 'c2', type: 'cancion' },
  { id: 'c3', type: 'cancion' },
];
test('US10: siguiente y anterior respetan el orden y los límites de la lista', () => {
  const queue = new PlaybackQueue(songs, 'c1');
  assert.equal(queue.has(-1), false);
  assert.deepEqual(queue.candidates(1), [1, 2]);
  queue.index = 1;
  assert.deepEqual(queue.candidates(-1), [0]);
  assert.deepEqual(queue.candidates(1), [2]);
  queue.index = 2;
  assert.equal(queue.has(1), false);
  assert.deepEqual(queue.candidates(-1), [1, 0]);
});
test('US10: conserva la lista de origen al cambiar los resultados o la playlist visible', () => {
  const origin = [...songs];
  const queue = new PlaybackQueue(origin, 'c2');
  origin.reverse();
  origin[0] = { id: 'otro', type: 'cancion' };
  assert.deepEqual(
    queue.items.map((x) => x.id),
    ['c1', 'c2', 'c3'],
  );
  assert.equal(queue.index, 1);
});
test('US10: omite contenidos no disponibles y maneja listas vacías o de una canción', () => {
  const queue = new PlaybackQueue(
    [songs[0], { ...songs[1], available: false }, songs[2]],
    'c1',
  );
  assert.deepEqual(queue.candidates(1), [2]);
  queue.index = 2;
  assert.deepEqual(queue.candidates(-1), [0]);
  assert.equal(new PlaybackQueue().has(1), false);
  const single = new PlaybackQueue([songs[0]], 'c1');
  assert.equal(single.has(1), false);
  assert.equal(single.has(-1), false);
  assert.throws(() => single.candidates(0), RangeError);
});
