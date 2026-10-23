const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync('backend/worker.js', 'utf8')
  .replace('export default {', 'globalThis.__worker = {');
const sandbox = { TextEncoder, console, Date, URLSearchParams, Response, Request, Headers, crypto: globalThis.crypto };
vm.runInNewContext(source, sandbox, { filename: 'backend/worker.js' });

test('merge keeps distinct records across both linked accounts', () => {
  const source = {
    serviceData: {
      schemaVersion: 5,
      tasks: [{ id: 'tg-task', title: 'Telegram task' }],
      deadlines: [{ id: 'tg-deadline' }],
      events: [{ id: 'tg-event' }],
      hostel: { work: [{ id: 'tg-work' }], social: [{ id: 'tg-social' }] }
    },
    personalData: { notes: { Math: 'Telegram note' } },
    profileData: { activeGroup: { id: 1 }, settings: { theme: 'dark' } }
  };
  const target = {
    serviceData: {
      schemaVersion: 4,
      tasks: [{ id: 'vk-task', title: 'VK task' }],
      deadlines: [{ id: 'vk-deadline' }],
      events: [{ id: 'vk-event' }],
      hostel: { work: [{ id: 'vk-work' }], social: [{ id: 'vk-social' }] }
    },
    personalData: { notes: { History: 'VK note' } },
    profileData: { activeGroup: { id: 2 }, settings: { density: 'compact' } }
  };

  const merged = sandbox.mergeAccountEnvelopes(source, target);
  assert.deepEqual(Array.from(merged.serviceData.tasks, x => x.id), ['tg-task', 'vk-task']);
  assert.deepEqual(Array.from(merged.serviceData.deadlines, x => x.id), ['tg-deadline', 'vk-deadline']);
  assert.deepEqual(Array.from(merged.serviceData.events, x => x.id), ['tg-event', 'vk-event']);
  assert.deepEqual(Array.from(merged.serviceData.hostel.work, x => x.id), ['tg-work', 'vk-work']);
  assert.deepEqual(Array.from(merged.serviceData.hostel.social, x => x.id), ['tg-social', 'vk-social']);
  assert.deepEqual(JSON.parse(JSON.stringify(merged.personalData.notes)), { History: 'VK note', Math: 'Telegram note' });
  assert.deepEqual(JSON.parse(JSON.stringify(merged.profileData.settings)), { density: 'compact', theme: 'dark' });
  assert.equal(merged.profileData.activeGroup.id, 1);
  assert.equal(merged.serviceData.schemaVersion, 5);
});

test('conflicting record IDs preserve both versions and exact duplicates are deduplicated', () => {
  const source = {
    serviceData: {
      tasks: [
        { id: 'same', title: 'Telegram version' },
        { id: 'same-exact', title: 'same record' },
        { id: 'same-exact', title: 'same record' }
      ]
    },
    personalData: { notes: {} },
    profileData: {}
  };
  const target = {
    serviceData: {
      tasks: [
        { id: 'same', title: 'VK version' },
        { id: 'same-exact', title: 'same record' }
      ]
    },
    personalData: { notes: {} },
    profileData: {}
  };

  const merged = sandbox.mergeAccountEnvelopes(source, target);
  assert.deepEqual(
    Array.from(merged.serviceData.tasks, x => [x.id, x.title]),
    [['same', 'Telegram version'], ['same-exact', 'same record'], ['same-vk-tasks', 'VK version']]
  );
});

test('conflicting subject notes are preserved instead of silently overwritten', () => {
  const merged = sandbox.mergeAccountEnvelopes(
    { serviceData: {}, personalData: { notes: { Math: 'Telegram text' } }, profileData: {} },
    { serviceData: {}, personalData: { notes: { Math: 'VK text' } }, profileData: {} }
  );
  assert.deepEqual(JSON.parse(JSON.stringify(merged.personalData.notes)), {
    Math: 'VK text',
    'Math (Telegram)': 'Telegram text'
  });
});

