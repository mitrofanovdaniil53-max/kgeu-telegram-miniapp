const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync('backend/worker.js', 'utf8').replace('export default {', 'globalThis.__worker = {');
const sandbox = { TextEncoder, console };
vm.runInNewContext(source, sandbox, { filename: 'backend/worker.js' });

test('link merge keeps distinct tasks, deadlines, events and hostel records from both accounts', () => {
  const sourceState = { found: true, schemaVersion: 4, updatedAt: 100,
    serviceData: { updatedAt: 100, tasks: [{ id: 'tg-task', title: 'Telegram task', updatedAt: 10 }],
      deadlines: [{ id: 'tg-deadline', updatedAt: 10 }], events: [{ id: 'tg-event', updatedAt: 10 }],
      hostel: { work: [{ id: 'tg-work', updatedAt: 10 }], social: [{ id: 'tg-social', updatedAt: 10 }] } },
    personalData: { version: 1, notes: { Math: 'Telegram note' } },
    profileData: { activeGroup: { id: 1, name: 'TG group' }, settings: { theme: 'dark' } } };
  const targetState = { found: true, schemaVersion: 3, updatedAt: 200,
    serviceData: { updatedAt: 200, tasks: [{ id: 'vk-task', title: 'VK task', updatedAt: 20 }],
      deadlines: [{ id: 'vk-deadline', updatedAt: 20 }], events: [{ id: 'vk-event', updatedAt: 20 }],
      hostel: { work: [{ id: 'vk-work', updatedAt: 20 }], social: [{ id: 'vk-social', updatedAt: 20 }] } },
    personalData: { version: 1, notes: { History: 'VK note' } },
    profileData: { activeGroup: { id: 2, name: 'VK group' }, settings: { density: 'compact' } } };
  const merged = sandbox.mergeAccountSnapshots(sourceState, targetState, 300);
  assert.deepEqual(Array.from(merged.envelope.serviceData.tasks, x => x.id), ['tg-task', 'vk-task']);
  assert.deepEqual(Array.from(merged.envelope.serviceData.deadlines, x => x.id), ['tg-deadline', 'vk-deadline']);
  assert.deepEqual(Array.from(merged.envelope.serviceData.events, x => x.id), ['tg-event', 'vk-event']);
  assert.deepEqual(Array.from(merged.envelope.serviceData.hostel.work, x => x.id), ['tg-work', 'vk-work']);
  assert.deepEqual(Array.from(merged.envelope.serviceData.hostel.social, x => x.id), ['tg-social', 'vk-social']);
  assert.deepEqual(JSON.parse(JSON.stringify(merged.envelope.personalData.notes)), { Math: 'Telegram note', History: 'VK note' });
  assert.deepEqual(JSON.parse(JSON.stringify(merged.envelope.profileData.settings)), { density: 'compact', theme: 'dark' });
  assert.equal(merged.envelope.profileData.activeGroup.id, 1);
  assert.equal(merged.schemaVersion, 4);
});

test('same record ID resolves to newest updatedAt and source wins ties', () => {
  const a = { found: true, schemaVersion: 4, serviceData: { tasks: [{ id: 'same', title: 'source tie', updatedAt: 10 }] }, personalData: { notes: {} }, profileData: {} };
  const b = { found: true, schemaVersion: 4, serviceData: { tasks: [{ id: 'same', title: 'target newer', updatedAt: 11 }] }, personalData: { notes: {} }, profileData: {} };
  assert.equal(sandbox.mergeAccountSnapshots(a, b, 300).envelope.serviceData.tasks[0].title, 'target newer');
  assert.equal(sandbox.mergeAccountSnapshots(a, { ...b, serviceData: { tasks: [{ id: 'same', title: 'target tie', updatedAt: 10 }] } }, 300).envelope.serviceData.tasks[0].title, 'source tie');
});

test('merge from an empty source keeps existing target data', () => {
  const target = { found: true, schemaVersion: 2, serviceData: { tasks: [{ id: 'vk-task', title: 'keep', updatedAt: 10 }] }, personalData: { notes: {} }, profileData: {} };
  assert.equal(sandbox.mergeAccountSnapshots({ found: false, schemaVersion: 1 }, target, 300).envelope.serviceData.tasks[0].title, 'keep');
});
