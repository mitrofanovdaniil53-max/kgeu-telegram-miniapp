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
