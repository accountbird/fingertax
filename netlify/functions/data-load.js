// netlify/functions/data-load.js
//
// Called by the browser as: GET /.netlify/functions/data-load?key=fingertax_profile
// Header: Authorization: Bearer <Firebase ID token>

const admin = require('firebase-admin');
const { createClient } = require('@supabase/supabase-js');

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

exports.handler = async (event) => {
  if (envError) {
    console.error('Configuration error:', envError);
    return { statusCode: 500, body: JSON.stringify({ error: 'Server misconfigured', detail: envError }) };
  }

  if (event.httpMethod !== 'GET') {
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

  const key = event.queryStringParameters && event.queryStringParameters.key;
  if (!key) {
    return { statusCode: 400, body: JSON.stringify({ error: 'A "key" query parameter is required' }) };
  }

  const { data, error } = await supabaseAdmin
    .from('user_backups')
    .select('value, updated_at')
    .eq('uid', uid)
    .eq('key', key)
    .maybeSingle();

  if (error) {
    console.error('Supabase read error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Load failed', detail: error.message }) };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ value: data ? data.value : null, updatedAt: data ? data.updated_at : null }),
  };
};
