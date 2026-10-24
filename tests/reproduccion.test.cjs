'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { createServer } = require('../server.cjs');

test('Registro, autenticación, información, streaming e importación de contenido', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spotify-test-'));
  fs.mkdirSync(path.join(root, 'datos', 'audio'), { recursive: true });
  fs.writeFileSync(path.join(root, 'index.html'), '<html>Test</html>');
  fs.copyFileSync(
    path.join(__dirname, '..', 'datos', 'audio', 'prueba-1.wav'),
    path.join(root, 'datos', 'audio', 'test.wav'),
  );
  const catalog = [
    {
      id: 'song',
      type: 'cancion',
      title: 'Canción',
      artist: 'Artista',
      album: 'Álbum',
      duration: 6,
      audioFile: 'test.wav',
    },
    {
      id: 'pod',
      type: 'podcast',
      title: 'Episodio',
      duration: 6,
      audioFile: 'test.wav',
    },
    {
      id: 'off',
      type: 'cancion',
      title: 'No disponible',
      artist: 'Artista',
      available: false,
      audioFile: 'test.wav',
    },
    {
      id: 'missing-file',
      type: 'cancion',
      title: 'Sin archivo',
      artist: 'Artista',
      audioFile: 'missing.wav',
    },
    {
      id: 'escape',
      type: 'cancion',
      title: 'Ruta externa',
      artist: 'Artista',
      audioFile: '../../index.html',
    },
    {
      id: 'list',
      type: 'playlist',
      title: 'Lista',
      items: [
        { id: 'off', type: 'cancion' },
        { id: 'song', type: 'cancion' },
        { id: 'pod', type: 'podcast' },
      ],
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
  async function request(route, body, headers = {}, method) {
    const response = await fetch(base + route, {
      method: method || (body ? 'POST' : 'GET'),
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.headers.get('set-cookie'))
      cookie = response.headers.get('set-cookie').split(';')[0];
    return response;
  }
  assert.equal((await request('/api/songs/song')).status, 401);
  assert.equal((await request('/api/audio/cancion/song')).status, 401);
  assert.deepEqual((await (await request('/api/state')).json()).catalog, []);
  assert.equal(
    (
      await request('/api/register', {
        name: 'Admin',
        email: 'admin@test.local',
        password: 'Admin1234',
        role: 'admin',
      })
    ).status,
    200,
  );
  const metadata = await (await request('/api/songs/song')).json();
  assert.equal(metadata.title, 'Canción');
  assert.equal(metadata.artist, 'Artista');
  assert.equal(metadata.album, 'Álbum');
  assert.equal(metadata.duration, 6);
  assert.equal(metadata.available, true);
  assert.equal((await request('/api/songs/unknown')).status, 404);
  assert.equal((await request('/api/audio/cancion/unknown')).status, 404);
  for (const id of ['off', 'missing-file', 'escape']) {
    assert.equal(
      (await (await request('/api/songs/' + id)).json()).available,
      false,
    );
    assert.equal((await request('/api/audio/cancion/' + id)).status, 409);
  }
  const full = await request(metadata.audioUrl);
  assert.equal(full.status, 200);
  assert.equal(full.headers.get('content-type'), 'audio/wav');
  const audio = Buffer.from(await full.arrayBuffer());
  assert.equal(audio.toString('ascii', 0, 4), 'RIFF');
  const range = await request(metadata.audioUrl, null, { Range: 'bytes=0-43' });
  assert.equal(range.status, 206);
  assert.equal((await range.arrayBuffer()).byteLength, 44);
  assert.equal(
    range.headers.get('content-range'),
    'bytes 0-43/' + audio.length,
  );
  const suffix = await request(metadata.audioUrl, null, { Range: 'bytes=-10' });
  assert.equal((await suffix.arrayBuffer()).byteLength, 10);
  assert.equal(
    (await request(metadata.audioUrl, null, { Range: 'bytes=9999999-' }))
      .status,
    416,
  );
  assert.equal(
    (await request(metadata.audioUrl, null, { Range: 'bytes=0-1,3-4' })).status,
    416,
  );
  const head = await request(metadata.audioUrl, null, {}, 'HEAD');
  assert.equal(head.status, 200);
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  assert.equal((await request('/api/audio/podcast/pod')).status, 200);
  const list = await (await request('/api/content/playlist/list')).json();
  assert.equal(list.available, true);
  assert.deepEqual(
    list.items.map((x) => x.available),
    [false, true, true],
  );
  const records = [
    {
      id: 'new',
      type: 'cancion',
      title: 'Nueva',
      artist: 'Artista',
      album: 'Disco',
      duration: 6,
      available: true,
      audioFile: 'test.wav',
    },
    {
      id: 'new-list',
      type: 'playlist',
      title: 'Nueva lista',
      items: [{ id: 'new', type: 'cancion' }],
    },
  ];
  assert.equal((await request('/api/catalog', { records })).status, 200);
  const stored = JSON.parse(
    fs.readFileSync(path.join(root, 'datos', 'catalogos.json'), 'utf8'),
  );
  assert.deepEqual(
    stored.find((x) => x.id === 'new'),
    records[0],
  );
  assert.deepEqual(
    stored.find((x) => x.id === 'new-list').items,
    records[1].items,
  );
  assert.equal(
    (await (await request('/api/catalog', { records })).json()).duplicates,
    2,
  );
  assert.equal(
    (
      await request('/api/catalog', {
        records: [{ ...records[0], id: 'bad', audioFile: '../test.wav' }],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request('/api/catalog', {
        records: [{ ...records[0], id: 'bad', duration: -1 }],
      })
    ).status,
    400,
  );
  await request('/api/logout', {});
  assert.equal((await request(metadata.audioUrl)).status, 401);
  assert.equal(
    (
      await request('/api/login', {
        email: 'admin@test.local',
        password: 'Admin1234',
      })
    ).status,
    200,
  );
  assert.equal((await request(metadata.audioUrl)).status, 200);
});
