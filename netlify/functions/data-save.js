// netlify/functions/data-save.js
//
// Called by the browser as: POST /.netlify/functions/data-save
// Body: { key: "fingertax_profile", value: "<json string>" }
// Header: Authorization: Bearer <Firebase ID token>
//
// Security model: the UID that gets written is ALWAYS the one decoded from
// the verified Firebase ID token — never something the client sends in the
// request body.

const admin = require('firebase-admin');
const { createClient } = require('@supabase/supabase-js');

// ---- Fail fast on missing/malformed env vars instead of letting Supabase ----
// ---- return a confusing generic error later.                            ----
function getEnvOrThrow(name) {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return v;
}

let supabaseAdmin;
let envError = null;

try {
  const SUPABASE_URL = getEnvOrThrow('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = getEnvOrThrow('SUPABASE_SERVICE_ROLE_KEY');

  // A service_role key is a JWT — it always starts with "eyJ" and has two
  // dots in it. If someone pasted a project ref or a URL fragment instead,
  // catch it here with a clear message rather than a mystery 500 later.
  if (!SUPABASE_SERVICE_ROLE_KEY.startsWith('eyJ') || (SUPABASE_SERVICE_ROLE_KEY.match(/\./g) || []).length !== 2) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY does not look like a valid JWT. ' +
      'Go to Supabase → Project Settings → API → "service_role" secret and copy that exact value (not the anon/publishable key, not the project ref/URL).'
    );
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(getEnvOrThrow('FIREBASE_SERVICE_ACCOUNT_KEY'))),
    });
  }

  supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
} catch (e) {
  envError = e.message;
}

const MAX_KEY_LEN = 100;
const MAX_VALUE_BYTES = 3 * 1024 * 1024; // 3MB per key is generous for JSON invoice data

exports.handler = async (event) => {
  if (envError) {
    console.error('Configuration error:', envError);
    return { statusCode: 500, body: JSON.stringify({ error: 'Server misconfigured', detail: envError }) };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const idToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!idToken) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Missing Authorization bearer token' }) };
  }

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(idToken);
  } catch (e) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired token' }) };
  }
  const uid = decoded.uid;

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { key, value } = body;
  if (!key || typeof key !== 'string' || key.length > MAX_KEY_LEN) {
    return { statusCode: 400, body: JSON.stringify({ error: 'A valid "key" string is required' }) };
  }
  if (typeof value !== 'string') {
    return { statusCode: 400, body: JSON.stringify({ error: '"value" must be a JSON-stringified string' }) };
  }
  if (Buffer.byteLength(value, 'utf8') > MAX_VALUE_BYTES) {
    return { statusCode: 413, body: JSON.stringify({ error: 'Value too large' }) };
  }

  const { error } = await supabaseAdmin
    .from('user_backups')
    .upsert({ uid, key, value }, { onConflict: 'uid,key' });

  if (error) {
    console.error('Supabase upsert error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Save failed', detail: error.message }) };
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
