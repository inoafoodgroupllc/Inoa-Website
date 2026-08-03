// POST /api/create-payment-link
// Creates a Square hosted payment link for an inoa pre-order.
// Prices are authoritative on the server — never trust the client.

import { Client, Environment } from 'square';
import crypto from 'crypto';

// ── Authoritative price catalogue (cents) ────────────────────────────
const CATALOG = {
  1:  { name: 'Ahi Poke',                       cents: 1700 },
  3:  { name: 'Salmon Poke',                     cents: 1600 },
  5:  { name: 'Ahi Poke + Rice',                 cents: 1600 },
  7:  { name: 'Salmon Poke + Rice',              cents: 1500 },
  30: { name: 'Inoa Handroll Box',               cents: 2500 },
  28: { name: 'Salmon Belly Combo',              cents: 1800 },
  31: { name: 'Ahi Combo',                       cents: 1950 },
  29: { name: 'Poke Nachos',                     cents: 1650 },
  26: { name: 'Spam Musubi',                     cents:  400 },
  27: { name: '3 Spam Musubi',                   cents: 1000 },
  32: { name: 'Seasoned Sushi Rice',             cents:  400 },
  14: { name: 'Sliced Avocado',                  cents:  200 },
  33: { name: 'Homemade Pickled Daikon',         cents:  300 },
  34: { name: 'Side of Spicy Mayo',              cents:  200 },
  35: { name: 'Side of Sweet Soy',               cents:  200 },
  36: { name: 'Homemade Pickled Fresno Chilis',  cents:  300 },
  15: { name: 'Hawaiian Sun — Lilikoi Passion',  cents:  300 },
  16: { name: 'Hawaiian Sun — Pass-O-Guava',     cents:  300 },
  19: { name: 'Hawaiian Sun — Strawberry Guava', cents:  300 },
  37: { name: 'Water',                           cents:  200 },
};

// Parse "12:05 PM – 12:10 PM" → "2026-08-06T12:05:00-07:00"
function pickupAtISO(date, timeLabel) {
  const start = timeLabel.split('–')[0].trim();
  const m = start.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  if (!m) return `${date}T12:00:00-07:00`;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const period = m[3].toUpperCase();
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return `${date}T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00-07:00`;
}

// Parse time label → slot key used in Firestore doc ID (e.g. "1205")
function deriveSlotKey(timeLabel) {
  const start = timeLabel.split('–')[0].trim();
  const m = start.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  if (!m) return '1200';
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const period = m[3].toUpperCase();
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}${String(min).padStart(2, '0')}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const { qtys, choices, details } = req.body || {};
  if (!qtys || !details?.date || !details?.time || !details?.firstName) {
    return res.status(400).json({ error: 'missing required fields' });
  }

  const square = new Client({
    accessToken: process.env.SQUARE_ACCESS_TOKEN,
    environment: process.env.SQUARE_ENV === 'production'
      ? Environment.Production
      : Environment.Sandbox,
  });

  // ── Build line items ─────────────────────────────────────────────
  const lineItems = [];
  const discountUids = [];
  const orderDiscounts = [];

  for (const [idStr, qty] of Object.entries(qtys)) {
    if (!qty || qty < 1) continue;
    const id = parseInt(idStr);
    const item = CATALOG[id];
    if (!item) continue;

    // Collect per-unit choice labels
    const choiceNotes = [];
    for (let i = 0; i < qty; i++) {
      const c = choices?.[`${id}_${i}`];
      if (!c) continue;
      if (Array.isArray(c)) choiceNotes.push(c.join(' + '));
      else choiceNotes.push(c);
    }
    const note = choiceNotes.length > 0 ? choiceNotes.join(' / ') : null;

    lineItems.push({
      name: note ? `${item.name} (${note})` : item.name,
      quantity: String(qty),
      basePriceMoney: { amount: BigInt(item.cents), currency: 'USD' },
    });
  }

  // Free musubi (TANIKA promo) — $0 line item
  if (details.promoFreeMusubi) {
    lineItems.push({
      name: 'Spam Musubi (TANIKA — complimentary)',
      quantity: '1',
      basePriceMoney: { amount: BigInt(0), currency: 'USD' },
    });
  }

  if (!lineItems.length) return res.status(400).json({ error: 'empty cart' });

  // ── Discounts ────────────────────────────────────────────────────
  if (details.ucscStudent) {
    orderDiscounts.push({ uid: 'ucsc', name: 'UCSC Student Discount (10%)', percentage: '10', scope: 'ORDER' });
    discountUids.push('ucsc');
  }
  if (details.promoDiscount && details.promoCode) {
    const pct = String(Math.round(details.promoDiscount * 100));
    orderDiscounts.push({ uid: 'promo', name: `${details.promoCode.toUpperCase()} Promo (${pct}% off)`, percentage: pct, scope: 'ORDER' });
    discountUids.push('promo');
  }
  // Apply discount refs to every line item
  if (discountUids.length > 0) {
    for (const li of lineItems) {
      li.appliedDiscounts = discountUids.map(uid => ({ discountUid: uid }));
    }
  }

  // ── Firestore slot doc ID (used as Square order referenceId) ─────
  const slotDocId = `${details.date}_${deriveSlotKey(details.time)}`;

  // ── Create payment link ──────────────────────────────────────────
  try {
    const { result } = await square.checkoutApi.createPaymentLink({
      idempotencyKey: crypto.randomUUID(),
      order: {
        referenceId: slotDocId,
        locationId: process.env.SQUARE_LOCATION_ID,
        lineItems,
        ...(orderDiscounts.length > 0 ? { discounts: orderDiscounts } : {}),
        fulfillments: [{
          type: 'PICKUP',
          pickupDetails: {
            recipient: {
              displayName: `${details.firstName} ${details.lastName}`,
              phoneNumber: details.phone,
              emailAddress: details.email,
            },
            pickupAt: pickupAtISO(details.date, details.time),
            ...(details.notes ? { note: details.notes } : {}),
          },
        }],
        metadata: {
          slotDocId,
          voucher: details.voucher || '',
          customerPhone: details.phone,
        },
      },
      checkoutOptions: {
        redirectUrl: `${process.env.SITE_URL || 'https://inoa.kitchen'}/confirmation`,
        askForShippingAddress: false,
        merchantSupportEmail: 'clyde.ccollado@gmail.com',
      },
      prePopulatedData: {
        buyerEmail: details.email,
        buyerPhoneNumber: details.phone,
      },
    });

    return res.status(200).json({
      url:        result.paymentLink.url,
      orderId:    result.paymentLink.orderId,
      checkoutId: result.paymentLink.id,
      slotDocId,
    });
  } catch (err) {
    console.error('[inoa] Square createPaymentLink error:', err?.errors || err);
    return res.status(500).json({ error: 'failed to create payment link', detail: err?.errors?.[0]?.detail });
  }
}
