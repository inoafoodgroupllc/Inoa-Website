// POST /api/create-payment-link
// Creates a Square hosted payment link for an inoa pre-order.
// Prices are authoritative on the server — never trust the client.

import crypto from 'crypto';

// ── Authoritative price catalogue (cents) ────────────────────────────
const CATALOG = {
  // POKE BOX
  101: { name: 'Poke + Rice',             cents: 1600 },
  102: { name: 'Regular Size Poke Box',   cents: 1850 },
  103: { name: 'Large Size Poke Box',     cents: 2350 },
  104: { name: 'Handroll Box',            cents: 2500 },
  // POKE ½LB
  201: { name: 'Shoyu Ahi',               cents: 1700 },
  202: { name: 'Spicy Ahi',               cents: 1700 },
  203: { name: 'Hawaiian Ahi',            cents: 1700 },
  204: { name: 'Spicy Salmon',            cents: 1600 },
  205: { name: 'Sweet Unagi Salmon',      cents: 1600 },
  206: { name: 'Chili Garlic Salmon',     cents: 1600 },
  207: { name: 'Tobiko Scallop',          cents: 1600 },
  208: { name: 'Kimchi Tako',             cents: 1600 },
  209: { name: 'Garlic Shrimp',           cents: 1500 },
  // COMBOS
  301: { name: 'Salmon Belly Combo',      cents: 1850 },
  302: { name: 'Ahi Combo',               cents: 2000 },
  // SPECIALS
  401: { name: 'Poke Nachos',             cents: 1650 },
  402: { name: 'Poke Bombs',              cents: 1500 },
  // SIDES
  501: { name: 'Crab Mac Salad',          cents:  500 },
  502: { name: 'Seaweed Salad',           cents:  400 },
  503: { name: 'Kimchi Cucumber',         cents:  400 },
  504: { name: 'Cold Roasted Sweet Potato', cents: 400 },
  // MUSUBI
  601: { name: 'Single Musubi',           cents:  400 },
  602: { name: 'Triple Pack',             cents: 1000 },
  // ADD-ONS (standalone orderable)
  701: { name: 'Wasabi',                  cents:   75 },
  702: { name: 'Side of Spicy Mayo',      cents:  150 },
  703: { name: 'Side of Sweet Soy',       cents:  150 },
  704: { name: 'Side of Pickled Fresno Chili', cents: 200 },
  705: { name: 'Side of Takuan',          cents:  200 },
  706: { name: 'Roasted Nori Pack',       cents:  250 },
  // DRINKS
  801: { name: 'Hawaiian Sun',            cents:  300 },
};

const ADDON_PRICES = {
  'Sliced Avocado':     200,
  'Roasted Nori Pack':  250,
  'Spicy Mayo Drizzle':  50,
  'Sweet Soy Drizzle':   50,
  'Wasabi':              75,
};

