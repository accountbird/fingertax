// netlify/functions/data-load.js
//
// Called by the browser as: GET /.netlify/functions/data-load?key=fingertax_profile
// Header: Authorization: Bearer <Firebase ID token>
//
// Only ever returns the row for the UID decoded from the verified token —
// there is no way for the caller to ask for another user's data.

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

exports.handler = async (event) => {
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
    return { statusCode: 500, body: JSON.stringify({ error: 'Load failed' }) };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ value: data ? data.value : null, updatedAt: data ? data.updated_at : null }),
  };
};
