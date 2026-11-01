'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const { once } = require('node:events');
const { createServer } = require('../server.cjs');

test('Playlists privadas: crear, consultar, editar, agregar/quitar canciones y eliminar', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spotify-playlists-'));
  fs.mkdirSync(path.join(root, 'datos'));
  fs.writeFileSync(
    path.join(root, 'datos', 'catalogos.json'),
    JSON.stringify([
      { id: 'c1', type: 'cancion', title: 'Tema', artist: 'Artista' },
    ]),
  );
  let server = createServer({ rootDir: root });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  let base = 'http://127.0.0.1:' + server.address().port,
    cookie = '';
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    fs.rmSync(root, { recursive: true, force: true });
  });
  async function req(url, method = 'GET', body, session = cookie) {
    const r = await fetch(base + '/api/' + url, {
      method,
      headers: { Cookie: session, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (r.headers.get('set-cookie'))
      cookie = r.headers.get('set-cookie').split(';')[0];
    return r;
  }
  async function register(email) {
    const r = await req('register', 'POST', {
      name: 'Prueba',
      email,
      password: 'Prueba1234',
      role: 'user',
    });
    assert.equal(r.status, 200);
    return cookie;
  }
  assert.equal((await req('playlists')).status, 401);
  assert.equal(
    (await req('playlists', 'POST', { title: 'Sin sesión' })).status,
    401,
  );
  const owner = await register('uno@test.local');
  for (const title of ['', '   ', 'a'.repeat(101)])
    assert.equal((await req('playlists', 'POST', { title })).status, 400);
  assert.equal((await req('playlists', 'POST', null)).status, 400);
  assert.equal(
    (
      await req('playlists', 'POST', {
        title: 'Nombre',
        description: 'x'.repeat(501),
      })
    ).status,
    400,
  );
  const created = await req('playlists', 'POST', {
    title: '  Rock  ',
    description: ' Favoritas ',
    ownerEmail: 'otra@test.local',
  });
  assert.equal(created.status, 201);
  const p = await created.json();
  assert.equal(p.title, 'Rock');
  assert.equal(p.description, 'Favoritas');
  assert.equal(p.songCount, 0);
  assert.equal((await (await req('playlists')).json()).length, 1);
  assert.equal(
    (
      await req('playlists/' + p.id + '/songs', 'POST', {
        songId: 'inexistente',
      })
    ).status,
    404,
  );
  assert.equal(
    (await req('playlists/' + p.id + '/songs', 'POST', { songId: 'c1' }))
      .status,
    200,
  );
  assert.equal(
    (await req('playlists/' + p.id + '/songs', 'POST', { songId: 'c1' }))
      .status,
    409,
  );
  const loaded = await (await req('playlists/' + p.id)).json();
  assert.equal(loaded.items[0].title, 'Tema');
  assert.equal(loaded.songCount, 1);
  assert.equal(
    (await req('playlists/' + p.id, 'PATCH', { title: '  ' })).status,
    400,
  );
  const changed = await (
    await req('playlists/' + p.id, 'PATCH', {
      title: 'Nueva',
      description: 'Editada',
    })
  ).json();
  assert.equal(changed.title, 'Nueva');
  assert.equal(changed.description, 'Editada');
  assert.equal(changed.songCount, 1);
  const outsider = await register('dos@test.local');
  assert.deepEqual(await (await req('playlists')).json(), []);
  assert.deepEqual((await (await req('state')).json()).playlists, []);
  for (const [suffix, method, body] of [
    ['', 'GET'],
    ['', 'PATCH', { title: 'Ataque' }],
    ['', 'DELETE'],
    ['/songs', 'POST', { songId: 'c1' }],
    ['/songs/c1', 'DELETE'],
  ])
    assert.equal(
      (await req('playlists/' + p.id + suffix, method, body, outsider)).status,
      404,
    );
  cookie = owner;
  assert.equal(
    (await req('playlists/' + p.id + '/songs/c1', 'DELETE')).status,
    200,
  );
  assert.equal(
    (await req('playlists/' + p.id + '/songs/c1', 'DELETE')).status,
    404,
  );
  assert.equal((await (await req('playlists/' + p.id)).json()).songCount, 0);
  const stored = JSON.parse(
    fs.readFileSync(path.join(root, 'datos', 'playlists.json'), 'utf8'),
  );
  assert.equal(stored[0].ownerEmail, 'uno@test.local');
  assert.equal(stored[0].title, 'Nueva');
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  server = createServer({ rootDir: root });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = 'http://127.0.0.1:' + server.address().port;
  await req('login', 'POST', {
    email: 'uno@test.local',
    password: 'Prueba1234',
  });
  assert.equal((await (await req('playlists/' + p.id)).json()).title, 'Nueva');
  assert.equal((await req('playlists/' + p.id, 'DELETE')).status, 200);
  assert.deepEqual(await (await req('playlists')).json(), []);
  assert.equal((await req('playlists/' + p.id)).status, 404);
  assert.equal(
    JSON.parse(
      fs.readFileSync(path.join(root, 'datos', 'catalogos.json'), 'utf8'),
    ).length,
    1,
  );
});