test('empty source still preserves target state and settings', () => {
  const merged = sandbox.mergeAccountEnvelopes(
    { serviceData: {}, personalData: {}, profileData: {} },
    {
      serviceData: { tasks: [{ id: 'existing-vk-task' }], events: [] },
      personalData: { notes: { Biology: 'Keep this' } },
      profileData: { activeGroup: { id: 7 }, settings: { theme: 'light' } }
    }
  );
  assert.equal(merged.serviceData.tasks[0].id, 'existing-vk-task');
  assert.equal(merged.personalData.notes.Biology, 'Keep this');
  assert.equal(merged.profileData.activeGroup.id, 7);
  assert.equal(merged.profileData.settings.theme, 'light');
});

test('normalizeIncoming preserves and validates expected cloud revisions', () => {
  const base = { serviceData: { schemaVersion: 4, tasks: [] } };
  const legacy = sandbox.normalizeIncoming(base);
  assert.equal(legacy.hasExpectedRevision, false);
  assert.equal(legacy.expectedRevision, null);

  const initial = sandbox.normalizeIncoming({ ...base, expectedRevision: 0 });
  assert.equal(initial.hasExpectedRevision, true);
  assert.equal(initial.expectedRevision, 0);

  const later = sandbox.normalizeIncoming({ ...base, expectedRevision: 17 });
  assert.equal(later.expectedRevision, 17);

  for (const invalid of [-1, 1.5, '2', null, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => sandbox.normalizeIncoming({ ...base, expectedRevision: invalid }),
      /invalid_expected_revision/
    );
  }
});


function createLinkCodeDb() {
  const codes = [];
  const attempts = new Map();
  const identities = new Map();
  const db = {
    codes,
    attempts,
    identities,
    prepare(sql) {
      const statement = sql.replace(/\\s+/g, ' ').trim();
      let params = [];
      return {
        bind(...values) {
          params = values;
          return this;
        },
        async run() {
          if (statement.startsWith('UPDATE account_link_codes SET consumed_at = ? WHERE source_account_id = ?')) {
            let changes = 0;
            for (const row of codes) {
              if (row.sourceAccountId === String(params[1]) && row.consumedAt == null) {
                row.consumedAt = Number(params[0]);
                changes++;
              }
            }
            return { meta: { changes } };
          }
          if (statement.startsWith('INSERT INTO account_link_codes')) {
            codes.push({
              codeHash: String(params[0]),
              sourceAccountId: String(params[1]),
              sourceProvider: String(params[2]),
              expiresAt: Number(params[3]),
              consumedAt: null,
              createdAt: Number(params[4])
            });
            return { meta: { changes: 1 } };
          }
          if (statement.startsWith('INSERT INTO account_link_attempts')) {
            const key = String(params[0]) + ':' + String(params[1]);
            const now = Number(params[2]);
            const resetBefore = Number(params[3]);
            const existing = attempts.get(key);
            if (!existing || existing.windowStartedAt <= resetBefore) {
              attempts.set(key, { windowStartedAt: now, attempts: 1 });
            } else {
              existing.attempts++;
            }
            return { meta: { changes: 1 } };
          }
          if (statement.startsWith('UPDATE account_link_codes SET consumed_at = ? WHERE code_hash = ? AND consumed_at IS NULL')) {
            let changes = 0;
            for (const row of codes) {
              if (row.codeHash === String(params[1]) && row.consumedAt == null) {
                row.consumedAt = Number(params[0]);
                changes++;
              }
            }
            return { meta: { changes } };
          }
          throw new Error('Unexpected fake D1 run query: ' + statement);
        },
        async first() {
          if (statement.startsWith('SELECT attempts FROM account_link_attempts')) {
            const key = String(params[0]) + ':' + String(params[1]);
            const row = attempts.get(key);
            return row ? { attempts: row.attempts } : null;
          }
          if (statement.startsWith('SELECT source_account_id, source_provider FROM account_link_codes')) {
            const row = codes.find(item => item.codeHash === String(params[0])
              && item.consumedAt == null && item.expiresAt > Number(params[1]));
            return row ? {
              source_account_id: row.sourceAccountId,
              source_provider: row.sourceProvider
            } : null;
          }
          if (statement.startsWith('SELECT account_id FROM account_identities')) {
            const accountId = identities.get(String(params[0]) + ':' + String(params[1]));
            return accountId ? { account_id: accountId } : null;
          }
          throw new Error('Unexpected fake D1 first query: ' + statement);
        }
      };
    }
  };
  return db;
}

