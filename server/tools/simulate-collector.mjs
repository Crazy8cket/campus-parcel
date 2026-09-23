import { randomUUID } from 'node:crypto';

const baseUrl = process.env.SERVER_URL || 'http://127.0.0.1:8787';
const pairingCode = process.argv[2];

if (!pairingCode) {
  console.error('用法: node tools/simulate-collector.mjs <6位配对码>');
  process.exit(1);
}

async function call(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

const device = await call('/api/v1/pairings/claim', {
  method: 'POST',
  body: JSON.stringify({
    code: pairingCode,
    deviceName: '本地模拟采集端'
  })
});

const samples = [
  {
    text: '【菜鸟驿站】您的包裹已到幸福路菜鸟驿站，取件码 1-2-3456，请及时取件。',
    source: 'sms'
  },
  {
    text: '【丰巢】您的包裹已放入东区3号柜，请凭取件码 483920 到柜机取件。',
    source: 'notification'
  },
  {
    text: '【京东物流】您的订单号 200012345678 已到达东区校园服务中心，正在安排上架。',
    source: 'sms'
  }
];

const parcels = [];
for (const sample of samples) {
  const parsed = await call('/api/v1/parse', {
    method: 'POST',
    body: JSON.stringify(sample)
  });
  for (const parcel of parsed.parcels) {
    parcels.push({
      ...parcel,
      dedupeHint: `${parcel.station}|${parcel.pickupCode || parcel.orderNumber}|${randomUUID()}`
    });
  }
}

const result = await call('/api/v1/parcels/sync', {
  method: 'POST',
  headers: { authorization: `Bearer ${device.deviceToken}` },
  body: JSON.stringify({ parcels })
});

console.log(JSON.stringify(result, null, 2));

