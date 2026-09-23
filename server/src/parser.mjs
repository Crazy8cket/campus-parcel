const PICKUP_KEYWORDS = [
  '取件验证码',
  '取件码',
  '取货码',
  '提货码',
  '提货号',
  '自提码',
  '驿站码',
  '快件码',
  '包裹码'
];

const CODE_PATTERN = String.raw`(?:[A-Za-z]{1,4}\s*[-－—]?\s*\d{2,8}|\d{1,4}(?:\s*[-－—]\s*\d{1,6}){1,4}|\d{4,8})`;

const LOGISTICS_SIGNALS = [
  '快递',
  '包裹',
  '取件',
  '取货',
  '提货',
  '驿站',
  '快递柜',
  '丰巢',
  '菜鸟',
  '兔喜',
  '物流',
  '到件',
  '派件',
  '签收'
];

const NOISE_SIGNALS = [
  '验证码',
  '校验码',
  '动态码',
  '登录密码',
  '支付密码',
  '银行',
  '余额',
  '转账',
  '消费',
  '积分兑换'
];

const COURIERS = [
  ['顺丰速运', /顺丰|SF Express|SF\d/i],
  ['京东物流', /京东物流|京东快递|京东/],
  ['中通快递', /中通/],
  ['圆通速递', /圆通/],
  ['韵达快递', /韵达/],
  ['申通快递', /申通/],
  ['极兔速递', /极兔|JT/],
  ['邮政EMS', /邮政|EMS|中国邮政/],
  ['德邦快递', /德邦/],
  ['菜鸟驿站', /菜鸟/],
  ['丰巢', /丰巢/],
  ['兔喜生活', /兔喜/]
];

function normalizeText(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/[－—–]/g, '-')
    .trim();
}

function normalizeCode(value) {
  return normalizeText(value)
    .replace(/\s+/g, '')
    .replace(/[，,、；;。]+$/g, '')
    .toUpperCase();
}

function isValidPickupCode(value) {
  const code = normalizeCode(value);
  if (code.length < 2 || code.length > 24) return false;
  if (!/^[A-Z0-9-]+$/.test(code)) return false;
  if (/^\d{4}$/.test(code)) {
    const year = Number(code.slice(0, 2));
    if (year >= 19 && year <= 30) return false;
  }
  return true;
}

function detectCourier(text, station) {
  const haystack = `${text || ''}\n${station || ''}`;
  for (const [name, pattern] of COURIERS) {
    if (pattern.test(haystack)) return name;
  }
  return '其他快递';
}

function extractPickupCodes(text) {
  const keyword = PICKUP_KEYWORDS.join('|');
  const pattern = new RegExp(
    `(?:${keyword})\\s*(?:为|是|[:：])?\\s*(${CODE_PATTERN}(?:\\s*[,，、]\\s*${CODE_PATTERN})*)`,
    'i'
  );
  const match = text.match(pattern);
  if (!match) return [];

  return [...new Set(
    match[1]
      .split(/[,，、]/)
      .map(normalizeCode)
      .filter(isValidPickupCode)
  )];
}

function cleanStation(value) {
  let station = String(value || '')
    .replace(/^[\s:：,，。；;、-]+/, '')
    .replace(/^(请|凭|到|在|至|已到|已到达|已放入|已存放至|放至)+/, '')
    .replace(/[\s:：,，。；;、]+$/, '')
    .replace(/^\[[^\]]+\]/, '')
    .trim();

  if (station.length > 40) station = station.slice(0, 40);
  if (/^(取件|取货|提货|凭取件)/.test(station)) return '';
  return station;
}

function extractStation(text) {
  const patterns = [
    /(?:已到达|已到|到达|送至|已存放至|已放入|请到|放至|位于)\s*([^，。；;\n]{2,48}?(?:菜鸟驿站|快递驿站|驿站|快递柜|丰巢柜|服务点|代收点|快递点|服务中心|校园中心|超市|便利店|门店|小区|学院|大学|号柜))/,
    /([\u4e00-\u9fa5A-Za-z0-9（）()·\-]{2,48}?(?:菜鸟驿站|快递驿站|驿站|快递柜|丰巢柜|服务点|代收点|快递点|服务中心|校园中心|超市|便利店))/,
    /([0-9A-Za-z一二三四五六七八九十]+号(?:柜|快递柜|丰巢柜))/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const station = cleanStation(match?.[1]);
    if (station) return station;
  }
  return '';
}

function extractOrderNumber(text) {
  const match = text.match(
    /(?:订单号|订单编号|订单)\s*(?:为|是|[:：])?\s*([A-Za-z0-9][A-Za-z0-9-]{7,})/i
  );
  return match ? normalizeCode(match[1]) : '';
}

function extractTrackingNumber(text) {
  const match = text.match(
    /(?:运单号|快递单号|物流单号|(?<!订)单号)\s*(?:为|是|[:：])?\s*([A-Za-z]{0,4}\d[A-Za-z0-9-]{7,})/i
  );
  return match ? normalizeCode(match[1]) : '';
}

function hasLogisticsSignal(text) {
  return LOGISTICS_SIGNALS.some((signal) => text.includes(signal));
}

function shouldIgnore(text) {
  if (!hasLogisticsSignal(text)) return true;
  const noiseCount = NOISE_SIGNALS.filter((signal) => text.includes(signal)).length;
  return noiseCount >= 2;
}

export function parseParcelText(input, options = {}) {
  const text = normalizeText(input);
  if (!text || shouldIgnore(text)) return null;

  const pickupCodes = extractPickupCodes(text);
  const station = extractStation(text);
  const orderNumber = extractOrderNumber(text);
  const trackingNumber = extractTrackingNumber(text);
  const courier = detectCourier(text, station);

  if (!pickupCodes.length && !orderNumber && !trackingNumber) return null;
  if (
    pickupCodes.length === 0 &&
    /到达|到件|派送|取件|驿站|快递柜/.test(text) === false
  ) {
    return null;
  }

  const occurredAt = options.occurredAt || new Date().toISOString();
  const base = {
    source: options.source || 'manual',
    sender: options.sender || '',
    station,
    courier,
    orderNumber,
    trackingNumber,
    occurredAt,
    rawText: text,
    confidence: pickupCodes.length ? 0.95 : 0.65
  };

  if (pickupCodes.length <= 1) {
    return [{
      ...base,
      pickupCode: pickupCodes[0] || '',
      dedupeHint: [
        options.eventId || '',
        pickupCodes[0] || '',
        trackingNumber,
        orderNumber,
        station
      ].join('|')
    }];
  }

  return pickupCodes.map((pickupCode) => ({
    ...base,
    pickupCode,
    dedupeHint: [
      options.eventId || '',
      pickupCode,
      trackingNumber,
      orderNumber,
      station
    ].join('|')
  }));
}

export function normalizeParsedParcels(input, options = {}) {
  if (!input) return [];
  return Array.isArray(input) ? input : parseParcelText(input, options);
}
