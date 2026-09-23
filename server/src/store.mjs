import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

function newToken() {
  return randomBytes(32).toString('base64url');
}

function createEmptyState() {
  return {
    version: 1,
    pairings: {},
    devices: {},
    sessions: {},
    parcels: {}
  };
}

function cleanParcel(input, deviceId) {
  const occurredAt = input.occurredAt && !Number.isNaN(Date.parse(input.occurredAt))
    ? new Date(input.occurredAt).toISOString()
    : new Date().toISOString();
  const pickupCode = String(input.pickupCode || '').trim().toUpperCase().slice(0, 24);
  const station = String(input.station || '').trim().slice(0, 60);
  const trackingNumber = String(input.trackingNumber || '').trim().toUpperCase().slice(0, 40);
  const orderNumber = String(input.orderNumber || '').trim().toUpperCase().slice(0, 40);
  const dedupeHint = String(input.dedupeHint || '').trim();
  const fallbackKey = [pickupCode, trackingNumber, orderNumber, station].filter(Boolean).join('|');
  const dedupeKey = (dedupeHint || fallbackKey).slice(0, 240);

  if (!dedupeKey) throw new Error('parcel has no dedupe key');

  return {
    deviceId,
    source: String(input.source || 'manual').slice(0, 32),
    sender: String(input.sender || '').slice(0, 80),
    pickupCode,
    station,
    courier: String(input.courier || '其他快递').slice(0, 32),
    trackingNumber,
    orderNumber,
    rawText: String(input.rawText || '').slice(0, 4000),
    confidence: Math.min(1, Math.max(0, Number(input.confidence) || 0)),
    occurredAt,
    dedupeKey
  };
}

export class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = createEmptyState();
    this.writeChain = Promise.resolve();
  }

  async load() {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      this.state = {
        ...createEmptyState(),
        ...parsed
      };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await this.save();
    }
  }

  async save() {
    const snapshot = JSON.stringify(this.state, null, 2);
    this.writeChain = this.writeChain.then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      const tempPath = `${this.filePath}.${process.pid}.tmp`;
      await writeFile(tempPath, snapshot, 'utf8');
      await rename(tempPath, this.filePath);
    });
    return this.writeChain;
  }

  createPairing() {
    const now = Date.now();
    for (const pairing of Object.values(this.state.pairings)) {
      if (pairing.expiresAt < now || pairing.claimedAt) {
        delete this.state.pairings[pairing.code];
      }
    }

    let code = '';
    do {
      code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    } while (this.state.pairings[code]);

    const pairingToken = newToken();
    const pairing = {
      code,
      tokenHash: hashToken(pairingToken),
      createdAt: new Date(now).toISOString(),
      expiresAt: now + 10 * 60 * 1000,
      claimedAt: null,
      deviceId: null
    };
    this.state.pairings[code] = pairing;
    return { code, pairingToken, expiresAt: new Date(pairing.expiresAt).toISOString() };
  }

  claimPairing(code, deviceName) {
    const pairing = this.state.pairings[String(code || '').trim()];
    if (!pairing || pairing.expiresAt < Date.now()) {
      throw new Error('配对码不存在或已过期');
    }
    if (pairing.claimedAt) {
      throw new Error('配对码已被使用');
    }

    const deviceId = `dev_${randomUUID()}`;
    const deviceToken = newToken();
    this.state.devices[deviceId] = {
      id: deviceId,
      name: String(deviceName || 'Android 采集端').slice(0, 80),
      tokenHash: hashToken(deviceToken),
      createdAt: new Date().toISOString()
    };
    pairing.claimedAt = new Date().toISOString();
    pairing.deviceId = deviceId;

    const sessionToken = newToken();
    this.state.sessions[hashToken(sessionToken)] = {
      deviceId,
      createdAt: new Date().toISOString()
    };

    return { deviceId, deviceToken, sessionToken };
  }

  completePairing(code, pairingToken) {
    const pairing = this.state.pairings[String(code || '').trim()];
    if (!pairing || pairing.expiresAt < Date.now()) {
      throw new Error('配对码不存在或已过期');
    }
    if (hashToken(pairingToken) !== pairing.tokenHash) {
      throw new Error('配对凭证无效');
    }
    if (!pairing.deviceId) {
      return { pending: true };
    }

    const sessionToken = newToken();
    this.state.sessions[hashToken(sessionToken)] = {
      deviceId: pairing.deviceId,
      createdAt: new Date().toISOString()
    };
    delete this.state.pairings[pairing.code];
    return {
      pending: false,
      sessionToken,
      deviceId: pairing.deviceId,
      deviceName: this.state.devices[pairing.deviceId]?.name || ''
    };
  }

  authenticateDevice(token) {
    const tokenHash = hashToken(token);
    return Object.values(this.state.devices).find(
      (device) => device.tokenHash === tokenHash
    ) || null;
  }

  authenticateSession(token) {
    const session = this.state.sessions[hashToken(token)];
    if (!session) return null;
    const device = this.state.devices[session.deviceId];
    return device ? { session, device } : null;
  }

  upsertParcels(deviceId, inputs) {
    const results = [];
    for (const input of inputs.slice(0, 100)) {
      const cleaned = cleanParcel(input, deviceId);
      const id = `par_${createHash('sha256')
        .update(`${deviceId}|${cleaned.dedupeKey}`)
        .digest('hex')
        .slice(0, 24)}`;
      const existing = this.state.parcels[id];
      const now = new Date().toISOString();
      this.state.parcels[id] = {
        id,
        ...existing,
        ...cleaned,
        status: existing?.status || 'pending',
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        pickedAt: existing?.pickedAt || null
      };
      results.push(this.state.parcels[id]);
    }
    return results;
  }

  listParcels(deviceId, status = 'all') {
    return Object.values(this.state.parcels)
      .filter((parcel) => parcel.deviceId === deviceId)
      .filter((parcel) => status === 'all' || parcel.status === status)
      .sort((a, b) => {
        const time = Date.parse(b.occurredAt) - Date.parse(a.occurredAt);
        return time || b.updatedAt.localeCompare(a.updatedAt);
      });
  }

  updateParcel(deviceId, parcelId, patch) {
    const parcel = this.state.parcels[parcelId];
    if (!parcel || parcel.deviceId !== deviceId) throw new Error('包裹不存在');
    if (patch.status && !['pending', 'picked', 'archived'].includes(patch.status)) {
      throw new Error('包裹状态无效');
    }
    if (patch.status) parcel.status = patch.status;
    if (patch.note !== undefined) parcel.note = String(patch.note).slice(0, 200);
    parcel.pickedAt = parcel.status === 'picked' ? new Date().toISOString() : null;
    parcel.updatedAt = new Date().toISOString();
    return parcel;
  }
}
