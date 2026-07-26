exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (event.httpMethod === "OPTIONS") {
    return {statusCode: 204, headers, body: ""};
  }
  if (event.httpMethod !== "POST") {
    return {statusCode: 405, headers, body: "Method not allowed"};
  }

  try {
    const {gstin, plan, name, email} = JSON.parse(event.body || "{}");
    if (!gstin || !plan) {
      return {statusCode: 400, headers, body: JSON.stringify({error: "gstin and plan are required"})};
    }
    if (plan !== "growth") {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: "Only the Growth plan is self-serve. Practice-tier customers " +
            "are set up manually — see hello@fingertax.in.",
        }),
      };
    }

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    const planId = process.env.RAZORPAY_GROWTH_PLAN_ID;
    if (!keyId || !keySecret || !planId) {
      return {statusCode: 500, headers, body: JSON.stringify({error: "Razorpay env vars not configured on Netlify yet"})};
    }
    const basicAuth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

    const rpRes = await fetch("https://api.razorpay.com/v1/subscriptions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${basicAuth}`,
      },
      body: JSON.stringify({
        plan_id: planId,
        customer_notify: 1,
        // total_count is required by Razorpay. 120 monthly cycles (~10 years) is
        // a practical stand-in for "no end date" — cancel anytime, this just
        // caps the maximum possible number of cycles.
        total_count: 120,
        notes: {gstin, appName: "FingerTax"},
      }),
    });
    const rpData = await rpRes.json();
    if (!rpRes.ok) {
      return {statusCode: 500, headers, body: JSON.stringify({error: "Razorpay error", detail: rpData})};
    }

    // Record as "pending" in Supabase. The webhook function flips this to
    // "active" once Razorpay confirms the first payment actually cleared —
    // never trust the browser alone to say "I paid".
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && serviceKey) {
      await fetch(`${supabaseUrl}/rest/v1/subscriptions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": serviceKey,
          "Authorization": `Bearer ${serviceKey}`,
          "Prefer": "resolution=merge-duplicates",
        },
        body: JSON.stringify({
          gstin,
          plan,
          status: "pending",
          subscription_id: rpData.id,
          customer_name: name || "",
          customer_email: email || "",
          updated_at: new Date().toISOString(),
        }),
      });
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({subscriptionId: rpData.id, keyId}),
    };
  } catch (err) {
    return {statusCode: 500, headers, body: JSON.stringify({error: "Server error", detail: err.message})};
  }
};
