const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync('backend/worker.js', 'utf8')
  .replace('export default {', 'globalThis.__worker = {');

let upstreamCalls = 0;
const sandbox = {
  TextEncoder,
  console,
  Date,
  URL,
  URLSearchParams,
  Response,
  Request,
  Headers,
  fetch: async () => {
    upstreamCalls++;
    return new Response(JSON.stringify({ data: { lessons: [] } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
vm.runInNewContext(source, sandbox, { filename: 'backend/worker.js' });

test('schedule proxy rejects impossible calendar dates before calling upstream', async () => {
  for (const date of ['2026-02-30', '2025-02-29', '2026-13-01', '2026-00-10', 'not-a-date']) {
    upstreamCalls = 0;
    const request = new Request('https://worker.test/api/rasp?idGroup=123&sdate=' + encodeURIComponent(date));
    const response = await sandbox.__worker.fetch(request, {});
    const body = await response.json();

    assert.equal(response.status, 400, date);
    assert.equal(body.error, 'invalid_schedule_query', date);
    assert.equal(upstreamCalls, 0, date + ' must not reach the upstream API');
  }
});

test('schedule proxy accepts a valid leap-day date', async () => {
  upstreamCalls = 0;
  const request = new Request('https://worker.test/api/rasp?idGroup=123&sdate=2024-02-29');
  const response = await sandbox.__worker.fetch(request, {});
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(body)), { data: { lessons: [] } });
  assert.equal(upstreamCalls, 1);
});
