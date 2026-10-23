const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync('backend/worker.js', 'utf8')
  .replace('export default {', 'globalThis.__worker = {');
const sandbox = { TextEncoder, console, Date, URLSearchParams, Response, Request, Headers, crypto: globalThis.crypto };
vm.runInNewContext(source, sandbox, { filename: 'backend/worker.js' });

function createStateDb(initialEnvelope) {
  let stateJson = JSON.stringify(initialEnvelope);
  let revision = 4;
  const db = {
    get stateJson() { return stateJson; },
    prepare(sql) {
      const statement = sql.replace(/\s+/g, ' ').trim();
      let params = [];
      return {
        bind(...values) { params = values; return this; },
        async first() {
          if (statement.startsWith('SELECT state_json FROM account_state')) return { state_json: stateJson };
          if (statement.startsWith('SELECT provider_user_id FROM account_identities')) return null;
          if (statement.startsWith('SELECT revision FROM account_state')) return { revision };
          throw new Error('Unexpected fake D1 first query: ' + statement);
        },
        async run() {
          if (statement.startsWith('INSERT INTO account_state')) {
            stateJson = String(params[1]);
            revision += 1;
            return { meta: { changes: 1 } };
          }
          if (statement.startsWith('UPDATE accounts SET updated_at')) return { meta: { changes: 1 } };
          throw new Error('Unexpected fake D1 run query: ' + statement);
        }
      };
    }
  };
  return db;
}

const existing = {
  envelopeVersion: 1,
  serviceData: { schemaVersion: 4, tasks: [{ id: 'old' }] },
  personalData: { version: 1, notes: { Math: 'saved note' } },
  profileData: { activeGroup: { id: 7 }, settings: { theme: 'dark' } }
};

async function savePayload(payload) {
  const DB = createStateDb(existing);
  const incoming = sandbox.normalizeIncoming(payload);
  await sandbox.saveAccountState({ DB }, { provider: 'vk', userId: '42' }, 'tg:42', incoming);
  return JSON.parse(DB.stateJson);
}

test('legacy payload omitting personalData and profileData preserves both saved fields', async () => {
  const saved = await savePayload({ serviceData: { schemaVersion: 4, tasks: [{ id: 'new' }] } });
  assert.deepEqual(JSON.parse(JSON.stringify(saved.personalData)), existing.personalData);
  assert.deepEqual(JSON.parse(JSON.stringify(saved.profileData)), existing.profileData);
  assert.equal(saved.serviceData.tasks[0].id, 'new');
});

test('payload with personalData omitted preserves notes while accepting profile updates', async () => {
  const profileData = { activeGroup: { id: 9 }, settings: { theme: 'light' } };
  const saved = await savePayload({ serviceData: { tasks: [] }, profileData });
  assert.deepEqual(JSON.parse(JSON.stringify(saved.personalData)), existing.personalData);
  assert.deepEqual(JSON.parse(JSON.stringify(saved.profileData)), profileData);
});

test('payload with profileData omitted preserves profile while accepting note updates', async () => {
  const personalData = { version: 1, notes: { Physics: 'new note' } };
  const saved = await savePayload({ serviceData: { tasks: [] }, personalData });
  assert.deepEqual(JSON.parse(JSON.stringify(saved.profileData)), existing.profileData);
  assert.deepEqual(JSON.parse(JSON.stringify(saved.personalData.notes)), personalData.notes);
});
