// POST /api/pay
// Creates a Square Order then charges the card token from the Web Payments SDK.
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
  501: { name: 'Crab Mac Salad',          cents:  600 },
  502: { name: 'Seaweed Salad',           cents:  500 },
  503: { name: 'Kimchi Cucumber',         cents:  500 },
  504: { name: 'Cold Roasted Sweet Potato', cents: 500 },
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
  707: { name: 'Seasoned Sushi Rice',    cents:  400 },
  // DRINKS
  801: { name: 'Hawaiian Sun',            cents:  300 },
};

const ADDON_PRICES = {
  'Sliced Avocado':      200,
  'Roasted Nori Pack':   250,
  'Spicy Mayo Drizzle':   50,
  'Sweet Soy Drizzle':    50,
  'Wasabi':               75,
};

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

  const { cartItems, details, sourceId, tipCents = 0 } = req.body || {};
  if (!cartItems?.length || !details?.date || !details?.time || !details?.firstName || !sourceId) {
    return res.status(400).json({ error: 'missing required fields' });
  }

  if (!process.env.SQUARE_ACCESS_TOKEN || !process.env.SQUARE_LOCATION_ID) {
    console.error('[inoa] Missing Square env vars');
    return res.status(500).json({ error: 'server configuration error' });
  }

  try {
    // ── Build line items ───────────────────────────────────────────
    const line_items = [];

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
    const discounts = [];
    if (details.ucscStudent) {
      discounts.push({ uid: 'ucsc', name: 'UCSC Student Discount (10%)', type: 'FIXED_PERCENTAGE', percentage: '10', scope: 'ORDER' });
    }
    if (details.promoDiscount && details.promoCode) {
      const pct = String(Math.round(details.promoDiscount * 100));
      discounts.push({ uid: 'promo', name: `${details.promoCode.toUpperCase()} Promo (${pct}% off)`, type: 'FIXED_PERCENTAGE', percentage: pct, scope: 'ORDER' });
    }

    const baseUrl = process.env.SQUARE_ENV === 'production'
      ? 'https://connect.squareup.com'
      : 'https://connect.squareupsandbox.com';

    const slotDocId = `${details.date}_${deriveSlotKey(details.time)}`;

    // ── Create Square Order ────────────────────────────────────────
    const orderBody = {
      idempotency_key: crypto.randomUUID(),
      order: {
        reference_id: slotDocId,
        location_id:  process.env.SQUARE_LOCATION_ID,
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
          ...(details.voucher ? { voucher:        details.voucher } : {}),
          ...(details.phone   ? { customer_phone: details.phone   } : {}),
        },
      },
    };

    console.log('[inoa] Creating Square order...');
    const orderRes = await fetch(`${baseUrl}/v2/orders`, {
      method:  'POST',
      headers: {
        'Authorization':  `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
        'Content-Type':   'application/json',
        'Square-Version': '2025-01-23',
      },
      body: JSON.stringify(orderBody),
    });

    const orderData = await orderRes.json();
    if (!orderRes.ok) {
      console.error('[inoa] Square order error:', JSON.stringify(orderData.errors));
      return res.status(500).json({
        error:  'failed to create order',
        detail: orderData.errors?.map(e => `[${e.code}] ${e.field}: ${e.detail}`).join(' | ') || JSON.stringify(orderData),
      });
    }

    const order = orderData.order;
    const orderAmountCents = order.total_money.amount; // Square-calculated total (tax + discounts applied)

    // ── Charge card ────────────────────────────────────────────────
    const paymentBody = {
      idempotency_key: crypto.randomUUID(),
      source_id:       sourceId,
      amount_money:    { amount: orderAmountCents, currency: 'USD' },
      order_id:        order.id,
      ...(tipCents > 0 ? { tip_money: { amount: tipCents, currency: 'USD' } } : {}),
    };

    console.log('[inoa] Charging card for order:', order.id, 'amount:', orderAmountCents, 'tip:', tipCents);
    const paymentRes = await fetch(`${baseUrl}/v2/payments`, {
      method:  'POST',
      headers: {
        'Authorization':  `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
        'Content-Type':   'application/json',
        'Square-Version': '2025-01-23',
      },
      body: JSON.stringify(paymentBody),
    });

    const paymentData = await paymentRes.json();
    if (!paymentRes.ok) {
      console.error('[inoa] Square payment error:', JSON.stringify(paymentData.errors));
      return res.status(500).json({
        error:  'payment failed',
        detail: paymentData.errors?.map(e => `[${e.code}] ${e.field}: ${e.detail}`).join(' | ') || JSON.stringify(paymentData),
      });
    }

    const payment = paymentData.payment;

    // ── Mark slot paid in Firestore ────────────────────────────────
    try {
      const FIREBASE_PROJECT_ID = 'inoa-times';
      const FIREBASE_API_KEY    = 'AIzaSyCRMeTQKvGhRpPsSAXF69EZAdYYGths';
      const slotUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/slots/${encodeURIComponent(slotDocId)}`
        + `?key=${FIREBASE_API_KEY}`
        + `&updateMask.fieldPaths=status&updateMask.fieldPaths=paidAt&updateMask.fieldPaths=squarePaymentId`;
      const fsSlotRes = await fetch(slotUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            status:          { stringValue: 'paid' },
            paidAt:          { timestampValue: new Date().toISOString() },
            squarePaymentId: { stringValue: payment.id },
          },
        }),
      });
      if (!fsSlotRes.ok) {
        console.error('[inoa] Firestore slot update failed:', await fsSlotRes.text());
      } else {
        console.log('[inoa] Slot marked paid:', slotDocId);
      }
    } catch (slotErr) {
      console.error('[inoa] Firestore slot update error (non-fatal):', slotErr?.message);
    }

    // ── Send order confirmation email via Formspree ─────────────────
    try {
      const formspreeId = process.env.FORMSPREE_ORDER_ID || 'mkoqdyzy';
      const meta     = order.metadata || {};
      const customer = order.fulfillments?.[0]?.pickup_details?.recipient || {};
      const lineItems = (order.line_items || [])
        .map(li => `${li.name} ×${li.quantity} — $${((Number(li.base_price_money?.amount) || 0) / 100 * parseInt(li.quantity)).toFixed(2)}`)
        .join('\n');
      const raw = order.fulfillments?.[0]?.pickup_details?.pickup_at;
      const fulfillmentTime = raw ? (() => {
        try {
          return new Date(raw).toLocaleString('en-US', {
            timeZone: 'America/Los_Angeles',
            weekday: 'short', month: 'short', day: 'numeric',
            hour: 'numeric', minute: '2-digit', hour12: true,
          });
        } catch (_) { return raw; }
      })() : '—';

      const emailPayload = {
        _subject:          `✅ Paid inoa Pre-Order — ${customer.display_name}`,
        customer_name:     customer.display_name,
        customer_phone:    meta.customer_phone || customer.phone_number,
        customer_email:    customer.email_address,
        fulfillment_type:  'Pickup',
        fulfillment_date:  order.reference_id?.split('_')[0],
        fulfillment_time:  fulfillmentTime,
        pickup_address:    '100 Enterprise Way, Scotts Valley, CA 95066',
        voucher_number:    meta.voucher || 'none',
        order_items:       lineItems,
        order_total:       `$${(Number(order.total_money?.amount || 0) / 100).toFixed(2)}`,
        square_order_id:   order.id,
        square_payment_id: payment.id,
      };

      console.log('[inoa] Sending confirmation email for:', customer.display_name);
      const fsRes = await fetch(`https://formspree.io/f/${formspreeId}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body:    JSON.stringify(emailPayload),
      });
      const fsBody = await fsRes.json().catch(() => ({}));
      if (!fsRes.ok) {
        console.error('[inoa] Formspree error:', fsRes.status, JSON.stringify(fsBody));
      } else {
        console.log('[inoa] Confirmation email sent OK');
      }
    } catch (emailErr) {
      console.error('[inoa] Email send failed (non-fatal):', emailErr?.message);
    }

    return res.status(200).json({
      success:   true,
      orderId:   order.id,
      paymentId: payment.id,
      slotDocId,
    });

  } catch (err) {
    console.error('[inoa] Unexpected error:', err);
    return res.status(500).json({ error: 'unexpected error', detail: err?.message });
  }
}
