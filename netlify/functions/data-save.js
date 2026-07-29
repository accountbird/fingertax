// netlify/functions/data-save.js
//
// Called by the browser as: POST /.netlify/functions/data-save
// Body: { key: "fingertax_profile", value: "<json string>" }
// Header: Authorization: Bearer <Firebase ID token>
//
// Security model: the UID that gets written is ALWAYS the one decoded from
// the verified Firebase ID token — never something the client sends in the
// request body. A user can only ever write their own row, even if they
// tamper with the request, because there's no "uid" field for them to
// tamper with in the first place.

const admin = require('firebase-admin');
const { createClient } = require('@supabase/supabase-js');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)),
  });
}

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MAX_KEY_LEN = 100;
const MAX_VALUE_BYTES = 3 * 1024 * 1024; // 3MB per key is generous for JSON invoice data

exports.handler = async (event) => {
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
    return { statusCode: 500, body: JSON.stringify({ error: 'Save failed' }) };
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
