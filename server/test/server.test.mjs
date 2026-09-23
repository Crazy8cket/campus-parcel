import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.mjs';
import { JsonStore } from '../src/store.mjs';

async function startServer() {
  const directory = await mkdtemp(join(tmpdir(), 'parcel-sync-'));
  const store = new JsonStore(join(directory, 'state.json'));
  await store.load();
  const server = createApp(store);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      await rm(directory, { recursive: true, force: true });
    }
  };
}

async function jsonRequest(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  });
  const body = await response.json();
  assert.ok(response.ok, `${response.status}: ${JSON.stringify(body)}`);
  return body;
}

test('配对、同步、查看和标记已取', async () => {
  const app = await startServer();
  try {
    const pairing = await jsonRequest(app.baseUrl, '/api/v1/pairings', {
      method: 'POST'
    });
    assert.match(pairing.code, /^\d{6}$/);

    const device = await jsonRequest(app.baseUrl, '/api/v1/pairings/claim', {
      method: 'POST',
      body: JSON.stringify({ code: pairing.code, deviceName: '测试手机' })
    });
    assert.ok(device.deviceToken);
    assert.ok(device.sessionToken);

    const completed = await jsonRequest(
      app.baseUrl,
      `/api/v1/pairings/${pairing.code}/complete`,
      {
        method: 'POST',
        body: JSON.stringify({ pairingToken: pairing.pairingToken })
      }
    );
    assert.ok(completed.sessionToken);

    const sync = await jsonRequest(app.baseUrl, '/api/v1/parcels/sync', {
      method: 'POST',
      headers: { authorization: `Bearer ${device.deviceToken}` },
      body: JSON.stringify({
        parcels: [{
          source: 'sms',
          pickupCode: '1-2-3456',
          station: '幸福路菜鸟驿站',
          courier: '菜鸟驿站',
          orderNumber: '200012345678',
          rawText: '测试短信',
          confidence: 0.95,
          occurredAt: '2026-09-22T08:00:00.000Z',
          dedupeHint: 'event-1|1-2-3456|200012345678|幸福路菜鸟驿站'
        }]
      })
    });
    assert.equal(sync.accepted, 1);

    const list = await jsonRequest(app.baseUrl, '/api/v1/parcels?status=pending', {
      headers: { authorization: `Bearer ${completed.sessionToken}` }
    });
    assert.equal(list.parcels.length, 1);
    assert.equal(list.parcels[0].pickupCode, '1-2-3456');

    const updated = await jsonRequest(
      app.baseUrl,
      `/api/v1/parcels/${list.parcels[0].id}`,
      {
        method: 'PATCH',
        headers: { authorization: `Bearer ${completed.sessionToken}` },
        body: JSON.stringify({ status: 'picked' })
      }
    );
    assert.equal(updated.parcel.status, 'picked');
  } finally {
    await app.close();
  }
});

