const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'apps', 'vk', 'index.html'), 'utf8');

function extract(start, end) {
  const from = html.indexOf(start);
  assert.notEqual(from, -1, 'missing source marker: ' + start);
  const to = html.indexOf(end, from + start.length);
  assert.notEqual(to, -1, 'missing end marker: ' + end);
  return html.slice(from, to).trim();
}

const normalizeSource = extract('  function normalizeGroupText(value) {', '\n\n  const hasExplicitGroupFromLaunch');
const normalizeGroupText = new Function(normalizeSource + '\nreturn normalizeGroupText;')();

test('VK group labels normalize double-encoded Cyrillic launch parameters', () => {
  assert.equal(normalizeGroupText('%25D0%2598%25D0%25A6%25D0%25A2%25D0%25AD'), 'ИЦТЭ');
  assert.equal(normalizeGroupText('%D0%98%D0%A6%D0%A2%D0%AD'), 'ИЦТЭ');
  assert.equal(normalizeGroupText('ИЦТЭ'), 'ИЦТЭ');
});

test('VK group label normalization safely preserves malformed and plain values', () => {
  assert.equal(normalizeGroupText(' М-1-25 '), 'М-1-25');
  assert.equal(normalizeGroupText('%E0%A4%A'), '%E0%A4%A');
  assert.equal(normalizeGroupText(null), '');
});

test('VK light theme keeps mobile glass surfaces light even when the OS prefers dark mode', () => {
  const lightTheme = extract('    html.vk-light {', '\n    }');
  assert.match(lightTheme, /--bg2:\s*#eef2f7/i);

  // These mobile refinements deliberately consume --bg2; the light theme must own its value.
  for (const selector of [
    '.top-shell .icon-btn',
    '.tabs',
    '.saved-group',
    '.service-main-nav .service-btn',
    '.service-status.upcoming'
  ]) {
    assert.ok(html.includes(selector), 'expected mobile surface consumer: ' + selector);
  }
});

test('VK light mode overrides legacy dark glass surfaces in mobile layout', () => {
  const css = extract('<style id="vk-light-theme-mobile-surface-fix-v2">', '</style>');
  for (const selector of [
    'html.vk-light .top-shell .tabs',
    'html.vk-light .top-shell .tabs .tab.active',
    'html.vk-light .top-shell .top-actions .icon-btn',
    'html.vk-light .settings-sheet .saved-group',
    'html.vk-light .settings-sheet .density-segmented',
    'html.vk-light .service-main-nav .service-btn',
    'html.vk-light .service-page .service-status.upcoming'
  ]) assert.ok(css.includes(selector), 'missing explicit light-mode override: ' + selector);
  assert.match(css, /background:\s*#fff\s*!important/);
});

test('VK dark mode keeps mobile service controls and deadline labels dark', () => {
  const css = extract('<style id="vk-dark-theme-mobile-surface-fix-v3">', '</style>');
  for (const selector of [
    'html.vk-dark .service-main-nav .service-btn',
    'html.vk-dark .service-page .service-btn:not(.primary):not(.danger)',
    'html.vk-dark .service-page .service-status.upcoming',
    'html.vk-dark .service-page .service-pill'
  ]) assert.ok(css.includes(selector), 'missing dark-mode override: ' + selector);
  assert.match(css, /background:\s*var\(--bg2\)\s*!important/);
});
