// catering-data.js — single source of truth for catering menu and constants
// Edit prices here; no changes needed elsewhere.

// ── Capacity constants ──────────────────────────────────────────────────────
window.CATERING_CONSTANTS = {
  MIN_LEAD_TIME_MS:      72 * 60 * 60 * 1000,  // 72 hours
  MAX_BOXES_PER_DAY:     40,
  MAX_TRAYS_PER_DAY:     8,
  INQUIRY_CEILING_BOXES: 30,  // above this, cart routes to inquiry
  INQUIRY_CEILING_TRAYS: 6,
  BOX_MINIMUM:           10,  // minimum boxes across all box types combined
  PICKUP_MIN:            200, // cents → $200
  DELIVERY_ZONES: {
    'Scotts Valley': { min: 20000, fee: 0    },
    'Santa Cruz':    { min: 25000, fee: 3500 },
    'Capitola':      { min: 25000, fee: 3500 },
    'Aptos':         { min: 25000, fee: 3500 },
    'Los Gatos':     { min: 50000, fee: 7500 },
    'San Jose':      { min: 50000, fee: 7500 },
    'Santa Clara':   { min: 50000, fee: 7500 },
  },
};

// ── Menu data — prices in cents ─────────────────────────────────────────────
window.CATERING_DATA = {

  flavorGroups: {
    premium:  ['Shoyu ahi', 'Hawaiian ahi', 'Spicy ahi', 'Tobiko scallop'],
    standard: ['Spicy salmon', 'Sweet unagi salmon', 'Chili garlic salmon', 'Kimchi tako'],
  },

  flavors: [
    { name: 'Shoyu ahi',           build: 'housemade shoyu blend, sesame oil, ogo, alaea salt, sweet onion, green onion',              gf: false, cooked: false },
    { name: 'Hawaiian ahi',        build: 'sesame oil, ogo, alaea sea salt, sweet onion, green onion',                                  gf: true,  cooked: false },
    { name: 'Spicy ahi / salmon',  build: 'housemade spicy mayo blend, sesame oil, masago, togarashi, sweet onion, green onion',        gf: true,  cooked: false },
    { name: 'Sweet unagi salmon',  build: 'housemade sweet unagi sauce, sesame oil, sweet onion, green onion',                          gf: false, cooked: false },
    { name: 'Chili garlic salmon', build: 'housemade chili crunch, fried garlic, shoyu, sesame oil, tobiko, sweet onion, green onion',  gf: false, cooked: false },
    { name: 'Kimchi tako',         build: 'kimchi base, sesame oil, sweet onion, green onion',                                          gf: true,  cooked: true  },
    { name: 'Garlic shrimp',       build: 'housemade fried garlic, minced garlic, sesame oil, alaea salt, sweet onion, green onion',    gf: true,  cooked: true  },
    { name: 'Tobiko scallop',      build: 'mayo, tobiko, sesame oil, togarashi, green onion',                                           gf: true,  cooked: false },
  ],

  sections: [
    {
      id: 'boxes',
      label: 'Individually packaged boxes',
      note: '10 box minimum across all box types combined',
      category: 'box',
      items: [
        { id: 'box-poke-premium',   name: 'Poke box — premium',            cents: 2100, flavorGroup: 'premium',  note: 'ahi or scallop' },
        { id: 'box-poke-std',       name: 'Poke box — standard',           cents: 1700, flavorGroup: 'standard', note: 'salmon or tako' },
        { id: 'box-poke-shrimp',    name: 'Poke box — garlic shrimp',      cents: 1600 },
        { id: 'box-musubi-premium', name: 'Musubi combo box — premium',    cents: 2300, flavorGroup: 'premium'  },
        { id: 'box-musubi-std',     name: 'Musubi combo box — standard',   cents: 1900, flavorGroup: 'standard' },
        { id: 'box-beef',           name: 'Teriyaki beef box',             cents: 1600 },
        { id: 'box-chicken',        name: 'Shoyu ginger chicken box',      cents: 1400 },
        { id: 'box-tofu',           name: 'Hawaiian tofu box',             cents: 1300 },
        { id: 'box-handroll',       name: 'Handroll box',                  cents: 2600 },
        { id: 'box-bake-crab',      name: 'Personal sushi bake — crab',    cents: 1200 },
        { id: 'box-bake-salmon',    name: 'Personal sushi bake — salmon',  cents: 1500 },
        { id: 'box-bake-shrimp',    name: 'Personal sushi bake — shrimp',  cents: 1500 },
        { id: 'box-bake-scallop',   name: 'Personal sushi bake — scallop', cents: 1600 },
        { id: 'box-bake-ahi',       name: 'Personal sushi bake — ahi',     cents: 1600 },
      ],
    },
    {
      id: 'trays-poke',
      label: 'Poke trays',
      note: 'Small serves 10 · Large serves 20 · 4 oz per serving',
      category: 'tray',
      items: [
        { id: 'tray-premium-sm',   name: 'Premium tray — small',                      cents:  9500, flavorGroup: 'premium',  serves: 10, size: 'small' },
        { id: 'tray-premium-lg',   name: 'Premium tray — large',                      cents: 18000, flavorGroup: 'premium',  serves: 20, size: 'large' },
        { id: 'tray-standard-sm',  name: 'Standard tray — small',                     cents:  7800, flavorGroup: 'standard', serves: 10, size: 'small' },
        { id: 'tray-standard-lg',  name: 'Standard tray — large',                     cents: 14800, flavorGroup: 'standard', serves: 20, size: 'large' },
        { id: 'tray-shrimp-sm',    name: 'Garlic shrimp tray — small',                cents:  7000, serves: 10, size: 'small' },
        { id: 'tray-shrimp-lg',    name: 'Garlic shrimp tray — large',                cents: 13200, serves: 20, size: 'large' },
        { id: 'tray-split-ps-sm',  name: 'Split tray — premium + standard, small',    cents:  8700, split: ['premium','standard'], serves: 10, size: 'small' },
        { id: 'tray-split-ps-lg',  name: 'Split tray — premium + standard, large',    cents: 16400, split: ['premium','standard'], serves: 20, size: 'large' },
        { id: 'tray-split-psh-sm', name: 'Split tray — premium + shrimp, small',      cents:  8300, split: ['premium','shrimp'],   serves: 10, size: 'small' },
        { id: 'tray-split-psh-lg', name: 'Split tray — premium + shrimp, large',      cents: 15600, split: ['premium','shrimp'],   serves: 20, size: 'large' },
        { id: 'tray-split-ssh-sm', name: 'Split tray — standard + shrimp, small',     cents:  7400, split: ['standard','shrimp'],  serves: 10, size: 'small' },
        { id: 'tray-split-ssh-lg', name: 'Split tray — standard + shrimp, large',     cents: 14000, split: ['standard','shrimp'],  serves: 20, size: 'large' },
      ],
    },
    {
      id: 'trays-protein',
      label: 'Non-fish protein trays',
      category: 'tray',
      items: [
        { id: 'tray-beef-sm',    name: 'Teriyaki beef — small',        cents:  7000, serves: 10, size: 'small' },
        { id: 'tray-beef-lg',    name: 'Teriyaki beef — large',        cents: 13500, serves: 20, size: 'large' },
        { id: 'tray-chicken-sm', name: 'Shoyu ginger chicken — small', cents:  5500, serves: 10, size: 'small' },
        { id: 'tray-chicken-lg', name: 'Shoyu ginger chicken — large', cents: 10500, serves: 20, size: 'large' },
        { id: 'tray-tofu-sm',    name: 'Hawaiian tofu — small',        cents:  4500, serves: 10, size: 'small' },
        { id: 'tray-tofu-lg',    name: 'Hawaiian tofu — large',        cents:  8500, serves: 20, size: 'large' },
      ],
    },
    {
      id: 'bases',
      label: 'Bases',
      category: 'tray',
      items: [
        { id: 'base-rice-sm',   name: 'Sushi rice — small',              cents: 2800, serves: 10, size: 'small' },
        { id: 'base-rice-lg',   name: 'Sushi rice — large',              cents: 5200, serves: 20, size: 'large' },
        { id: 'base-greens-sm', name: 'Spring mix and cabbage — small',  cents: 2200, serves: 10, size: 'small' },
        { id: 'base-greens-lg', name: 'Spring mix and cabbage — large',  cents: 4000, serves: 20, size: 'large' },
      ],
    },
    {
      id: 'sides',
      label: 'Sides',
      category: 'tray',
      items: [
        { id: 'side-crab-sm',    name: 'Crab mac salad — small',         cents: 3600, serves: 10, size: 'small' },
        { id: 'side-crab-lg',    name: 'Crab mac salad — large',         cents: 6600, serves: 20, size: 'large' },
        { id: 'side-seaweed-sm', name: 'Seaweed salad — small',          cents: 3800, serves: 10, size: 'small' },
        { id: 'side-seaweed-lg', name: 'Seaweed salad — large',          cents: 7000, serves: 20, size: 'large' },
        { id: 'side-kimchi-sm',  name: 'Kimchi cucumber — small',        cents: 3000, serves: 10, size: 'small' },
        { id: 'side-kimchi-lg',  name: 'Kimchi cucumber — large',        cents: 5600, serves: 20, size: 'large' },
        { id: 'side-yam-sm',     name: 'Roasted sweet potato — small',   cents: 3000, serves: 10, size: 'small' },
        { id: 'side-yam-lg',     name: 'Roasted sweet potato — large',   cents: 5600, serves: 20, size: 'large' },
      ],
    },
    {
      id: 'musubi',
      label: 'Musubi',
      category: 'other',
      items: [
        { id: 'musubi-12', name: 'Spam musubi, 12 pieces', cents:  4200 },
        { id: 'musubi-24', name: 'Spam musubi, 24 pieces', cents:  8000 },
        { id: 'musubi-36', name: 'Spam musubi, 36 pieces', cents: 11400 },
      ],
    },
    {
      id: 'sushi-bake',
      label: 'Sushi bake',
      category: 'other',
      items: [
        { id: 'bake-crab-half',    name: 'Sushi bake crab — half pan',    cents:  6200, serves: '10–12' },
        { id: 'bake-crab-full',    name: 'Sushi bake crab — full pan',    cents: 11800, serves: '22–25' },
        { id: 'bake-salmon-half',  name: 'Sushi bake salmon — half pan',  cents:  7800, serves: '10–12' },
        { id: 'bake-salmon-full',  name: 'Sushi bake salmon — full pan',  cents: 14800, serves: '22–25' },
        { id: 'bake-shrimp-half',  name: 'Sushi bake shrimp — half pan',  cents:  7800, serves: '10–12' },
        { id: 'bake-shrimp-full',  name: 'Sushi bake shrimp — full pan',  cents: 14800, serves: '22–25' },
        { id: 'bake-scallop-half', name: 'Sushi bake scallop — half pan', cents:  8500, serves: '10–12' },
        { id: 'bake-scallop-full', name: 'Sushi bake scallop — full pan', cents: 16200, serves: '22–25' },
        { id: 'bake-ahi-half',     name: 'Sushi bake ahi — half pan',     cents:  8500, serves: '10–12' },
        { id: 'bake-ahi-full',     name: 'Sushi bake ahi — full pan',     cents: 16200, serves: '22–25' },
      ],
    },
    {
      id: 'sashimi',
      label: 'Sashimi platters',
      category: 'other',
      items: [
        { id: 'sash-ahi',    name: 'Ahi sashimi, 24 pieces (serves 8)',                      cents:  9500 },
        { id: 'sash-salmon', name: 'Salmon belly sashimi, 24 pieces (serves 8)',             cents:  8500 },
        { id: 'sash-mixed',  name: 'Mixed ahi and salmon belly, 32 pieces (serves 10–12)',  cents: 13000 },
      ],
    },
    {
      id: 'dessert',
      label: 'Dessert and drinks',
      category: 'other',
      items: [
        { id: 'mochi-each', name: 'Mochi ice cream, each',      cents:  325 },
        { id: 'mochi-20',   name: 'Mochi ice cream, 20 pieces', cents: 6000 },
        { id: 'hsun-each',  name: 'Hawaiian Sun, each',          cents:  400 },
        { id: 'hsun-case',  name: 'Hawaiian Sun, case of 24',    cents: 8000 },
      ],
    },
  ],

  // Prefill configurations for "How much to order" starter sets
  prefills: {
    10: [
      { id: 'tray-standard-sm', qty: 1 },
      { id: 'base-rice-sm',     qty: 1 },
      { id: 'base-greens-sm',   qty: 1 },
      { id: 'side-crab-sm',     qty: 1 },
      { id: 'side-seaweed-sm',  qty: 1 },
    ],
    20: [
      { id: 'tray-standard-lg', qty: 1 },
      { id: 'base-rice-lg',     qty: 1 },
      { id: 'base-greens-lg',   qty: 1 },
      { id: 'side-crab-lg',     qty: 1 },
      { id: 'side-seaweed-lg',  qty: 1 },
    ],
  },
};
