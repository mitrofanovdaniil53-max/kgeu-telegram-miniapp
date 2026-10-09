const MAX_BODY_BYTES = 900_000;
const SYNC_ENVELOPE_VERSION = 1;


function corsHeaders(request) {
  const origin = request.headers.get('Origin');
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Init-Data, X-VK-Launch-Params',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  };
}

function json(request, data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders(request) });
}

function hex(buffer) {
  return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmac(keyBytes, message) {
  const key = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
}

function timingSafeEqualHex(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function validateTelegramInitData(initData, botToken, maxAgeSeconds = 86400) {
  if (!initData || !botToken) throw new Error('telegram_auth_unavailable');
  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  const authDate = Number(params.get('auth_date') || 0);
  if (!receivedHash || !authDate) throw new Error('telegram_init_data_invalid');
  if (Math.abs(Math.floor(Date.now() / 1000) - authDate) > maxAgeSeconds) {
    throw new Error('telegram_init_data_expired');
  }

  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = await hmac(new TextEncoder().encode('WebAppData'), botToken);
  const calculated = hex(await hmac(secretKey, dataCheckString));
  if (!timingSafeEqualHex(calculated, receivedHash)) throw new Error('telegram_init_data_invalid');

  let user = null;
  try { user = JSON.parse(params.get('user') || 'null'); } catch (_) {}
  if (!user || !user.id) throw new Error('telegram_user_missing');
  return { userId: String(user.id) };
}

function normalizeIncoming(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('invalid_payload');
  const data = payload.serviceData;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('service_data_missing');
  const personal = payload.personalData && typeof payload.personalData === 'object' && !Array.isArray(payload.personalData)
    ? payload.personalData : { version: 1, notes: {} };
  const profile = payload.profileData && typeof payload.profileData === 'object' && !Array.isArray(payload.profileData) ? payload.profileData : {};
  const envelope = { envelopeVersion: SYNC_ENVELOPE_VERSION, serviceData: data, personalData: personal, profileData: profile };
  if (new TextEncoder().encode(JSON.stringify(envelope)).byteLength > MAX_BODY_BYTES) {
    throw new Error('payload_too_large');
  }
  return {
    schemaVersion: Number(payload.schemaVersion || data.schemaVersion || data.version || 1),
    deviceId: String(payload.deviceId || '').slice(0, 120),
    envelope,
  };
}

function unpackStoredValue(raw) {
  let value;
  try { value = JSON.parse(raw); } catch (_) { throw new Error('stored_data_invalid'); }
  // v21 stored serviceData directly; v22 stores an envelope so subject notes travel too.
  if (value && value.envelopeVersion === SYNC_ENVELOPE_VERSION && value.serviceData && typeof value.serviceData === 'object') {
    return {
      serviceData: value.serviceData,
      personalData: value.personalData && typeof value.personalData === 'object' ? value.personalData : { version: 1, notes: {} },
      profileData: value.profileData && typeof value.profileData === 'object' ? value.profileData : {},
    };
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { serviceData: value, personalData: { version: 1, notes: {} }, profileData: {} };
  }
  throw new Error('stored_data_invalid');
}

const VK_MINI_APP_ID = '54754459';
const LINK_CODE_TTL_MS = 10 * 60 * 1000;
const LINK_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function base64Url(bytes) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function validateVkLaunchParams(raw, appSecret) {
  if (!raw || !appSecret) throw new Error('vk_auth_unavailable');
  const params = new URLSearchParams(String(raw).replace(/^\?/, ''));
  const receivedSign = params.get('sign') || '';
  const appId = params.get('vk_app_id') || '';
  const userId = params.get('vk_user_id') || '';
  if (!receivedSign || appId !== VK_MINI_APP_ID || !/^\d+$/.test(userId) || Number(userId) <= 0) {
    throw new Error('vk_auth_invalid');
  }

  const timestamp = Number(params.get('vk_ts') || 0);
  if (timestamp && Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 3600) {
    throw new Error('vk_auth_expired');
  }

  const signedEntries = [...params.entries()]
    .filter(([key]) => key.startsWith('vk_'))
    .sort(([a], [b]) => a.localeCompare(b));
  if (!signedEntries.length) throw new Error('vk_auth_invalid');
  const signedString = new URLSearchParams(signedEntries).toString();
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const calculated = base64Url(await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signedString)
  ));
  if (!timingSafeEqualHex(calculated, receivedSign)) {
    // VK signatures are base64url strings, so compare them in constant time as text.
    if (calculated.length !== receivedSign.length) throw new Error('vk_auth_invalid');
    let diff = 0;
    for (let i = 0; i < calculated.length; i++) diff |= calculated.charCodeAt(i) ^ receivedSign.charCodeAt(i);
    if (diff !== 0) throw new Error('vk_auth_invalid');
  }
  return { provider: 'vk', userId };
}

