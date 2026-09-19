const MAX_BODY_BYTES = 900_000;

function corsHeaders(request) {
  const origin = request.headers.get('Origin');
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Init-Data',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json; charset=utf-8',
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
  if (Math.abs(Math.floor(Date.now() / 1000) - authDate) > maxAgeSeconds) throw new Error('telegram_init_data_expired');

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
  return { userId: String(user.id), user };
}

function normalizeIncoming(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('invalid_payload');
  const data = payload.serviceData;
  if (!data || typeof data !== 'object') throw new Error('service_data_missing');
  const encoded = JSON.stringify(data);
  if (new TextEncoder().encode(encoded).byteLength > MAX_BODY_BYTES) throw new Error('payload_too_large');
  return {
    schemaVersion: Number(payload.schemaVersion || data.schemaVersion || data.version || 1),
    deviceId: String(payload.deviceId || '').slice(0, 120),
    serviceData: data,
  };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });

    const url = new URL(request.url);
    if (url.pathname === '/api/health' && request.method === 'GET') {
      return json(request, { ok: true, service: 'kgeu-student-service', version: 'v21', database: !!env.DB });
    }

    if (url.pathname !== '/api/sync') return json(request, { error: 'not_found' }, 404);
    if (request.method !== 'POST') return json(request, { error: 'method_not_allowed' }, 405);

    try {
      if (!env.DB) throw new Error('database_not_configured');
      const initData = request.headers.get('X-Telegram-Init-Data') || '';
      const auth = await validateTelegramInitData(initData, env.TELEGRAM_BOT_TOKEN, 86400);
      const payload = await request.json();
      const incoming = normalizeIncoming(payload);
      const now = Date.now();

      await env.DB.prepare(`
        INSERT INTO student_services (telegram_user_id, service_json, schema_version, device_id, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(telegram_user_id) DO UPDATE SET
          service_json = excluded.service_json,
          schema_version = excluded.schema_version,
          device_id = excluded.device_id,
          updated_at = excluded.updated_at
      `).bind(
        auth.userId,
        JSON.stringify(incoming.serviceData),
        incoming.schemaVersion,
        incoming.deviceId,
        now
      ).run();

      return json(request, { ok: true, status: 'uploaded', userId: auth.userId, updatedAt: now });
    } catch (error) {
      const code = error && error.message ? error.message : 'server_error';
      const status = code.startsWith('telegram_') ? 401 : code === 'payload_too_large' ? 413 : 400;
      return json(request, { ok: false, error: code }, status);
    }
  }
};
