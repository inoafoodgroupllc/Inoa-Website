// POST /api/catering-order
// Validates catering cart, writes a pending Firestore doc, creates a Square Payment Link.
// Prices are authoritative here — client-supplied cents are ignored.

import crypto from 'crypto';

// ── Capacity constants (edit here; must mirror catering-data.js) ─────────────
const MIN_LEAD_TIME_MS      = 72 * 60 * 60 * 1000;
const MAX_BOXES_PER_DAY     = 40;
const MAX_TRAYS_PER_DAY     = 8;
const INQUIRY_CEILING_BOXES = 30;
const INQUIRY_CEILING_TRAYS = 6;
const BOX_MINIMUM           = 10;
const PENDING_TTL_MS        = 30 * 60 * 1000;

// ── Server-side price catalogue (cents) — must match catering-data.js ────────
const CATALOG = {
  // Boxes
  'box-poke-premium':   2100,
  'box-poke-std':       1700,
  'box-poke-shrimp':    1600,
  'box-musubi-premium': 2300,
  'box-musubi-std':     1900,
  'box-beef':           1600,
  'box-chicken':        1400,
  'box-tofu':           1300,
  'box-handroll':       2600,
  'box-bake-crab':      1200,
  'box-bake-salmon':    1500,
  'box-bake-shrimp':    1500,
  'box-bake-scallop':   1600,
  'box-bake-ahi':       1600,
  // Poke trays
  'tray-premium-sm':    9500,
  'tray-premium-lg':   18000,
  'tray-standard-sm':   7800,
  'tray-standard-lg':  14800,
  'tray-shrimp-sm':     7000,
  'tray-shrimp-lg':    13200,
  'tray-split-ps-sm':   8700,
  'tray-split-ps-lg':  16400,
  'tray-split-psh-sm':  8300,
  'tray-split-psh-lg': 15600,
  'tray-split-ssh-sm':  7400,
  'tray-split-ssh-lg': 14000,
  // Protein trays
  'tray-beef-sm':       7000,
  'tray-beef-lg':      13500,
  'tray-chicken-sm':    5500,
  'tray-chicken-lg':   10500,
  'tray-tofu-sm':       4500,
  'tray-tofu-lg':       8500,
  // Bases
  'base-rice-sm':       2800,
  'base-rice-lg':       5200,
  'base-greens-sm':     2200,
  'base-greens-lg':     4000,
  // Sides
  'side-crab-sm':       3600,
  'side-crab-lg':       6600,
  'side-seaweed-sm':    3800,
  'side-seaweed-lg':    7000,
  'side-kimchi-sm':     3000,
  'side-kimchi-lg':     5600,
  'side-yam-sm':        3000,
  'side-yam-lg':        5600,
  // Musubi
  'musubi-12':          4200,
  'musubi-24':          8000,
  'musubi-36':         11400,
  // Sushi bake pans
  'bake-crab-half':     6200,
  'bake-crab-full':    11800,
  'bake-salmon-half':   7800,
  'bake-salmon-full':  14800,
  'bake-shrimp-half':   7800,
  'bake-shrimp-full':  14800,
  'bake-scallop-half':  8500,
  'bake-scallop-full': 16200,
  'bake-ahi-half':      8500,
  'bake-ahi-full':     16200,
  // Sashimi
  'sash-ahi':           9500,
  'sash-salmon':        8500,
  'sash-mixed':        13000,
  // Dessert / drinks
  'mochi-each':          325,
  'mochi-20':           6000,
  'hsun-each':           400,
  'hsun-case':          8000,
};

const BOX_IDS  = new Set(Object.keys(CATALOG).filter(k => k.startsWith('box-')));
const TRAY_IDS = new Set(Object.keys(CATALOG).filter(k =>
  k.startsWith('tray-') || k.startsWith('base-') || k.startsWith('side-')
));

