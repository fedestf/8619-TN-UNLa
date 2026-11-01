'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const { once } = require('node:events');
const { createServer } = require('../server.cjs');
test('US38/US05/US06: contenido disponible, filtros, álbumes y privacidad de playlists', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spotify-contenido-'));
  fs.mkdirSync(path.join(root, 'datos', 'audio'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'datos', 'audio', 'test.wav'),
    Buffer.from('RIFFtest'),
  );
  const catalog = [
    {
      id: 'c1',
      type: 'cancion',
      title: 'De música ligera',
      artist: 'Soda Stereo',
      album: 'Canción animal',
      audioFile: 'test.wav',
      duration: 213,
    },
    {
      id: 'c2',
      type: 'cancion',
      title: 'Persiana americana',
      artist: 'Soda Stereo',
      album: 'Signos',
      audioFile: 'test.wav',
      duration: 294,
    },
    {
      id: 'c3',
      type: 'cancion',
      title: 'Puente',
      artist: 'Gustavo Cerati',
      album: 'Bocanada',
      audioFile: 'test.wav',
      duration: 242,
    },
    {
      id: 'off',
      type: 'cancion',
      title: 'Oculta',
      artist: 'Otro',
      album: 'Oculto',
      audioFile: 'test.wav',
      available: false,
    },
    {
      id: 'missing',
      type: 'cancion',
      title: 'Sin archivo',
      artist: 'Otro',
      album: 'Oculto',
      audioFile: 'missing.wav',
    },
  ];
  fs.writeFileSync(
    path.join(root, 'datos', 'catalogos.json'),
    JSON.stringify(catalog),
  );
  const server = createServer({ rootDir: root });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  let cookie = '';
  async function req(route, method = 'GET', body) {
    const r = await fetch(base + '/api/' + route, {
      method,
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (r.headers.get('set-cookie'))
      cookie = r.headers.get('set-cookie').split(';')[0];
    return r;
  }
  async function browse(query = '') {
    const r = await req('content/available' + query);
    assert.equal(r.status, 200);
    return r.json();
  }
  assert.equal((await req('content/available')).status, 401);
  await req('register', 'POST', {
    name: 'Uno',
    email: 'uno@test.local',
    password: 'Prueba1234',
    role: 'user',
  });
  fs.writeFileSync(
    path.join(root, 'datos', 'playlists.json'),
    JSON.stringify([
      {
        id: 'mine',
        ownerEmail: 'uno@test.local',
        title: 'Mi rock',
        description: '',
        songIds: ['c1'],
      },
      {
        id: 'empty',
        ownerEmail: 'uno@test.local',
        title: 'Mi vacía',
        description: '',
        songIds: [],
      },
      {
        id: 'other',
        ownerEmail: 'otro@test.local',
        title: 'Secreta',
        description: '',
        songIds: ['c1'],
      },
    ]),
  );
  let data = await browse();
  assert.deepEqual(
    data.songs.map((x) => x.id),
    ['c1', 'c2', 'c3'],
  );
  assert.deepEqual(
    data.playlists.map((x) => x.id),
    ['mine'],
  );
  for (const song of data.songs) {
    assert.equal(song.available, true);
    assert.equal(typeof song.duration, 'number');
    assert.ok(song.audioUrl);
  }
  data = await browse('?type=song&q=MUSICA');
  assert.deepEqual(
    data.songs.map((x) => x.id),
    ['c1'],
  );
  data = await browse('?type=artist&q=SÓDA');
  assert.equal(data.artists.length, 1);
  assert.equal(data.artists[0].songs.length, 2);
  data = await browse('?type=album&q=cancion');
  assert.equal(data.albums[0].name, 'Canción animal');
  assert.equal(data.albums[0].songs[0].id, 'c1');
  data = await browse('?type=album');
  assert.equal(data.albums.length, 3);
  data = await browse('?q=BOCANADA');
  assert.deepEqual(
    data.songs.map((x) => x.id),
    ['c3'],
  );
  data = await browse('?type=playlist&q=mi');
  assert.deepEqual(
    data.playlists.map((x) => x.id),
    ['mine', 'empty'],
  );
  data = await browse('?type=playlist&q=Secreta');
  assert.deepEqual(data.playlists, []);
  for (const type of ['all', 'song', 'artist', 'album', 'playlist']) {
    data = await browse('?type=' + type + '&q=Inexistente');
    assert.deepEqual(data, {
      songs: [],
      artists: [],
      albums: [],
      playlists: [],
    });
  }
  assert.equal((await req('content/available?type=podcast')).status, 400);
  assert.equal((await req('content/available?q=a&q=b')).status, 400);
  assert.equal((await req('content/available?type=all&type=song')).status, 400);
  assert.equal(
    (await req('content/available?q=' + 'x'.repeat(151))).status,
    400,
  );
  assert.equal((await req('content/available', 'POST', {})).status, 405);
  fs.unlinkSync(path.join(root, 'datos', 'audio', 'test.wav'));
  data = await browse();
  assert.deepEqual(data, { songs: [], artists: [], albums: [], playlists: [] });
  await req('logout', 'POST', {});
  assert.equal((await req('content/available')).status, 401);
});
