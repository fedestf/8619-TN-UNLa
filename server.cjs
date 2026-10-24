'use strict';

const http = require('node:http'),
  fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');

function createServer({ rootDir = __dirname } = {}) {
  const root = rootDir,
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
    return user
      ? { name: user.name, email: user.email, role: user.role }
      : null;
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

  function fail(status, message) {
    const error = Error(message);
    error.status = status;
    throw error;
  }
  const audioTypes = {
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',
  };
  function audioPath(item) {
    if (item.available === false || typeof item.audioFile !== 'string')
      return null;
    try {
      const base = fs.realpathSync(path.join(root, 'datos', 'audio'));
      const file = fs.realpathSync(path.resolve(base, item.audioFile));
      const relative = path.relative(base, file);
      if (
        relative.startsWith('..') ||
        path.isAbsolute(relative) ||
        !audioTypes[path.extname(file).toLowerCase()] ||
        !fs.statSync(file).isFile()
      )
        return null;
      return file;
    } catch {
      return null;
    }
  }
  function describe(item, catalog) {
    const available = !!audioPath(item);
    const result = {
      id: item.id,
      type: item.type,
      title: item.title,
      artist: item.artist || null,
      album: item.album || null,
      duration:
        Number.isFinite(item.duration) && item.duration > 0
          ? item.duration
          : null,
      available,
      audioUrl: available
        ? '/api/audio/' + item.type + '/' + encodeURIComponent(item.id)
        : null,
    };
    if (item.type === 'playlist') {
      result.items = (item.items || []).map((ref) => {
        const content =
          ['cancion', 'podcast'].includes(ref.type) &&
          catalog.find((x) => x.id === ref.id && x.type === ref.type);
        return content
          ? describe(content, catalog)
          : { ...ref, available: false };
      });
      result.available = result.items.some((x) => x.available);
    }
    return result;
  }
  function sendAudio(req, res, item) {
    const file = audioPath(item);
    if (!file) fail(409, 'El contenido no puede ser reproducido.');
    const size = fs.statSync(file).size;
    let start = 0,
      end = size - 1,
      status = 200;
    if (req.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (!match || (!match[1] && !match[2])) {
        res.setHeader('Content-Range', 'bytes */' + size);
        fail(416, 'Rango de audio no válido.');
      }
      start = match[1]
        ? Number(match[1])
        : Math.max(0, size - Number(match[2]));
      end =
        match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start > end ||
        start >= size ||
        size === 0
      ) {
        res.setHeader('Content-Range', 'bytes */' + size);
        fail(416, 'Rango de audio no válido.');
      }
      status = 206;
      res.setHeader('Content-Range', 'bytes ' + start + '-' + end + '/' + size);
    }
    res.statusCode = status;
    res.setHeader('Content-Type', audioTypes[path.extname(file).toLowerCase()]);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', size === 0 ? 0 : end - start + 1);
    if (req.method === 'HEAD' || !size) return res.end();
    const stream = fs.createReadStream(file, { start, end });
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  }
  function mediaFields(x) {
    const fields = {};
    if (['cancion', 'podcast'].includes(x.type)) {
      for (const key of ['album', 'audioFile']) {
        if (
          x[key] !== undefined &&
          (typeof x[key] !== 'string' || !x[key].trim())
        )
          fail(400, key + ' debe ser un texto no vacío.');
        if (x[key] !== undefined) fields[key] = x[key].trim();
      }
      if (
        fields.audioFile &&
        (fields.audioFile.includes('..') ||
          /[\\/:]/.test(fields.audioFile) ||
          !audioTypes[path.extname(fields.audioFile).toLowerCase()])
      )
        fail(
          400,
          'audioFile debe ser el nombre de un archivo WAV, MP3, OGG o M4A dentro de datos/audio.',
        );
      if (
        x.duration !== undefined &&
        (!Number.isFinite(x.duration) || x.duration <= 0)
      )
        fail(400, 'duration debe ser un número positivo de segundos.');
      if (x.available !== undefined && typeof x.available !== 'boolean')
        fail(400, 'available debe ser verdadero o falso.');
      if (x.duration !== undefined) fields.duration = x.duration;
      if (x.available !== undefined) fields.available = x.available;
      if (x.type === 'podcast' && x.artist !== undefined) {
        if (typeof x.artist !== 'string' || !x.artist.trim())
          fail(400, 'El autor del podcast debe ser un texto no vacío.');
        fields.artist = x.artist.trim();
      }
    }
    if (x.type === 'playlist' && x.items !== undefined) {
      if (
        !Array.isArray(x.items) ||
        x.items.some(
          (ref) =>
            !ref ||
            typeof ref.id !== 'string' ||
            !ref.id.trim() ||
            !['cancion', 'podcast'].includes(ref.type),
        )
      )
        fail(
          400,
          'Los elementos de una playlist deben referenciar canciones o podcasts por id y type.',
        );
      fields.items = x.items.map((ref) => ({
        id: ref.id.trim(),
        type: ref.type,
      }));
    }
    return fields;
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

      if (req.url === '/api/state' && req.method === 'GET') {
        const catalog = user ? read('catalogos') : [];
        return res.end(
          JSON.stringify({
            user: publicUser(user),
            catalog: catalog.map((item) => describe(item, catalog)),
          }),
        );
      }

      const requestUrl = new URL(req.url, 'http://localhost');
      if (requestUrl.pathname === '/api/search/artists') {
        if (!user) fail(401, 'Iniciá sesión para buscar artistas.');
        if (req.method !== 'GET') fail(405, 'Método no permitido.');
        const criteria = requestUrl.searchParams.getAll('q');
        const query = criteria.length === 1 ? criteria[0].trim() : '';
        if (!query || query.length > 150 || !/[\p{L}\p{N}]/u.test(query)) {
          fail(
            400,
            'Proporcioná un nombre de artista válido para realizar la búsqueda.',
          );
        }
        const normalize = (value) =>
          value
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
        const term = normalize(query);
        const catalog = read('catalogos');
        const songs = catalog.filter(
          (item) =>
            item.type === 'cancion' &&
            typeof item.artist === 'string' &&
            normalize(item.artist).includes(term),
        );
        const names = catalog
          .filter(
            (item) =>
              item.type === 'artista' &&
              typeof item.title === 'string' &&
              normalize(item.title).includes(term),
          )
          .map((item) => item.title.trim());
        names.push(...songs.map((item) => item.artist.trim()));
        const artists = [
          ...new Map(names.map((name) => [normalize(name), { name }])).values(),
        ];
        return res.end(
          JSON.stringify({
            artists,
            songs: songs.map((item) => describe(item, catalog)),
          }),
        );
      }

      const mediaRoute =
        /^\/api\/(content|audio)\/(cancion|podcast|playlist)\/([^/]+)$/.exec(
          req.url,
        );
      const songRoute = /^\/api\/songs\/([^/]+)$/.exec(req.url);
      if ((mediaRoute || songRoute) && ['GET', 'HEAD'].includes(req.method)) {
        if (!user) fail(401, 'Iniciá sesión para acceder a este contenido.');
        const catalog = read('catalogos');
        const type = songRoute ? 'cancion' : mediaRoute[2];
        const id = decodeURIComponent(songRoute ? songRoute[1] : mediaRoute[3]);
        const item = catalog.find((x) => x.id === id && x.type === type);
        if (!item) fail(404, 'El contenido no fue encontrado.');
        if (mediaRoute?.[1] === 'audio') {
          if (!['cancion', 'podcast'].includes(type))
            fail(409, 'El contenido no puede ser reproducido.');
          return sendAudio(req, res, item);
        }
        if (req.method === 'HEAD') return res.end();
        return res.end(JSON.stringify(describe(item, catalog)));
      }

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
            typeof data.email === 'string'
              ? data.email.trim().toLowerCase()
              : '';

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
              error:
                'La carga de catálogos requiere un perfil de administrador.',
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
            ...mediaFields(x),
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
      res.statusCode = err.status || 400;
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

  return server;
}

if (require.main === module) {
  createServer().listen(3000, '127.0.0.1', () =>
    console.log('Spotify disponible en http://127.0.0.1:3000'),
  );
}
module.exports = { createServer };

