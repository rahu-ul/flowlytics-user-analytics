'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createOriginPolicy } = require('../src/origin');

test('configured dashboard origins are allowed (trailing slashes and case normalised)', () => {
  const p = createOriginPolicy(['http://localhost:5173', 'https://Dash.Example.com/']);
  assert.deepEqual(p.origins, ['http://localhost:5173', 'https://dash.example.com']);
  assert.equal(p.isAllowed('http://localhost:5173', 'api.example.com'), true);
  assert.equal(p.isAllowed('https://dash.example.com', 'api.example.com'), true);
});

test('unlisted browser origins are refused, including look-alikes, other ports and the null origin', () => {
  const p = createOriginPolicy(['http://localhost:5173']);
  for (const o of ['https://evil.example', 'http://localhost:5174', 'http://localhost:5173.evil.example', 'https://localhost:5173', 'null', 'not a url']) {
    assert.equal(p.isAllowed(o, 'api.example.com'), false, o);
  }
});

test('the serving host itself is allowed (single-service deployment); a different host is not', () => {
  const p = createOriginPolicy(['http://localhost:5173']);
  assert.equal(p.isAllowed('https://flowlytics.onrender.com', 'flowlytics.onrender.com'), true);
  assert.equal(p.isAllowed('https://other.onrender.com', 'flowlytics.onrender.com'), false);
  assert.equal(p.isAllowed('https://flowlytics.onrender.com', undefined), false);
});

test('requests without an Origin header are accepted (non-browser clients, same-origin polling)', () => {
  const p = createOriginPolicy([]);
  for (const o of [undefined, null, '']) assert.equal(p.isAllowed(o, 'h'), true);
});
