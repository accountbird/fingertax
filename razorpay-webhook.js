const crypto = require("crypto");

exports.handler = async (event) => {
  const signature = event.headers["x-razorpay-signature"] || event.headers["X-Razorpay-Signature"];
  const rawBody = event.isBase64Encoded ?
    Buffer.from(event.body, "base64").toString("utf8") :
    (event.body || "");

  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return {statusCode: 500, body: "Webhook secret not configured on Netlify yet"};
  }

  const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");

  if (!signature || expectedSignature !== signature) {
    console.warn("Webhook signature mismatch — rejecting.");
    return {statusCode: 400, body: "Invalid signature"};
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    return {statusCode: 400, body: "Malformed JSON body"};
  }

  const eventType = payload.event;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  async function updateSubscriptionByGstin(gstin, fields) {
    if (!gstin || !supabaseUrl || !serviceKey) return;
    await fetch(`${supabaseUrl}/rest/v1/subscriptions?gstin=eq.${encodeURIComponent(gstin)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "apikey": serviceKey,
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({...fields, updated_at: new Date().toISOString()}),
    });
  }

  try {
    if (eventType === "subscription.activated" || eventType === "subscription.charged") {
      const sub = payload.payload.subscription.entity;
      const gstin = sub.notes && sub.notes.gstin;
      await updateSubscriptionByGstin(gstin, {
        status: "active",
        subscription_id: sub.id,
        current_period_end: sub.current_end ? new Date(sub.current_end * 1000).toISOString() : null,
      });
    } else if (
      eventType === "subscription.cancelled" ||
      eventType === "subscription.completed" ||
      eventType === "subscription.halted"
    ) {
      const sub = payload.payload.subscription.entity;
      const gstin = sub.notes && sub.notes.gstin;
      await updateSubscriptionByGstin(gstin, {status: "cancelled"});
    } else if (eventType === "payment.failed") {
      console.warn("Payment failed for payment id:", payload.payload.payment.entity.id);
      // Optional: look up the related subscription and mark status "past_due"
      // so the UI can show a "please update your payment method" banner.
    }
    return {statusCode: 200, body: "ok"};
  } catch (err) {
    console.error("Webhook processing error:", err);
    return {statusCode: 500, body: "Processing error"};
  }
};
