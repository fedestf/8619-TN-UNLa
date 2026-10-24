'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { createServer } = require('../server.cjs');

test('US40: búsqueda por artista autenticada, parcial y normalizada', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spotify-artistas-'));
  fs.mkdirSync(path.join(root, 'datos'));
  const catalog = [
    {
      id: 'c1',
      type: 'cancion',
      title: 'De música ligera',
      artist: 'Soda Stereo',
      duration: 213,
    },
    {
      id: 'c2',
      type: 'cancion',
      title: 'Persiana americana',
      artist: 'Soda Stereo',
      duration: 294,
    },
    {
      id: 'c3',
      type: 'cancion',
      title: 'Puente',
      artist: 'Gustavo Cerati',
      duration: 242,
    },
    {
      id: 'c4',
      type: 'cancion',
      title: 'Tema',
      artist: 'Charly García',
      duration: 120,
    },
    { id: 'a1', type: 'artista', title: 'SODA STEREO' },
    { id: 'a2', type: 'artista', title: 'Artista sin canciones' },
    {
      id: 'p1',
      type: 'podcast',
      title: 'Programa',
      artist: 'Soda Stereo',
      duration: 100,
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
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  let cookie = '';
  async function request(route, options = {}) {
    return fetch(base + route, {
      ...options,
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
  }
  assert.equal((await request('/api/search/artists?q=Soda')).status, 401);
  const register = await request('/api/register', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Usuario',
      email: 'usuario@test.local',
      password: 'Prueba1234',
      role: 'user',
    }),
  });
  assert.equal(register.status, 200);
  cookie = register.headers.get('set-cookie').split(';')[0];
  for (const term of ['Soda Stereo', 'sOdA', ' stereo ', 'SÓDA']) {
    const response = await request(
      '/api/search/artists?q=' + encodeURIComponent(term),
    );
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.artists.length, 1);
    assert.deepEqual(
      data.songs.map((x) => x.id),
      ['c1', 'c2'],
    );
    for (const song of data.songs) {
      assert.equal(song.artist, 'Soda Stereo');
      assert.equal(typeof song.title, 'string');
      assert.equal(typeof song.duration, 'number');
    }
  }
  const cerati = await (await request('/api/search/artists?q=cerati')).json();
  assert.equal(cerati.artists[0].name, 'Gustavo Cerati');
  assert.deepEqual(
    cerati.songs.map((x) => x.id),
    ['c3'],
  );
  const garcia = await (await request('/api/search/artists?q=garcia')).json();
  assert.equal(garcia.songs[0].id, 'c4');
  assert.deepEqual(
    await (await request('/api/search/artists?q=NoExiste')).json(),
    { artists: [], songs: [] },
  );
  const standalone = await (
    await request('/api/search/artists?q=sin%20canciones')
  ).json();
  assert.equal(standalone.artists[0].name, 'Artista sin canciones');
  assert.deepEqual(standalone.songs, []);
  for (const query of [
    '',
    '?q=',
    '?q=%20%20',
    '?q=%21%21',
    '?q=Soda&q=Cerati',
    '?q=' + 'a'.repeat(151),
  ]) {
    const response = await request('/api/search/artists' + query);
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /nombre de artista/);
  }
  assert.equal(
    (
      await request('/api/search/artists?q=Soda', {
        method: 'POST',
        body: '{}',
      })
    ).status,
    405,
  );
  catalog.push({
    id: 'c5',
    type: 'cancion',
    title: 'Otra',
    artist: 'Soda Stereo',
    duration: 60,
  });
  fs.writeFileSync(
    path.join(root, 'datos', 'catalogos.json'),
    JSON.stringify(catalog),
  );
  assert.equal(
    (await (await request('/api/search/artists?q=Soda')).json()).songs.length,
    3,
  );
  await request('/api/logout', { method: 'POST', body: '{}' });
  assert.equal((await request('/api/search/artists?q=Soda')).status, 401);
});

