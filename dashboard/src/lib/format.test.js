import test from 'node:test';
import assert from 'node:assert/strict';
import { fmtDuration, fmtOffset, hostPath, truncateId, plural, fmtDateTime } from './format.js';

test('fmtDuration covers the ranges', () => {
  assert.equal(fmtDuration(0), '0s');
  assert.equal(fmtDuration(400), '<1s');
  assert.equal(fmtDuration(4200), '4.2s');
  assert.equal(fmtDuration(42000), '42s');
  assert.equal(fmtDuration(125000), '2m 05s');
  assert.equal(fmtDuration(4_320_000), '1h 12m');
  assert.equal(fmtDuration(-5), '–');
  assert.equal(fmtDuration(NaN), '–');
});

test('fmtOffset prefixes a plus sign', () => assert.equal(fmtOffset(1500), '+1.5s'));

test('hostPath splits valid URLs and tolerates junk', () => {
  assert.deepEqual(hostPath('https://shop.example.com/pricing?x=1#top'), { host: 'shop.example.com', path: '/pricing?x=1#top' });
  assert.deepEqual(hostPath('not a url'), { host: '', path: 'not a url' });
});

test('truncateId keeps short ids and shortens long ones', () => {
  assert.equal(truncateId('abcd1234'), 'abcd1234');
  assert.equal(truncateId('3f9a1c2e-1111-2222-3333-444455556666'), '3f9a1c2e…6666');
});

test('plural and fmtDateTime', () => {
  assert.equal(plural(1, 'click'), '1 click');
  assert.equal(plural(2, 'click'), '2 clicks');
  assert.equal(fmtDateTime('garbage'), '–');
  assert.notEqual(fmtDateTime('2026-10-13T10:01:00Z'), '–');
});