test('account-link codes are hashed, expire after ten minutes, and replace previous active codes', async () => {
  const DB = createLinkCodeDb();
  const env = { DB };
  const identity = { provider: 'telegram', userId: '123' };
  const before = Date.now();
  const first = await sandbox.createAccountLinkCode(env, identity, 'tg:123');
  assert.match(first.code, /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/);
  assert.notEqual(DB.codes[0].codeHash, first.code);
  assert.equal(DB.codes[0].codeHash, await sandbox.hashLinkCode(first.code));
  assert.ok(first.expiresAt >= before + 9 * 60 * 1000);
  assert.ok(first.expiresAt <= Date.now() + 10 * 60 * 1000);

  const second = await sandbox.createAccountLinkCode(env, identity, 'tg:123');
  assert.notEqual(first.code, second.code);
  assert.notEqual(DB.codes[0].consumedAt, null, 'generating a replacement invalidates the previous code');
  assert.equal(DB.codes[1].consumedAt, null);
});

test('account-link code consumption rejects malformed, expired, reused, and same-platform codes', async (t) => {
  const identity = { provider: 'vk', userId: '456' };
  await t.test('malformed code', async () => {
    await assert.rejects(
      sandbox.consumeAccountLinkCode({ DB: createLinkCodeDb() }, identity, 'bad'),
      /link_code_invalid/
    );
  });

  await t.test('expired code', async () => {
    const DB = createLinkCodeDb();
    const code = 'ABCDEFGH';
    DB.codes.push({
      codeHash: await sandbox.hashLinkCode(code),
      sourceAccountId: 'tg:123',
      sourceProvider: 'telegram',
      expiresAt: Date.now() - 1,
      consumedAt: null
    });
    await assert.rejects(
      sandbox.consumeAccountLinkCode({ DB }, identity, code),
      /link_code_expired_or_invalid/
    );
  });

  await t.test('already consumed code', async () => {
    const DB = createLinkCodeDb();
    const code = 'ABCDEFGH';
    DB.codes.push({
      codeHash: await sandbox.hashLinkCode(code),
      sourceAccountId: 'tg:123',
      sourceProvider: 'telegram',
      expiresAt: Date.now() + 60_000,
      consumedAt: Date.now()
    });
    await assert.rejects(
      sandbox.consumeAccountLinkCode({ DB }, identity, code),
      /link_code_expired_or_invalid/
    );
  });

  await t.test('same platform', async () => {
    const DB = createLinkCodeDb();
    const code = 'ABCDEFGH';
    DB.codes.push({
      codeHash: await sandbox.hashLinkCode(code),
      sourceAccountId: 'vk:123',
      sourceProvider: 'vk',
      expiresAt: Date.now() + 60_000,
      consumedAt: null
    });
    await assert.rejects(
      sandbox.consumeAccountLinkCode({ DB }, identity, code),
      /link_requires_other_platform/
    );
  });
});

test('account-link code is consumed after linking and cannot be reused', async () => {
  const DB = createLinkCodeDb();
  const env = { DB };
  const telegramIdentity = { provider: 'telegram', userId: '123' };
  const vkIdentity = { provider: 'vk', userId: '456' };
  const generated = await sandbox.createAccountLinkCode(env, telegramIdentity, 'tg:123');
  DB.identities.set('vk:456', 'tg:123');

  const result = await sandbox.consumeAccountLinkCode(env, vkIdentity, generated.code);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    linked: true,
    alreadyLinked: true,
    accountId: 'tg:123'
  });
  assert.notEqual(DB.codes[0].consumedAt, null);
  await assert.rejects(
    sandbox.consumeAccountLinkCode(env, vkIdentity, generated.code),
    /link_code_expired_or_invalid/
  );
});

test('account-link code attempts are rate-limited after ten attempts in the window', async () => {
  const env = { DB: createLinkCodeDb() };
  const identity = { provider: 'vk', userId: '456' };
  for (let i = 0; i < 10; i++) {
    await assert.rejects(
      sandbox.consumeAccountLinkCode(env, identity, 'bad'),
      /link_code_invalid/
    );
  }
  await assert.rejects(
    sandbox.consumeAccountLinkCode(env, identity, 'bad'),
    /link_rate_limited/
  );
});