// ── Delivery zones (min in cents, fee in cents) ───────────────────────────────
const DELIVERY_ZONES = {
  'Scotts Valley': { min: 20000, fee:     0 },
  'Santa Cruz':    { min: 25000, fee:  3500 },
  'Capitola':      { min: 25000, fee:  3500 },
  'Aptos':         { min: 25000, fee:  3500 },
  'Los Gatos':     { min: 50000, fee:  7500 },
  'San Jose':      { min: 50000, fee:  7500 },
  'Santa Clara':   { min: 50000, fee:  7500 },
};
const PICKUP_MIN = 20000; // cents

const FB_PROJECT = 'inoa-times';
const FB_KEY     = 'AIzaSyCRMeTQKvGhRpPsSAXF69EZAdYYGths';
const FB_BASE    = `https://firestore.googleapis.com/v1/projects/${FB_PROJECT}/databases/(default)/documents`;

// ── Firestore helpers ─────────────────────────────────────────────────────────
async function fbGet(path) {
  const res = await fetch(`${FB_BASE}/${path}?key=${FB_KEY}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore GET ${path} → ${res.status}`);
  return res.json();
}

async function fbPatch(path, fields, maskFields) {
  const mask = maskFields.map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
  const res = await fetch(`${FB_BASE}/${path}?key=${FB_KEY}&${mask}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`Firestore PATCH ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function fbQuery(collectionId, filters) {
  // Simple structured query via REST
  const body = {
    structuredQuery: {
      from: [{ collectionId }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: filters.map(([field, op, value]) => ({
            fieldFilter: {
              field: { fieldPath: field },
              op,
              value,
            },
          })),
        },
      },
    },
  };
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${FB_PROJECT}/databases/(default):runQuery?key=${FB_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  if (!res.ok) throw new Error(`Firestore query → ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  return rows.filter(r => r.document).map(r => r.document);
}

function toFS(value) {
  if (typeof value === 'string')  return { stringValue: value };
  if (typeof value === 'number')  return { integerValue: String(value) };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (value === null)             return { nullValue: 'NULL_VALUE' };
  return { stringValue: String(value) };
}

function fromFS(doc) {
  const out = {};
  for (const [k, v] of Object.entries(doc.fields || {})) {
    out[k] = v.stringValue ?? v.integerValue ?? v.booleanValue ?? v.nullValue ?? null;
  }
  return out;
}

// ── Capacity check ────────────────────────────────────────────────────────────
async function getExistingCapacity(eventDate) {
  // Query paid orders for the event date
  const docs = await fbQuery('cateringOrders', [
    ['eventDate', 'EQUAL', { stringValue: eventDate }],
    ['status',    'EQUAL', { stringValue: 'paid' }],
  ]);

  let existingBoxes = 0;
  let existingTrays = 0;

  for (const doc of docs) {
    const data = fromFS(doc);
    let items = [];
    try { items = JSON.parse(data.lineItemsJson || '[]'); } catch { continue; }
    for (const item of items) {
      if (BOX_IDS.has(item.itemId))  existingBoxes += (item.qty || 1);
      if (TRAY_IDS.has(item.itemId)) existingTrays += (item.qty || 1);
    }
  }

  // Also include recent pending orders (< 30 min old) to hold capacity
  const pendingDocs = await fbQuery('cateringOrders', [
    ['eventDate', 'EQUAL', { stringValue: eventDate }],
    ['status',    'EQUAL', { stringValue: 'pending' }],
  ]);
  const cutoff = Date.now() - PENDING_TTL_MS;
  for (const doc of pendingDocs) {
    const data = fromFS(doc);
    const createdAt = data.createdAt ? new Date(data.createdAt).getTime() : 0;
    if (createdAt < cutoff) continue; // expired hold
    let items = [];
    try { items = JSON.parse(data.lineItemsJson || '[]'); } catch { continue; }
    for (const item of items) {
      if (BOX_IDS.has(item.itemId))  existingBoxes += (item.qty || 1);
      if (TRAY_IDS.has(item.itemId)) existingTrays += (item.qty || 1);
    }
  }

  return { existingBoxes, existingTrays };
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const { eventDate, name, company, email, phone, notes, fulfillment, deliveryCity, cart } = req.body || {};

  // ── Basic presence checks ─────────────────────────────────────────────────
  if (!eventDate || !name || !email || !phone || !Array.isArray(cart) || !cart.length) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }
  if (fulfillment === 'delivery' && !DELIVERY_ZONES[deliveryCity]) {
    return res.status(400).json({ error: 'Delivery city not recognised.' });
  }

  // ── 1. Lead time ──────────────────────────────────────────────────────────
  const eventMs = new Date(eventDate + 'T00:00:00').getTime();
  if (isNaN(eventMs) || eventMs < Date.now() + MIN_LEAD_TIME_MS) {
    return res.status(400).json({ error: 'Orders must be placed at least 72 hours before the event.' });
  }

  // ── 2. Blackouts ──────────────────────────────────────────────────────────
  try {
    const blackoutDoc = await fbGet('cateringConfig/blackouts');
    if (blackoutDoc) {
      const dates = (blackoutDoc.fields?.dates?.arrayValue?.values || []).map(v => v.stringValue).filter(Boolean);
      if (dates.includes(eventDate)) {
        return res.status(400).json({ error: 'That date is unavailable. Please choose another.' });
      }
    }
  } catch (err) {
    console.error('[inoa catering] Blackout check failed — refusing order:', err.message);
    return res.status(503).json({ error: 'Could not verify date availability. Please try again in a moment.' });
  }

  // ── 3. Price validation + cart counts ────────────────────────────────────
  let subtotalCents = 0;
  let totalBoxes    = 0;
  let totalTrays    = 0;
  const validatedCart = [];

  for (const item of cart) {
    const catalogCents = CATALOG[item.itemId];
    if (catalogCents === undefined) {
      return res.status(400).json({ error: `Unknown item: ${item.itemId}` });
    }
    const qty = Math.max(1, Math.round(item.qty || 1));
    subtotalCents += catalogCents * qty;
    if (BOX_IDS.has(item.itemId))  totalBoxes += qty;
    if (TRAY_IDS.has(item.itemId)) totalTrays += qty;
    validatedCart.push({ itemId: item.itemId, name: item.name, flavor: item.flavor || null, flavor2: item.flavor2 || null, cents: catalogCents, qty, category: item.category });
  }

  // ── 4. Inquiry ceiling ────────────────────────────────────────────────────
  if (totalBoxes > INQUIRY_CEILING_BOXES || totalTrays > INQUIRY_CEILING_TRAYS) {
    return res.status(400).json({ error: 'This order size requires a quote. Please use the inquiry form.' });
  }

  // ── 5. Box minimum ────────────────────────────────────────────────────────
  if (totalBoxes > 0 && totalBoxes < BOX_MINIMUM) {
    return res.status(400).json({ error: `Box orders require a minimum of ${BOX_MINIMUM} boxes.` });
  }

  // ── 6. Order minimum ─────────────────────────────────────────────────────
  const deliveryFee   = fulfillment === 'delivery' ? (DELIVERY_ZONES[deliveryCity]?.fee || 0) : 0;
  const deliveryMin   = fulfillment === 'delivery' ? (DELIVERY_ZONES[deliveryCity]?.min || 0) : PICKUP_MIN;
  if (subtotalCents < deliveryMin) {
    const gap = ((deliveryMin - subtotalCents) / 100).toFixed(2);
    return res.status(400).json({ error: `Minimum order is $${(deliveryMin / 100).toFixed(0)} for this option. Add $${gap} more.` });
  }

  // ── 7. Daily capacity ─────────────────────────────────────────────────────
  let existingBoxes = 0, existingTrays = 0;
  try {
    ({ existingBoxes, existingTrays } = await getExistingCapacity(eventDate));
  } catch (err) {
    console.warn('[inoa catering] Capacity check failed (allowing order):', err.message);
  }
  if (existingBoxes + totalBoxes > MAX_BOXES_PER_DAY) {
    return res.status(409).json({ error: `Box capacity for ${eventDate} is full. Please choose a different date or contact us.` });
  }
  if (existingTrays + totalTrays > MAX_TRAYS_PER_DAY) {
    return res.status(409).json({ error: `Tray capacity for ${eventDate} is full. Please choose a different date or contact us.` });
  }

  // ── 8. Write pending order to Firestore ──────────────────────────────────
  const referenceId = `catering_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const lineItemsJson = JSON.stringify(validatedCart);
  const totalCents = subtotalCents + deliveryFee;

  const firestoreFields = {
    status:          toFS('pending'),
    createdAt:       toFS(new Date().toISOString()),
    eventDate:       toFS(eventDate),
    customerName:    toFS(name),
    customerEmail:   toFS(email),
    customerPhone:   toFS(phone),
    company:         toFS(company || ''),
    fulfillment:     toFS(fulfillment || 'pickup'),
    deliveryCity:    toFS(deliveryCity || ''),
    deliveryFee:     toFS(deliveryFee),
    notes:           toFS(notes || ''),
    lineItemsJson:   toFS(lineItemsJson),
    subtotalCents:   toFS(subtotalCents),
    totalCents:      toFS(totalCents),
    squareOrderId:   toFS(null),
    squarePaymentId: toFS(null),
    paidAt:          toFS(null),
    emailSent:       toFS(false),
  };

  try {
    await fbPatch(`cateringOrders/${referenceId}`, firestoreFields, Object.keys(firestoreFields));
    console.log('[inoa catering] Pending order written:', referenceId);
  } catch (err) {
    console.error('[inoa catering] Firestore write failed:', err.message);
    return res.status(500).json({ error: 'Could not save your order. Please try again.' });
  }

  // ── 9. Build Square Payment Link ──────────────────────────────────────────
  const baseUrl = process.env.SQUARE_ENV === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com';
  const siteUrl = process.env.SITE_URL || 'https://inoa.kitchen';

  const line_items = validatedCart.map(item => {
    const parts = [item.flavor, item.flavor2].filter(Boolean);
    const suffix = parts.length ? ` (${parts.join(' / ')})` : '';
    return {
      name:             `${item.name}${suffix}`,
      quantity:         String(item.qty),
      base_price_money: { amount: item.cents, currency: 'USD' },
    };
  });

  if (deliveryFee > 0) {
    line_items.push({
      name:             `Delivery — ${deliveryCity}`,
      quantity:         '1',
      base_price_money: { amount: deliveryFee, currency: 'USD' },
    });
  }

  const squareBody = {
    idempotency_key: crypto.randomUUID(),
    order: {
      reference_id: referenceId,
      location_id:  process.env.SQUARE_LOCATION_ID,
      line_items,
      metadata: {
        order_type:       'catering',
        customer_email:   email,
        customer_phone:   phone,
        event_date:       eventDate,
        fulfillment_type: fulfillment || 'pickup',
        ...(deliveryCity ? { delivery_city: deliveryCity } : {}),
      },
    },
    checkout_options: {
      redirect_url:            `${siteUrl}/catering/confirmed`,
      allow_tipping:           false,
      ask_for_shipping_address: false,
      merchant_support_email:  'clyde.ccollado@gmail.com',
    },
  };

  try {
    const squareRes = await fetch(`${baseUrl}/v2/online-checkout/payment-links`, {
      method:  'POST',
      headers: {
        'Authorization':  `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
        'Content-Type':   'application/json',
        'Square-Version': '2025-01-23',
      },
      body: JSON.stringify(squareBody),
    });

    const squareData = await squareRes.json();
    console.log('[inoa catering] Square response:', squareRes.status);

    if (!squareRes.ok) {
      console.error('[inoa catering] Square error:', JSON.stringify(squareData.errors));
      return res.status(500).json({
        error:  'Could not create payment link. Please try again.',
        detail: squareData.errors?.map(e => `[${e.code}] ${e.detail}`).join(' | '),
      });
    }

    return res.status(200).json({
      url:         squareData.payment_link.url,
      referenceId,
      orderId:     squareData.payment_link.order_id,
    });

  } catch (err) {
    console.error('[inoa catering] Unexpected error:', err);
    return res.status(500).json({ error: 'Network error creating payment link. Please try again.' });
  }
}
