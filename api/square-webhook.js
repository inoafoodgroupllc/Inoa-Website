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
      'Square-Version': '2025-01-23',
      'Content-Type': 'application/json',
    },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Square orders API ${res.status}: ${JSON.stringify(body.errors)}`);
  return body.order;
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
  } else {
    console.log('[inoa] Firestore slot marked paid:', slotDocId);
  }
}

async function sendOrderConfirmation(order, payment) {
  const formspreeId = process.env.FORMSPREE_ORDER_ID || 'mkoqdyzy';
  const meta = order.metadata || {};
  const customer = order.fulfillments?.[0]?.pickup_details?.recipient || {};

  const lineItems = (order.line_items || [])
    .map(li => `${li.name} ×${li.quantity} — $${((Number(li.base_price_money?.amount) || 0) / 100 * parseInt(li.quantity)).toFixed(2)}`)
    .join('\n');

  const totalCents = Number(order.total_money?.amount || payment.total_money?.amount || 0);

  const payload = {
    _subject:          `✅ Paid inoa Pre-Order — ${customer.display_name}`,
    customer_name:     customer.display_name,
    customer_phone:    meta.customer_phone || customer.phone_number,
    customer_email:    customer.email_address,
    fulfillment_type:  'Pickup',
    fulfillment_date:  order.reference_id?.split('_')[0],
    fulfillment_time:  (() => {
      const raw = order.fulfillments?.[0]?.pickup_details?.pickup_at;
      if (!raw) return '—';
      try {
        return new Date(raw).toLocaleString('en-US', {
          timeZone: 'America/Los_Angeles',
          weekday: 'short', month: 'short', day: 'numeric',
          hour: 'numeric', minute: '2-digit', hour12: true,
        });
      } catch (_) { return raw; }
    })(),
    pickup_address:    '100 Enterprise Way, Scotts Valley, CA 95066',
    voucher_number:    meta.voucher || 'none',
    order_items:       lineItems,
    order_total:       `$${(totalCents / 100).toFixed(2)}`,
    square_order_id:   order.id,
    square_payment_id: payment.id,
  };

  console.log('[inoa] Sending to Formspree form:', formspreeId, '| customer:', customer.display_name);
  const fsRes = await fetch(`https://formspree.io/f/${formspreeId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(payload),
  });
  const fsBody = await fsRes.json().catch(() => ({}));
  if (!fsRes.ok) {
    console.error('[inoa] Formspree error:', fsRes.status, JSON.stringify(fsBody));
  } else {
    console.log('[inoa] Formspree submission OK:', JSON.stringify(fsBody));
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody       = await getRawBody(req);
  const signature     = req.headers['x-square-hmacsha256-signature'];
  const signatureKey  = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  const notificationUrl = `${process.env.SITE_URL || 'https://inoa.kitchen'}/api/square-webhook`;

  console.log('[inoa] webhook received, event size:', rawBody.length, '| has sig:', !!signature, '| has key:', !!signatureKey);

  if (signatureKey && signature) {
    if (!verifySignature(rawBody, signature, signatureKey, notificationUrl)) {
      console.warn('[inoa] Square webhook signature mismatch — rejecting');
      return res.status(403).json({ error: 'invalid signature' });
    }
    console.log('[inoa] Signature verified OK');
  } else {
    console.warn('[inoa] Skipping signature check (key or sig missing)');
  }

  let event;
  try { event = JSON.parse(rawBody); }
  catch { return res.status(400).json({ error: 'invalid json' }); }

  console.log('[inoa] event type:', event.type, '| payment status:', event.data?.object?.payment?.status);

  if (event.type === 'payment.created' || event.type === 'payment.updated') {
    const payment = event.data?.object?.payment;
    const orderId = payment?.order_id || payment?.orderId;
    if (payment?.status === 'COMPLETED' && orderId) {
      console.log('[inoa] Processing completed payment:', payment.id, 'order:', orderId);
      try {
        const order = await fetchSquareOrder(orderId);
        console.log('[inoa] Order fetched:', order.id, '| reference_id:', order.reference_id);
        const slotDocId = order.reference_id;
        if (slotDocId) {
          await markSlotPaid(slotDocId, payment.id);
        }
        await sendOrderConfirmation(order, payment);
      } catch (err) {
        console.error('[inoa] webhook handler error:', err.message);
      }
    } else {
      console.log('[inoa] Ignoring — status not COMPLETED or no orderId');
    }
  } else {
    console.log('[inoa] Ignoring event type:', event.type);
  }

  return res.status(200).json({ received: true });
}
