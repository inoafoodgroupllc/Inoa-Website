// POST /api/catering-order
// Validates catering cart, writes a pending Firestore doc, creates a Square Payment Link.

import crypto from 'crypto';

const MIN_LEAD_TIME_MS = 48 * 60 * 60 * 1000;
const BOX_MINIMUM      = 5;
const INQUIRY_GUESTS   = 50;
const INQUIRY_BOXES    = 30;
const PENDING_TTL_MS   = 30 * 60 * 1000;

// Bar base prices per person (cents)
const BAR_CONFIGS = {
  'bar-poke':   { pricePerPerson: 22, min: 10, maxUpPerPerson: 10 },
  'bar-nachos': { pricePerPerson: 18, min: 10, maxUpPerPerson:  3 },
};

// Fixed-price catalog (cents) — bars handled separately
const CATALOG = {
  // Poke trays
  'tray-std-15':      12000,
  'tray-std-40':      29500,
  'tray-premium-15':  17500,
  'tray-premium-40':  44000,
  'tray-cooked-15':    9000,
  'tray-cooked-40':   22500,
  'tray-tofu-15':      6500,
  'tray-tofu-40':     16500,
  // Sides & rice
  'rice-15':           4000,
  'rice-40':          10000,
  'greens-15':         3200,
  'greens-40':         7800,
  'sides-15':          4800,
  'sides-40':         12000,
  'topping-15':        5500,
  'topping-40':       14000,
  'chips-15':          2800,
  'chips-40':          6800,
  // Musubi
  'musubi-12':         4200,
  'musubi-24':         8000,
  'musubi-36':        11400,
  // Sushi bake pans
  'bake-half-crab':    6200,
  'bake-half-salmon':  7800,
  'bake-half-ahi':     8800,
  'bake-full-crab':   11800,
  'bake-full-salmon': 14800,
  'bake-full-ahi':    16500,
  // Boxes (base price; client may add premium flavor upcharge)
  'box-poke':          2000,
  'box-musubi':        2200,
  // Personal sushi bake
  'box-bake-crab':     1200,
  'box-bake-salmon':   1500,
  'box-bake-ahi':      1700,
  // Extras
  'extra-mayo':         600,
  'extra-soy':          600,
  'extra-serviceware':  150,
  'extra-hsun':         400,
  'extra-hsun-case':   8000,
};

