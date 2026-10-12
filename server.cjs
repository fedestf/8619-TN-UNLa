'use strict';

const http = require('node:http'),
  fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');

const root = __dirname,
  sessions = new Map(),
  types = ['cancion', 'artista', 'album', 'playlist', 'podcast'];

fs.mkdirSync(path.join(root, 'datos'), { recursive: true });

for (const name of ['usuarios', 'catalogos']) {
  const target = path.join(root, 'datos', name + '.json');
  if (!fs.existsSync(target)) fs.writeFileSync(target, '[]\n');
}

function read(name) {
  const data = JSON.parse(
    fs
      .readFileSync(path.join(root, 'datos', name + '.json'), 'utf8')
      .replace(/^\uFEFF/, ''),
  );
  if (!Array.isArray(data))
    throw Error(name + '.json debe contener una lista JSON.');
  return data;
}

function write(name, data) {
  const file = path.join(root, 'datos', name + '.json');
  fs.writeFileSync(file + '.tmp', JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(file + '.tmp', file);
}

function hash(password, salt) {
  return crypto
    .pbkdf2Sync(password, salt, 100000, 32, 'sha256')
    .toString('hex');
}

function publicUser(user) {
  return user ? { name: user.name, email: user.email, role: user.role } : null;
}

function token(req) {
  return /(?:^|;\s*)session=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1];
}

function login(res, user) {
  const id = crypto.randomBytes(32).toString('hex');
  sessions.set(id, user.email);
  res.setHeader(
    'Set-Cookie',
    'session=' + id + '; HttpOnly; SameSite=Strict; Path=/',
  );
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  try {
    if (req.url === '/' && req.method === 'GET') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(fs.readFileSync(path.join(root, 'index.html')));
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (!req.url.startsWith('/api/')) {
      res.statusCode = 404;
      return res.end(JSON.stringify({ error: 'Ruta inexistente.' }));
    }

    const users = read('usuarios'),
      user = users.find((u) => u.email === sessions.get(token(req)));

    if (req.url === '/api/state' && req.method === 'GET')
      return res.end(
        JSON.stringify({ user: publicUser(user), catalog: read('catalogos') }),
      );

    if (req.method !== 'POST') {
      res.statusCode = 405;
      return res.end(JSON.stringify({ error: 'Método no permitido.' }));
    }

    if (
      req.headers.origin &&
      req.headers.origin !== 'http://' + req.headers.host
    )
      throw Error('Origen no permitido.');

    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 2000000)
        throw Error('Los datos exceden el tamaño permitido.');
    }
    const data = JSON.parse(body || '{}');

    if (req.url === '/api/register') {
      const name = typeof data.name === 'string' ? data.name.trim() : '',
        email =
          typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';

      if (
        !name ||
        name.length > 80 ||
        email.length > 160 ||
        !/^\S+@\S+\.\S+$/.test(email) ||
        typeof data.password !== 'string' ||
        data.password.length < 8 ||
        !['user', 'admin'].includes(data.role)
      )
        throw Error('Revisá nombre, correo, contraseña y perfil.');

      if (users.some((u) => u.email === email))
        throw Error('Ya existe una cuenta asociada a ese correo.');

      const salt = crypto.randomBytes(16).toString('hex'),
        created = {
          name,
          email,
          role: data.role,
          salt,
          hash: hash(data.password, salt),
        };

      users.push(created);
      write('usuarios', users);
      login(res, created);
      return res.end('{}');
    }

    if (req.url === '/api/login') {
      const found = users.find(
        (u) =>
          u.email ===
          String(data.email || '')
            .trim()
            .toLowerCase(),
      );

      if (
        !found ||
        typeof data.password !== 'string' ||
        hash(data.password, found.salt) !== found.hash
      )
        throw Error('El correo o la contraseña no son válidos.');

      login(res, found);
      return res.end('{}');
    }

    if (req.url === '/api/logout') {
      sessions.delete(token(req));
      res.setHeader(
        'Set-Cookie',
        'session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0',
      );
      return res.end('{}');
    }

    if (req.url === '/api/catalog') {
      if (!user || user.role !== 'admin') {
        res.statusCode = 403;
        return res.end(
          JSON.stringify({
            error: 'La carga de catálogos requiere un perfil de administrador.',
          }),
        );
      }

      if (!Array.isArray(data.records) || !data.records.length)
        throw Error('Ingresá una lista con al menos un registro.');

      const catalog = read('catalogos');
      let added = 0,
        duplicates = 0;

      for (const [i, x] of data.records.entries()) {
        if (
          !x ||
          typeof x.id !== 'string' ||
          !x.id.trim() ||
          !types.includes(x.type) ||
          typeof x.title !== 'string' ||
          !x.title.trim() ||
          (x.type === 'cancion' &&
            (typeof x.artist !== 'string' || !x.artist.trim()))
        )
          throw Error(
            'Registro ' + (i + 1) + ': datos obligatorios inválidos.',
          );

        const item = {
          id: x.id.trim(),
          type: x.type,
          title: x.title.trim(),
          ...(x.type === 'cancion' ? { artist: x.artist.trim() } : {}),
        };

        if (catalog.some((c) => c.id === item.id && c.type === item.type)) {
          duplicates++;
          continue;
        }

        catalog.push(item);
        added++;
      }

      write('catalogos', catalog);
      return res.end(JSON.stringify({ added, duplicates }));
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Ruta inexistente.' }));
  } catch (err) {
    res.statusCode = 400;
    res.end(
      JSON.stringify({
        error:
          err instanceof SyntaxError
            ? 'El JSON no es válido. Revisá el formato de los datos.'
            : err.message,
      }),
    );
  }
});

server.listen(3000, '127.0.0.1', () =>
  console.log('Spotify disponible en http://127.0.0.1:3000'),
);