// "12:05 PM – 12:10 PM" → "2026-08-06T12:05:00-07:00"
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

  const { cartItems, details } = req.body || {};
  if (!cartItems?.length || !details?.date || !details?.time || !details?.firstName) {
    return res.status(400).json({ error: 'missing required fields' });
  }

  if (!process.env.SQUARE_ACCESS_TOKEN || !process.env.SQUARE_LOCATION_ID) {
    console.error('[inoa] Missing Square env vars');
    return res.status(500).json({ error: 'server configuration error' });
  }

  try {
    // ── Build line items ───────────────────────────────────────────
    const line_items = [];
    const discount_uids = [];
    const discounts = [];

    for (const ci of cartItems) {
      const catalogItem = CATALOG[ci.itemId];
      if (!catalogItem) continue;

      let totalCents = catalogItem.cents;
      for (const addon of (ci.modifiers?.addOns || [])) {
        const addonCents = ADDON_PRICES[addon.name];
        if (addonCents !== undefined) totalCents += addonCents;
      }

      const modParts = [];
      if (ci.modifiers?.flavors?.length)  modParts.push(ci.modifiers.flavors.join(' + '));
      if (ci.modifiers?.sides?.length)    modParts.push(ci.modifiers.sides.join(', '));
      if (ci.modifiers?.fish)             modParts.push(ci.modifiers.fish);
      if (ci.modifiers?.addOns?.length)   modParts.push(ci.modifiers.addOns.map(a => `+${a.name}`).join(', '));
      const name = modParts.length > 0
        ? `${catalogItem.name} (${modParts.join(' · ')})`
        : catalogItem.name;

      line_items.push({
        name,
        quantity:         String(ci.quantity),
        base_price_money: { amount: totalCents, currency: 'USD' },
      });
    }

    if (details.promoFreeMusubi) {
      line_items.push({
        name:             'Spam Musubi (TANIKA — complimentary)',
        quantity:         '1',
        base_price_money: { amount: 0, currency: 'USD' },
      });
    }

    if (!line_items.length) return res.status(400).json({ error: 'empty cart' });

    // ── Discounts ──────────────────────────────────────────────────
    if (details.ucscStudent) {
      discounts.push({ uid: 'ucsc', name: 'UCSC Student Discount (10%)', percentage: '10', scope: 'ORDER' });
      discount_uids.push('ucsc');
    }
    if (details.promoDiscount && details.promoCode) {
      const pct = String(Math.round(details.promoDiscount * 100));
      discounts.push({ uid: 'promo', name: `${details.promoCode.toUpperCase()} Promo (${pct}% off)`, percentage: pct, scope: 'ORDER' });
      discount_uids.push('promo');
    }
    // Apply tax reference to every line item (required even with scope: ORDER)
    for (const li of line_items) {
      li.applied_taxes = [{ tax_uid: 'sales_tax' }];
    }
    if (discount_uids.length > 0) {
      for (const li of line_items) {
        li.applied_discounts = discount_uids.map(uid => ({ discount_uid: uid }));
      }
    }

    const baseUrl = process.env.SQUARE_ENV === 'production'
      ? 'https://connect.squareup.com'
      : 'https://connect.squareupsandbox.com';

    const slotDocId = `${details.date}_${deriveSlotKey(details.time)}`;

    // ── POST directly to Square REST API ──────────────────────────
    const body = {
      idempotency_key: crypto.randomUUID(),
      order: {
        reference_id: slotDocId,
        location_id: process.env.SQUARE_LOCATION_ID,
        line_items,
        taxes: [{
          uid:        'sales_tax',
          name:       'Santa Cruz County Sales Tax (9.75%)',
          type:       'ADDITIVE',
          percentage: '9.75',
          scope:      'ORDER',
        }],
        ...(discounts.length > 0 ? { discounts } : {}),
        fulfillments: [{
          type: 'PICKUP',
          pickup_details: {
            schedule_type: 'SCHEDULED',
            pickup_at: pickupAtISO(details.date, details.time),
            recipient: {
              display_name: `${details.firstName}${details.lastName ? ' ' + details.lastName : ''}`,
              ...(details.phone ? { phone_number: details.phone } : {}),
              ...(details.email ? { email_address: details.email } : {}),
            },
            ...(details.notes ? { note: details.notes } : {}),
          },
        }],
        metadata: {
          slot_doc_id: slotDocId,
          voucher: details.voucher || '',
          customer_phone: details.phone || '',
        },
      },
      checkout_options: {
        redirect_url: `${process.env.SITE_URL || 'https://inoa.kitchen'}/confirmation`,
        ask_for_shipping_address: false,
        allow_tipping: true,
        merchant_support_email: 'clyde.ccollado@gmail.com',
      },
    };

    console.log('[inoa] Square request body:', JSON.stringify(body));
    const squareRes = await fetch(`${baseUrl}/v2/online-checkout/payment-links`, {
      method:  'POST',
      headers: {
        'Authorization':  `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
        'Content-Type':   'application/json',
        'Square-Version': '2025-01-23',
      },
      body: JSON.stringify(body),
    });

    const data = await squareRes.json();
    console.log('[inoa] Square response status:', squareRes.status);

    if (!squareRes.ok) {
      console.error('[inoa] Square error:', JSON.stringify(data.errors));
      return res.status(500).json({
        error:  'failed to create payment link',
        detail: data.errors?.map(e => `[${e.code}] ${e.field}: ${e.detail}`).join(' | ') || JSON.stringify(data),
      });
    }

    return res.status(200).json({
      url:        data.payment_link.url,
      orderId:    data.payment_link.order_id,
      checkoutId: data.payment_link.id,
      slotDocId,
    });

  } catch (err) {
    console.error('[inoa] Unexpected error:', err);
    return res.status(500).json({
      error:  'failed to create payment link',
      detail: err?.message || String(err),
    });
  }
}
