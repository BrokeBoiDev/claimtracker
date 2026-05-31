import Stripe from "stripe";

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_PRICE_ID;

  if (!stripeKey || !priceId) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Stripe is not configured." })
    };
  }

  const stripe = new Stripe(stripeKey);
  let payload = {};

  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Invalid checkout request." })
    };
  }

  if (!payload.email || !payload.shopId) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Checkout needs a shop and customer email." })
    };
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: payload.email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: process.env.STRIPE_SUCCESS_URL || `${payload.siteUrl || "http://localhost:5500"}/settings?billing=success`,
      cancel_url: process.env.STRIPE_CANCEL_URL || `${payload.siteUrl || "http://localhost:5500"}/settings?billing=cancelled`,
      metadata: {
        shop_id: payload.shopId || ""
      }
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: session.url })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: error.message })
    };
  }
}