async function authenticateIdentity(request, env) {
  const telegramData = request.headers.get('X-Telegram-Init-Data') || '';
  const vkLaunchParams = request.headers.get('X-VK-Launch-Params') || '';
  if (telegramData) {
    const auth = await validateTelegramInitData(telegramData, env.TELEGRAM_BOT_TOKEN, 86400);
    return { provider: 'telegram', userId: auth.userId };
  }
  if (vkLaunchParams) return validateVkLaunchParams(vkLaunchParams, env.VK_APP_SECRET);
  throw new Error('auth_required');
}

async function resolveAccount(env, identity) {
  let row = await env.DB.prepare(
    'SELECT account_id FROM account_identities WHERE provider = ? AND provider_user_id = ? LIMIT 1'
  ).bind(identity.provider, identity.userId).first();
  if (row) return String(row.account_id);

  const accountId = (identity.provider === 'telegram' ? 'tg:' : 'vk:') + identity.userId;
  const now = Date.now();
  await env.DB.prepare(
    'INSERT OR IGNORE INTO accounts (account_id, created_at, updated_at) VALUES (?, ?, ?)'
  ).bind(accountId, now, now).run();
  await env.DB.prepare(
    'INSERT OR IGNORE INTO account_identities (provider, provider_user_id, account_id, linked_at) VALUES (?, ?, ?, ?)'
  ).bind(identity.provider, identity.userId, accountId, now).run();

  row = await env.DB.prepare(
    'SELECT account_id FROM account_identities WHERE provider = ? AND provider_user_id = ? LIMIT 1'
  ).bind(identity.provider, identity.userId).first();
  if (!row) throw new Error('account_identity_unavailable');
  return String(row.account_id);
}

async function unpackAccountState(env, accountId) {
  let row = await env.DB.prepare(
    'SELECT state_json, schema_version, revision, updated_at FROM account_state WHERE account_id = ? LIMIT 1'
  ).bind(accountId).first();

  if (!row) {
    const telegramIdentity = await env.DB.prepare(
      "SELECT provider_user_id FROM account_identities WHERE account_id = ? AND provider = 'telegram' LIMIT 1"
    ).bind(accountId).first();
    if (telegramIdentity) {
      const legacy = await env.DB.prepare(
        'SELECT service_json, schema_version, device_id, updated_at FROM student_services WHERE telegram_user_id = ? LIMIT 1'
      ).bind(String(telegramIdentity.provider_user_id)).first();
      if (legacy) {
        const unpacked = unpackStoredValue(legacy.service_json);
        const envelope = {
          envelopeVersion: SYNC_ENVELOPE_VERSION,
          serviceData: unpacked.serviceData,
          personalData: unpacked.personalData || { version: 1, notes: {} },
          profileData: unpacked.profileData || {},
        };
        const now = Number(legacy.updated_at || Date.now());
        await env.DB.prepare(
          'INSERT OR IGNORE INTO account_state (account_id, state_json, schema_version, revision, updated_at) VALUES (?, ?, ?, 1, ?)'
        ).bind(accountId, JSON.stringify(envelope), Number(legacy.schema_version || 1), now).run();
        row = await env.DB.prepare(
          'SELECT state_json, schema_version, revision, updated_at FROM account_state WHERE account_id = ? LIMIT 1'
        ).bind(accountId).first();
      }
    }
  }

  if (!row) return { found: false, updatedAt: null, revision: 0 };
  let envelope;
  try { envelope = JSON.parse(row.state_json); } catch (_) { throw new Error('stored_data_invalid'); }
  if (!envelope || typeof envelope !== 'object' || !envelope.serviceData) throw new Error('stored_data_invalid');
  return {
    found: true,
    serviceData: envelope.serviceData,
    personalData: envelope.personalData && typeof envelope.personalData === 'object' ? envelope.personalData : { version: 1, notes: {} },
    profileData: envelope.profileData && typeof envelope.profileData === 'object' ? envelope.profileData : {},
    schemaVersion: Number(row.schema_version || 1),
    revision: Number(row.revision || 1),
    updatedAt: Number(row.updated_at || 0),
  };
}

