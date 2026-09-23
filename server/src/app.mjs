import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseParcelText } from './parser.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const previewRoot = normalize(join(__dirname, '../../preview'));

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

function sendJson(response, statusCode, data) {
  const body = JSON.stringify(data);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS'
  });
  response.end(body);
}

function sendText(response, statusCode, text, contentType = 'text/plain; charset=utf-8') {
  response.writeHead(statusCode, {
    'content-type': contentType,
    'cache-control': 'no-store',
    'access-control-allow-origin': '*'
  });
  response.end(text);
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 2 * 1024 * 1024) throw new Error('请求体过大');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('请求体不是有效 JSON');
  }
}

function bearerToken(request) {
  const header = request.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || '';
}

function routeMatch(pathname, pattern) {
  const match = pathname.match(pattern);
  return match ? match.slice(1).map(decodeURIComponent) : null;
}

async function servePreview(response, pathname) {
  const relative = pathname === '/preview/' || pathname === '/preview'
    ? 'index.html'
    : pathname.replace(/^\/preview\/?/, '');
  const target = normalize(join(previewRoot, relative));
  if (!target.startsWith(previewRoot)) {
    sendText(response, 403, 'Forbidden');
    return;
  }

  try {
    const fileStat = await stat(target);
    if (!fileStat.isFile()) throw new Error('not file');
    const body = await readFile(target);
    response.writeHead(200, {
      'content-type': CONTENT_TYPES[extname(target)] || 'application/octet-stream',
      'content-length': body.length,
      'cache-control': 'no-store'
    });
    response.end(body);
  } catch {
    sendText(response, 404, 'Not Found');
  }
}

export function createApp(store) {
  return createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const pathname = url.pathname;

    if (request.method === 'OPTIONS') {
      sendJson(response, 204, {});
      return;
    }

    if (pathname.startsWith('/preview')) {
      await servePreview(response, pathname);
      return;
    }

    try {
      if (request.method === 'GET' && pathname === '/api/v1/health') {
        sendJson(response, 200, {
          ok: true,
          service: 'campus-parcel-sync',
          time: new Date().toISOString()
        });
        return;
      }

      if (request.method === 'POST' && pathname === '/api/v1/parse') {
        const body = await readJson(request);
        const parsed = parseParcelText(body.text, {
          source: body.source || 'manual',
          sender: body.sender || '',
          occurredAt: body.occurredAt
        });
        sendJson(response, 200, { parcels: Array.isArray(parsed) ? parsed : parsed ? [parsed] : [] });
        return;
      }

      if (request.method === 'POST' && pathname === '/api/v1/pairings') {
        const pairing = store.createPairing();
        await store.save();
        sendJson(response, 201, pairing);
        return;
      }

      if (request.method === 'POST' && pathname === '/api/v1/pairings/claim') {
        const body = await readJson(request);
        const result = store.claimPairing(body.code, body.deviceName);
        await store.save();
        sendJson(response, 200, result);
        return;
      }

      const completeMatch = routeMatch(
        pathname,
        /^\/api\/v1\/pairings\/([^/]+)\/complete$/
      );
      if (request.method === 'POST' && completeMatch) {
        const body = await readJson(request);
        const result = store.completePairing(completeMatch[0], body.pairingToken);
        await store.save();
        sendJson(response, result.pending ? 202 : 200, result);
        return;
      }

      if (request.method === 'POST' && pathname === '/api/v1/parcels/sync') {
        const device = store.authenticateDevice(bearerToken(request));
        if (!device) {
          sendJson(response, 401, { error: '设备令牌无效' });
          return;
        }
        const body = await readJson(request);
        const parcels = Array.isArray(body.parcels) ? body.parcels : [];
        const saved = store.upsertParcels(device.id, parcels);
        await store.save();
        sendJson(response, 200, {
          accepted: saved.length,
          parcels: saved.map((parcel) => ({
            id: parcel.id,
            pickupCode: parcel.pickupCode,
            station: parcel.station,
            status: parcel.status
          }))
        });
        return;
      }

      if (request.method === 'GET' && pathname === '/api/v1/parcels') {
        const auth = store.authenticateSession(bearerToken(request));
        if (!auth) {
          sendJson(response, 401, { error: '会话令牌无效' });
          return;
        }
        const status = url.searchParams.get('status') || 'all';
        sendJson(response, 200, {
          parcels: store.listParcels(auth.device.id, status),
          device: {
            id: auth.device.id,
            name: auth.device.name
          }
        });
        return;
      }

      const parcelMatch = routeMatch(pathname, /^\/api\/v1\/parcels\/([^/]+)$/);
      if (request.method === 'PATCH' && parcelMatch) {
        const auth = store.authenticateSession(bearerToken(request));
        if (!auth) {
          sendJson(response, 401, { error: '会话令牌无效' });
          return;
        }
        const body = await readJson(request);
        const parcel = store.updateParcel(auth.device.id, parcelMatch[0], body);
        await store.save();
        sendJson(response, 200, { parcel });
        return;
      }

      sendJson(response, 404, { error: '接口不存在' });
    } catch (error) {
      const statusCode = /不存在|无效|过期|过大|有效 JSON/.test(error.message) ? 400 : 500;
      sendJson(response, statusCode, { error: error.message || '服务器错误' });
    }
  });
}

