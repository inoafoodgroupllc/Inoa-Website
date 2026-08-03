// POST /api/square-webhook
// Handles Square webhook events.
// Set SQUARE_WEBHOOK_SIGNATURE_KEY in Vercel env vars.
// Set FIREBASE_API_KEY + FIREBASE_PROJECT_ID for Firestore updates.
// Set FORMSPREE_ORDER_ID for order confirmation emails.

export const config = { api: { bodyParser: false } };

import crypto from 'crypto';

const FIREBASE_PROJECT_ID = 'inoa-times';
const FIREBASE_API_KEY    = 'AIzaSyCRMeTQKvGhRpPsSAXF69EZAdYYGths';
const SQUARE_BASE = process.env.SQUARE_ENV === 'production'
  ? 'https://connect.squareup.com'
  : 'https://connect.squareupsandbox.com';

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function verifySignature(rawBody, signature, signatureKey, notificationUrl) {
  const payload = notificationUrl + rawBody;
  const hmac = crypto.createHmac('sha256', signatureKey);
  hmac.update(payload);
  return hmac.digest('base64') === signature;
}

async function fetchSquareOrder(orderId) {
  const res = await fetch(`${SQUARE_BASE}/v2/orders/${orderId}`, {
    headers: {
      'Authorization': `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
      'Square-Version': '2024-01-18',
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Square orders API ${res.status}`);
  const { order } = await res.json();
  return order;
}

async function markSlotPaid(slotDocId, paymentId) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/slots/${encodeURIComponent(slotDocId)}`
    + `?key=${FIREBASE_API_KEY}`
    + `&updateMask.fieldPaths=status&updateMask.fieldPaths=paidAt&updateMask.fieldPaths=squarePaymentId`;

  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        status:          { stringValue: 'paid' },
        paidAt:          { timestampValue: new Date().toISOString() },
        squarePaymentId: { stringValue: paymentId },
      },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('[inoa] Firestore update failed:', err);
  }
}

async function sendOrderConfirmation(order, payment) {
  const formspreeId = process.env.FORMSPREE_ORDER_ID || 'mkoqdyzy';
  const meta = order.metadata || {};
  const customer = order.fulfillments?.[0]?.pickupDetails?.recipient || {};

  const lineItems = (order.lineItems || [])
    .map(li => `${li.name} ×${li.quantity} — $${((Number(li.basePriceMoney?.amount) || 0) / 100 * parseInt(li.quantity)).toFixed(2)}`)
    .join('\n');

  const totalCents = Number(order.totalMoney?.amount || payment.totalMoney?.amount || 0);

  await fetch(`https://formspree.io/f/${formspreeId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      _subject:         `✅ Paid inoa Pre-Order — ${customer.displayName}`,
      customer_name:    customer.displayName,
      customer_phone:   meta.customerPhone || customer.phoneNumber,
      customer_email:   customer.emailAddress,
      fulfillment_type: 'Pickup',
      fulfillment_date: order.referenceId?.split('_')[0],
      fulfillment_time: order.lineItems?.[0]?.metadata?.time || '—',
      pickup_address:   '100 Enterprise Way, Scotts Valley, CA 95066',
      voucher_number:   meta.voucher || 'none',
      order_items:      lineItems,
      order_total:      `$${(totalCents / 100).toFixed(2)}`,
      square_order_id:  order.id,
      square_payment_id: payment.id,
    }),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody  = await getRawBody(req);
  const signature = req.headers['x-square-hmacsha256-signature'];
  const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  const notificationUrl = `${process.env.SITE_URL || 'https://inoa.kitchen'}/api/square-webhook`;

  if (signatureKey && signature) {
    if (!verifySignature(rawBody, signature, signatureKey, notificationUrl)) {
      console.warn('[inoa] Square webhook signature mismatch');
      return res.status(403).json({ error: 'invalid signature' });
    }
  }

  let event;
  try { event = JSON.parse(rawBody); }
  catch { return res.status(400).json({ error: 'invalid json' }); }

  if (event.type === 'payment.updated') {
    const payment = event.data?.object?.payment;
    if (payment?.status === 'COMPLETED' && payment?.orderId) {
      try {
        const order = await fetchSquareOrder(payment.orderId);
        const slotDocId = order.referenceId;
        if (slotDocId) {
          await markSlotPaid(slotDocId, payment.id);
        }
        await sendOrderConfirmation(order, payment);
      } catch (err) {
        console.error('[inoa] webhook handler error:', err);
        // Return 200 so Square doesn't retry indefinitely
      }
    }
  }

  return res.status(200).json({ received: true });
}