async function saveAccountState(env, identity, accountId, incoming) {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO account_state (account_id, state_json, schema_version, revision, updated_at)
     VALUES (?, ?, ?, 1, ?)
     ON CONFLICT(account_id) DO UPDATE SET
       state_json = excluded.state_json,
       schema_version = excluded.schema_version,
       revision = account_state.revision + 1,
       updated_at = excluded.updated_at`
  ).bind(accountId, JSON.stringify(incoming.envelope), incoming.schemaVersion, now).run();

  // Keep the legacy Telegram row current so old builds and rollback remain compatible.
  const telegramIdentity = await env.DB.prepare(
    "SELECT provider_user_id FROM account_identities WHERE account_id = ? AND provider = 'telegram' LIMIT 1"
  ).bind(accountId).first();
  if (telegramIdentity) {
    await env.DB.prepare(`
      INSERT INTO student_services (telegram_user_id, service_json, schema_version, device_id, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(telegram_user_id) DO UPDATE SET
        service_json = excluded.service_json,
        schema_version = excluded.schema_version,
        device_id = excluded.device_id,
        updated_at = excluded.updated_at
    `).bind(
      String(telegramIdentity.provider_user_id),
      JSON.stringify(incoming.envelope),
      incoming.schemaVersion,
      incoming.deviceId,
      now
    ).run();
  }

  const row = await env.DB.prepare(
    'SELECT revision FROM account_state WHERE account_id = ? LIMIT 1'
  ).bind(accountId).first();
  return { updatedAt: now, revision: Number(row && row.revision || 1) };
}

async function hashLinkCode(code) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(code).toUpperCase()));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateLinkCode() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let code = '';
  for (const byte of bytes) code += LINK_CODE_ALPHABET[byte % LINK_CODE_ALPHABET.length];
  return code;
}

async function createAccountLinkCode(env, identity, accountId) {
  const now = Date.now();
  await env.DB.prepare(
    'UPDATE account_link_codes SET consumed_at = ? WHERE source_account_id = ? AND consumed_at IS NULL'
  ).bind(now, accountId).run();

  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateLinkCode();
    const codeHash = await hashLinkCode(code);
    try {
      await env.DB.prepare(
        'INSERT INTO account_link_codes (code_hash, source_account_id, source_provider, expires_at, consumed_at, created_at) VALUES (?, ?, ?, ?, NULL, ?)'
      ).bind(codeHash, accountId, identity.provider, now + LINK_CODE_TTL_MS, now).run();
      return { code, expiresAt: now + LINK_CODE_TTL_MS };
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
  throw new Error('link_code_generation_failed');
}

async function consumeAccountLinkCode(env, identity, code) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/.test(normalized)) throw new Error('link_code_invalid');
  const now = Date.now();
  const codeHash = await hashLinkCode(normalized);
  const link = await env.DB.prepare(
    'SELECT source_account_id, source_provider FROM account_link_codes WHERE code_hash = ? AND consumed_at IS NULL AND expires_at > ? LIMIT 1'
  ).bind(codeHash, now).first();
  if (!link) throw new Error('link_code_expired_or_invalid');

  if (String(link.source_provider) === identity.provider) throw new Error('link_requires_other_platform');
  const sourceAccountId = String(link.source_account_id);
  const currentAccountId = await resolveAccount(env, identity);
  if (currentAccountId === sourceAccountId) {
    await env.DB.prepare(
      'UPDATE account_link_codes SET consumed_at = ? WHERE code_hash = ? AND consumed_at IS NULL'
    ).bind(now, codeHash).run();
    return { linked: true, alreadyLinked: true, accountId: sourceAccountId };
  }

  // Hydrate legacy Telegram cloud data before deciding whether the target account is empty.
  await unpackAccountState(env, currentAccountId);
  const targetState = await env.DB.prepare(
    'SELECT 1 AS has_state FROM account_state WHERE account_id = ? LIMIT 1'
  ).bind(currentAccountId).first();
  if (targetState) throw new Error('target_account_has_data');

  const existingProviderLink = await env.DB.prepare(
    'SELECT provider_user_id FROM account_identities WHERE account_id = ? AND provider = ? LIMIT 1'
  ).bind(sourceAccountId, identity.provider).first();
  if (existingProviderLink && String(existingProviderLink.provider_user_id) !== identity.userId) {
    throw new Error('provider_already_linked');
  }

  const claim = await env.DB.prepare(
    'UPDATE account_link_codes SET consumed_at = ? WHERE code_hash = ? AND consumed_at IS NULL AND expires_at > ?'
  ).bind(now, codeHash, now).run();
  if (!claim.meta || Number(claim.meta.changes || 0) !== 1) throw new Error('link_code_expired_or_invalid');

  await env.DB.prepare(
    'DELETE FROM account_identities WHERE provider = ? AND provider_user_id = ?'
  ).bind(identity.provider, identity.userId).run();
  await env.DB.prepare(
    'INSERT INTO account_identities (provider, provider_user_id, account_id, linked_at) VALUES (?, ?, ?, ?)'
  ).bind(identity.provider, identity.userId, sourceAccountId, now).run();
  await env.DB.prepare(
    'UPDATE accounts SET updated_at = ? WHERE account_id = ?'
  ).bind(now, sourceAccountId).run();

  const remaining = await env.DB.prepare(
    'SELECT 1 AS has_identity FROM account_identities WHERE account_id = ? LIMIT 1'
  ).bind(currentAccountId).first();
  if (!remaining) {
    await env.DB.prepare(
      'DELETE FROM accounts WHERE account_id = ? AND NOT EXISTS (SELECT 1 FROM account_state WHERE account_id = ?)'
    ).bind(currentAccountId, currentAccountId).run();
  }

  return { linked: true, alreadyLinked: false, accountId: sourceAccountId };
}


export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const url = new URL(request.url);
    if (url.pathname === '/api/health' && request.method === 'GET') {
      return json(request, { ok: true, service: 'kgeu-student-service', version: 'v23-shared', database: !!env.DB, vkAuthConfigured: !!env.VK_APP_SECRET });
    }

    const syncPath = url.pathname === '/api/sync';
    const mePath = url.pathname === '/api/account/me';
    const linkCodePath = url.pathname === '/api/account/link-code';
    const linkPath = url.pathname === '/api/account/link';
    if (!syncPath && !mePath && !linkCodePath && !linkPath) return json(request, { ok: false, error: 'not_found' }, 404);
    if (mePath && request.method !== 'GET') return json(request, { ok: false, error: 'method_not_allowed' }, 405);
    if ((syncPath && request.method !== 'GET' && request.method !== 'POST') ||
        ((linkCodePath || linkPath) && request.method !== 'POST')) {
      return json(request, { ok: false, error: 'method_not_allowed' }, 405);
    }

    try {
      if (!env.DB) throw new Error('database_not_configured');
      const identity = await authenticateIdentity(request, env);
      const accountId = await resolveAccount(env, identity);

      if (mePath) {
        const linked = await env.DB.prepare(
          'SELECT provider FROM account_identities WHERE account_id = ? ORDER BY provider'
        ).bind(accountId).all();
        const state = await unpackAccountState(env, accountId);
        return json(request, {
          ok: true,
          accountId,
          provider: identity.provider,
          linkedProviders: (linked.results || []).map(row => String(row.provider)),
          found: state.found,
          updatedAt: state.updatedAt,
          revision: state.revision,
        });
      }

      if (linkCodePath) {
        const result = await createAccountLinkCode(env, identity, accountId);
        return json(request, { ok: true, ...result });
      }

      if (linkPath) {
        const payload = await request.json();
        const result = await consumeAccountLinkCode(env, identity, payload && payload.code);
        return json(request, { ok: true, ...result });
      }

      if (request.method === 'GET') {
        const state = await unpackAccountState(env, accountId);
        if (!state.found) return json(request, {
          ok: true, found: false, updatedAt: null, revision: 0,
          provider: identity.provider, accountId,
        });
        const deviceId = identity.provider === 'telegram' ? String((await env.DB.prepare(
          'SELECT device_id FROM student_services WHERE telegram_user_id = ? LIMIT 1'
        ).bind(identity.userId).first())?.device_id || '') : '';
        return json(request, {
          ok: true,
          found: true,
          serviceData: state.serviceData,
          personalData: state.personalData,
          profileData: state.profileData,
          schemaVersion: state.schemaVersion,
          revision: state.revision,
          deviceId,
          provider: identity.provider,
          accountId,
          updatedAt: state.updatedAt,
        });
      }

      const payload = await request.json();
      const incoming = normalizeIncoming(payload);
      const result = await saveAccountState(env, identity, accountId, incoming);
      return json(request, {
        ok: true, status: 'uploaded', provider: identity.provider,
        accountId, updatedAt: result.updatedAt, revision: result.revision,
      });
    } catch (error) {
      const code = error && error.message ? error.message : 'server_error';
      const status = code === 'database_not_configured' || code === 'vk_auth_unavailable' ? 503
        : code.startsWith('telegram_') || code.startsWith('vk_auth') || code === 'auth_required' ? 401
        : code === 'payload_too_large' ? 413
        : code === 'target_account_has_data' || code === 'provider_already_linked' || code === 'link_requires_other_platform' ? 409
        : 400;
      return json(request, { ok: false, error: code }, status);
    }
  }
};