function createRevisionDb(initialEnvelope, initialRevision) {
  let stateJson = initialEnvelope == null ? null : JSON.stringify(initialEnvelope);
  let revision = initialRevision;
  const db = {
    get stateJson() { return stateJson; },
    get revision() { return revision; },
    prepare(sql) {
      const statement = sql.replace(/\s+/g, ' ').trim();
      let params = [];
      return {
        bind(...values) { params = values; return this; },
        async first() {
          if (statement.startsWith('SELECT state_json FROM account_state')) {
            return stateJson == null ? null : { state_json: stateJson };
          }
          if (statement.startsWith('SELECT revision FROM account_state')) {
            return stateJson == null ? null : { revision };
          }
          if (statement.startsWith('SELECT provider_user_id FROM account_identities')) return null;
          throw new Error('Unexpected fake D1 first query: ' + statement);
        },
        async run() {
          if (statement.startsWith('INSERT INTO account_state') && statement.includes('SELECT ?, ?, ?, 1, ?')) {
            const expectedRevision = Number(params[4]);
            const canInsert = stateJson == null && expectedRevision === 0;
            const canUpdate = stateJson != null && revision === expectedRevision;
            if (!canInsert && !canUpdate) return { meta: { changes: 0 } };
            stateJson = String(params[1]);
            revision = canInsert ? 1 : revision + 1;
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

test('saveAccountState rejects a stale expected revision without overwriting cloud state', async () => {
  const existing = {
    envelopeVersion: 1,
    serviceData: { schemaVersion: 4, tasks: [{ id: 'newer-cloud-task' }] },
    personalData: { version: 1, notes: { Math: 'cloud note' } },
    profileData: { activeGroup: { id: 7 }, settings: { theme: 'dark' } }
  };
  const DB = createRevisionDb(existing, 5);
  const incoming = sandbox.normalizeIncoming({
    serviceData: { schemaVersion: 4, tasks: [{ id: 'stale-device-task' }] },
    expectedRevision: 4
  });

  await assert.rejects(
    sandbox.saveAccountState({ DB }, { provider: 'vk', userId: '42' }, 'tg:42', incoming),
    /sync_revision_conflict/
  );
  assert.equal(DB.revision, 5);
  assert.deepEqual(JSON.parse(DB.stateJson), existing);
});

test('saveAccountState advances the revision when the client revision matches', async () => {
  const existing = {
    envelopeVersion: 1,
    serviceData: { schemaVersion: 4, tasks: [{ id: 'old-task' }] },
    personalData: { version: 1, notes: { Math: 'keep this note' } },
    profileData: { activeGroup: { id: 7 }, settings: { theme: 'dark' } }
  };
  const DB = createRevisionDb(existing, 5);
  const incoming = sandbox.normalizeIncoming({
    serviceData: { schemaVersion: 4, tasks: [{ id: 'updated-task' }] },
    expectedRevision: 5
  });

  const result = await sandbox.saveAccountState({ DB }, { provider: 'vk', userId: '42' }, 'tg:42', incoming);
  const saved = JSON.parse(DB.stateJson);
  assert.equal(result.revision, 6);
  assert.equal(DB.revision, 6);
  assert.equal(saved.serviceData.tasks[0].id, 'updated-task');
  assert.deepEqual(saved.personalData, existing.personalData);
  assert.deepEqual(saved.profileData, existing.profileData);
});

test('saveAccountState allows a first write only when the expected revision is zero', async () => {
  const DB = createRevisionDb(null, 0);
  const incoming = sandbox.normalizeIncoming({
    serviceData: { schemaVersion: 4, tasks: [{ id: 'first-task' }] },
    personalData: { version: 1, notes: {} },
    profileData: {},
    expectedRevision: 0
  });

  const result = await sandbox.saveAccountState({ DB }, { provider: 'vk', userId: '42' }, 'vk:42', incoming);
  assert.equal(result.revision, 1);
  assert.equal(DB.revision, 1);
  assert.equal(JSON.parse(DB.stateJson).serviceData.tasks[0].id, 'first-task');
});