const DELIVERY_ZONES = {
  'Scotts Valley': { min: 20000, fee:     0 },
  'Santa Cruz':    { min: 25000, fee:  3500 },
  'Capitola':      { min: 25000, fee:  3500 },
  'Aptos':         { min: 25000, fee:  3500 },
  'Los Gatos':     { min: 50000, fee:  7500 },
  'San Jose':      { min: 50000, fee:  7500 },
  'Santa Clara':   { min: 50000, fee:  7500 },
};
const PICKUP_MIN = 20000;

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
  const body = {
    structuredQuery: {
      from: [{ collectionId }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: filters.map(([field, op, value]) => ({
            fieldFilter: { field: { fieldPath: field }, op, value },
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
  let existingBoxes = 0;
  let existingTrays = 0;

  const countFromDocs = (docs, cutoff = null) => {
    for (const doc of docs) {
      const data = fromFS(doc);
      if (cutoff !== null) {
        const createdAt = data.createdAt ? new Date(data.createdAt).getTime() : 0;
        if (createdAt < cutoff) continue;
      }
      existingBoxes += parseInt(data.boxCount || 0);
      existingTrays += parseInt(data.trayCount || 0);
    }
  };

  const [paidDocs, pendingDocs] = await Promise.all([
    fbQuery('cateringOrders', [
      ['eventDate', 'EQUAL', { stringValue: eventDate }],
      ['status',    'EQUAL', { stringValue: 'paid' }],
    ]),
    fbQuery('cateringOrders', [
      ['eventDate', 'EQUAL', { stringValue: eventDate }],
      ['status',    'EQUAL', { stringValue: 'pending' }],
    ]),
  ]);

  countFromDocs(paidDocs);
  countFromDocs(pendingDocs, Date.now() - PENDING_TTL_MS);

  return { existingBoxes, existingTrays };
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const body = req.body || {};

  // Support both new format (lineItems + customer obj) and legacy (cart + top-level fields)
  const lineItems = body.lineItems || body.cart;
  const customer  = body.customer || {};
  const name      = customer.name  || body.name  || '';
  const email     = customer.email || body.email || '';
  const phone     = customer.phone || body.phone || '';
  const { eventDate, company, notes, fulfillment, deliveryCity } = body;

  if (!eventDate || !name || !email || !phone || !Array.isArray(lineItems) || !lineItems.length) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }
  if (fulfillment === 'delivery' && !DELIVERY_ZONES[deliveryCity]) {
    return res.status(400).json({ error: 'Delivery city not recognised.' });
  }

  // ── 1. Lead time ──────────────────────────────────────────────────────────
  const eventMs = new Date(eventDate + 'T00:00:00').getTime();
  if (isNaN(eventMs) || eventMs < Date.now() + MIN_LEAD_TIME_MS) {
    return res.status(400).json({ error: 'Orders must be placed at least 48 hours before the event.' });
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
    console.error('[inoa catering] Blackout check failed:', err.message);
    return res.status(503).json({ error: 'Could not verify date availability. Please try again in a moment.' });
  }

  // ── 3. Cart validation ────────────────────────────────────────────────────
  let subtotalCents = 0;
  let totalBoxes    = 0;
  let totalTrays    = 0;
  let totalGuests   = 0;
  const validatedCart = [];

  for (const item of lineItems) {
    const qty       = Math.max(1, Math.round(item.qty || 1));
    const unitPrice = Math.round(item.unitPrice || 0);
    const category  = item.category || '';

    if (category === 'bar') {
      const barConf = BAR_CONFIGS[item.itemId];
      if (!barConf) return res.status(400).json({ error: `Unknown bar: ${item.itemId}` });
      const people = Math.max(0, parseInt(item.mods?.people || 0));
      if (people < barConf.min) {
        return res.status(400).json({ error: `${item.label} requires at least ${barConf.min} people.` });
      }
      const minPrice = people * barConf.pricePerPerson * 100;
      if (unitPrice < minPrice) {
        return res.status(400).json({ error: `Invalid price for ${item.label}.` });
      }
      totalGuests += people * qty;
    } else {
      const catalogCents = CATALOG[item.itemId];
      if (catalogCents === undefined) {
        return res.status(400).json({ error: `Unknown item: ${item.itemId}` });
      }
      if (unitPrice < catalogCents) {
        return res.status(400).json({ error: `Invalid price for ${item.label}.` });
      }
      if (category === 'box') totalBoxes += qty;
      if (category === 'tray' || category === 'side') totalTrays += qty;
    }

    subtotalCents += unitPrice * qty;
    validatedCart.push({
      itemId:    item.itemId,
      label:     String(item.label || item.itemId),
      detail:    String(item.detail || ''),
      unitPrice,
      qty,
      category,
      mods:      item.mods || {},
    });
  }

  // ── 4. Inquiry threshold ──────────────────────────────────────────────────
  if (totalGuests > INQUIRY_GUESTS || totalBoxes > INQUIRY_BOXES) {
    return res.status(400).json({ error: 'This order size requires an inquiry. Please use the inquiry form.' });
  }

  // ── 5. Box minimum ────────────────────────────────────────────────────────
  if (totalBoxes > 0 && totalBoxes < BOX_MINIMUM) {
    return res.status(400).json({ error: `Box orders require a minimum of ${BOX_MINIMUM} boxes.` });
  }

  // ── 6. Order minimum ─────────────────────────────────────────────────────
  const deliveryFee = fulfillment === 'delivery' ? (DELIVERY_ZONES[deliveryCity]?.fee || 0) : 0;
  const orderMin    = fulfillment === 'delivery' ? (DELIVERY_ZONES[deliveryCity]?.min || 0) : PICKUP_MIN;
  if (subtotalCents < orderMin) {
    const gap = ((orderMin - subtotalCents) / 100).toFixed(2);
    return res.status(400).json({ error: `Minimum order is $${(orderMin / 100).toFixed(0)} for this option. Add $${gap} more.` });
  }

  // ── 7. Daily capacity ─────────────────────────────────────────────────────
  try {
    const { existingBoxes, existingTrays } = await getExistingCapacity(eventDate);
    if (existingBoxes + totalBoxes > 40) {
      return res.status(409).json({ error: `Box capacity for ${eventDate} is full. Please choose a different date.` });
    }
    if (existingTrays + totalTrays > 12) {
      return res.status(409).json({ error: `Tray capacity for ${eventDate} is full. Please choose a different date.` });
    }
  } catch (err) {
    console.warn('[inoa catering] Capacity check failed (allowing order):', err.message);
  }

  // ── 8. Write pending order to Firestore ──────────────────────────────────
  const referenceId   = `catering_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const totalCents    = subtotalCents + deliveryFee;
  const lineItemsJson = JSON.stringify(validatedCart);

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
    boxCount:        toFS(totalBoxes),
    trayCount:       toFS(totalTrays),
    guestCount:      toFS(totalGuests),
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

  // ── 9. Square Payment Link ────────────────────────────────────────────────
  const baseUrl = process.env.SQUARE_ENV === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com';
  const siteUrl = process.env.SITE_URL || 'https://inoa.kitchen';

  const line_items = validatedCart.map(item => ({
    name:             `${item.label}${item.detail ? ' — ' + item.detail : ''}`,
    quantity:         String(item.qty),
    base_price_money: { amount: item.unitPrice, currency: 'USD' },
  }));

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
        customer_name:    name,
        customer_email:   email,
        customer_phone:   phone,
        event_date:       eventDate,
        fulfillment_type: fulfillment || 'pickup',
        ...(deliveryCity ? { delivery_city: deliveryCity } : {}),
      },
    },
    checkout_options: {
      redirect_url:             `${siteUrl}/catering/confirmed?referenceId=${encodeURIComponent(referenceId)}`,
      allow_tipping:            false,
      ask_for_shipping_address: false,
      merchant_support_email:   'clyde.ccollado@gmail.com',
    },
  };

  try {
    const squareRes  = await fetch(`${baseUrl}/v2/online-checkout/payment-links`, {
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
      paymentUrl:  squareData.payment_link.url,
      referenceId,
      orderId:     squareData.payment_link.order_id,
    });
  } catch (err) {
    console.error('[inoa catering] Unexpected error:', err);
    return res.status(500).json({ error: 'Network error creating payment link. Please try again.' });
  }
}
