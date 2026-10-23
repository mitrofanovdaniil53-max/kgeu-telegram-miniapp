const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const crypto = require('node:crypto').webcrypto;

const source = fs.readFileSync('backend/worker.js', 'utf8')
  .replace('export default {', 'globalThis.__worker = {');
const sandbox = {
  TextEncoder,
  console,
  Date,
  URLSearchParams,
  Response,
  Request,
  Headers,
  crypto,
  btoa: globalThis.btoa
};
vm.runInNewContext(source, sandbox, { filename: 'backend/worker.js' });

const APP_SECRET = 'test-only-vk-mini-app-secret';
const APP_ID = '12345678';

async function signLaunchParams(values) {
  const params = new URLSearchParams(values);
  const signedEntries = [...params.entries()]
    .filter(([key]) => key.startsWith('vk_'))
    .sort(([a], [b]) => a.localeCompare(b));
  const signedString = new URLSearchParams(signedEntries).toString();
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(APP_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signedString)
  ));
  const sign = Buffer.from(signature).toString('base64url');
  params.set('sign', sign);
  return params.toString();
}

function validFields(overrides = {}) {
  return {
    vk_app_id: APP_ID,
    vk_user_id: '424242',
    vk_ts: String(Math.floor(Date.now() / 1000)),
    vk_platform: 'android',
    ...overrides
  };
}

test('VK launch auth accepts a correctly signed, recent payload', async () => {
  const raw = await signLaunchParams(validFields());
  const result = await sandbox.validateVkLaunchParams(raw, APP_SECRET, APP_ID);
  assert.equal(result.userId, '424242');
});

test('VK launch auth rejects a changed user ID with the old signature', async () => {
  const raw = await signLaunchParams(validFields());
  const tampered = new URLSearchParams(raw);
  tampered.set('vk_user_id', '999999');
  await assert.rejects(
    sandbox.validateVkLaunchParams(tampered.toString(), APP_SECRET, APP_ID),
    /vk_auth_invalid/
  );
});

test('VK launch auth rejects a payload signed for another app ID', async () => {
  const raw = await signLaunchParams(validFields());
  await assert.rejects(
    sandbox.validateVkLaunchParams(raw, APP_SECRET, '87654321'),
    /vk_auth_invalid/
  );
});

test('VK launch auth rejects stale signed launch parameters', async () => {
  const staleTimestamp = String(Math.floor(Date.now() / 1000) - 3601);
  const raw = await signLaunchParams(validFields({ vk_ts: staleTimestamp }));
  await assert.rejects(
    sandbox.validateVkLaunchParams(raw, APP_SECRET, APP_ID),
    /vk_auth_expired/
  );
});

test('VK launch auth rejects missing signatures and missing server secret', async () => {
  const fields = validFields();
  await assert.rejects(
    sandbox.validateVkLaunchParams(new URLSearchParams(fields).toString(), APP_SECRET, APP_ID),
    /vk_auth_invalid/
  );
  const raw = await signLaunchParams(fields);
  await assert.rejects(
    sandbox.validateVkLaunchParams(raw, '', APP_ID),
    /vk_auth_unavailable/
  );
});

test('VK launch auth rejects malformed or mismatched app/user identifiers', async () => {
  const nonNumericUser = await signLaunchParams(validFields({ vk_user_id: 'user-1' }));
  await assert.rejects(
    sandbox.validateVkLaunchParams(nonNumericUser, APP_SECRET, APP_ID),
    /vk_auth_invalid/
  );
  const missingApp = await signLaunchParams(validFields({ vk_app_id: '' }));
  await assert.rejects(
    sandbox.validateVkLaunchParams(missingApp, APP_SECRET, APP_ID),
    /vk_auth_invalid/
  );
});
