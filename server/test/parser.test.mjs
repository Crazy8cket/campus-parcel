import test from 'node:test';
import assert from 'node:assert/strict';
import { parseParcelText } from '../src/parser.mjs';

test('提取菜鸟驿站取件码和驿站', () => {
  const result = parseParcelText(
    '【菜鸟驿站】您的包裹已到幸福路菜鸟驿站，取件码 1-2-3456，请及时取件。',
    { source: 'sms', occurredAt: '2026-09-22T08:00:00.000Z' }
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].pickupCode, '1-2-3456');
  assert.equal(result[0].station, '幸福路菜鸟驿站');
  assert.equal(result[0].courier, '菜鸟驿站');
});

test('提取丰巢柜取件码和柜号', () => {
  const [result] = parseParcelText(
    '【丰巢】您的包裹已放入东区3号柜，请凭取件码 483920 到柜机取件。',
    { source: 'notification' }
  );
  assert.equal(result.pickupCode, '483920');
  assert.equal(result.station, '东区3号柜');
  assert.equal(result.courier, '丰巢');
});

test('一条消息中的多个取件码会拆成多条包裹', () => {
  const result = parseParcelText(
    '【兔喜生活】取件码为 16-4-9626, 15-3-2194，请到南区兔喜驿站取件。',
    { source: 'sms', eventId: 'event-1' }
  );
  assert.deepEqual(result.map((item) => item.pickupCode), ['16-4-9626', '15-3-2194']);
  assert.equal(new Set(result.map((item) => item.dedupeHint)).size, 2);
});

test('只有订单号时仍生成待出码记录', () => {
  const [result] = parseParcelText(
    '【京东物流】您的订单号 200012345678 已到达东区校园服务中心，正在安排上架。',
    { source: 'sms' }
  );
  assert.equal(result.pickupCode, '');
  assert.equal(result.orderNumber, '200012345678');
  assert.equal(result.station, '东区校园服务中心');
  assert.equal(result.courier, '京东物流');
});

test('忽略验证码和银行通知', () => {
  assert.equal(
    parseParcelText('【银行】您的支付验证码是 839201，请勿告诉他人。'),
    null
  );
  assert.equal(
    parseParcelText('您的登录校验码为 528391，5分钟内有效。'),
    null
  );
});

test('顺丰字母前缀取件码', () => {
  const [result] = parseParcelText(
    '【顺丰速运】快件已到北门丰巢柜，取件码 A-683，运单号 SF1234567890123。',
    { source: 'sms' }
  );
  assert.equal(result.pickupCode, 'A-683');
  assert.equal(result.trackingNumber, 'SF1234567890123');
  assert.equal(result.courier, '顺丰速运');
});

