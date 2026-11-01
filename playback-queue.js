'use strict';

class PlaybackQueue {
  constructor(items = [], selectedId = null) {
    this.items = items
      .filter((item) => item.type === 'cancion')
      .map((item) => ({
        id: item.id,
        type: item.type,
        available: item.available,
      }));
    this.index = this.items.findIndex((item) => item.id === selectedId);
  }
  candidates(direction) {
    if (![1, -1].includes(direction))
      throw new RangeError('La dirección debe ser 1 o -1.');
    const result = [];
    for (
      let i = this.index + direction;
      i >= 0 && i < this.items.length;
      i += direction
    ) {
      if (this.items[i].available !== false) result.push(i);
    }
    return result;
  }
  has(direction) {
    return this.candidates(direction).length > 0;
  }
}

if (typeof module !== 'undefined' && module.exports)
  module.exports = { PlaybackQueue };
else window.PlaybackQueue = PlaybackQueue;
