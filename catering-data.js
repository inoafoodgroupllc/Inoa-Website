// catering-data.js — catering menu data and constants

window.CATERING_CONSTANTS = {
  MIN_LEAD_TIME_MS:  48 * 60 * 60 * 1000,
  PICKUP_MIN_CENTS:  20000,
  INQUIRY_GUESTS:    50,
  INQUIRY_BOXES:     30,
  BOX_MINIMUM:       5,
  DELIVERY_ZONES: {
    'Scotts Valley': { min: 20000, fee:     0 },
    'Santa Cruz':    { min: 25000, fee:  3500 },
    'Capitola':      { min: 25000, fee:  3500 },
    'Aptos':         { min: 25000, fee:  3500 },
    'Los Gatos':     { min: 50000, fee:  7500 },
    'San Jose':      { min: 50000, fee:  7500 },
    'Santa Clara':   { min: 50000, fee:  7500 },
  },
};

// Flavor table data — used by renderFlavorTable()
window.CATERING_DATA = {
  flavors: [
    { name: 'Shoyu ahi',           build: 'housemade shoyu blend, sesame oil, ogo, alaea salt, sweet onion, green onion',             gf: false, cooked: false },
    { name: 'Hawaiian ahi',        build: 'sesame oil, ogo, alaea sea salt, sweet onion, green onion',                                 gf: true,  cooked: false },
    { name: 'Spicy ahi / salmon',  build: 'housemade spicy mayo blend, sesame oil, masago, togarashi, sweet onion, green onion',       gf: true,  cooked: false },
    { name: 'Sweet unagi salmon',  build: 'housemade sweet unagi sauce, sesame oil, sweet onion, green onion',                         gf: false, cooked: false },
    { name: 'Chili garlic salmon', build: 'housemade chili crunch, fried garlic, shoyu, sesame oil, tobiko, sweet onion, green onion', gf: false, cooked: false },
    { name: 'Kimchi tako',         build: 'kimchi base, sesame oil, sweet onion, green onion',                                         gf: true,  cooked: true  },
    { name: 'Garlic shrimp',       build: 'housemade fried garlic, minced garlic, sesame oil, alaea salt, sweet onion, green onion',   gf: true,  cooked: true  },
    { name: 'Tobiko scallop',      build: 'mayo, tobiko, sesame oil, togarashi, green onion',                                          gf: true,  cooked: false },
  ],
};

// ── New catering menu ────────────────────────────────────────────────────────
window.CATERING_MENU = {

  bars: [
    {
      id: 'bar-poke',
      name: 'Poke Bar',
      desc: 'Build-your-own poke bowl station. Includes two flavors, two sides, and toppings.',
      pricePerPerson: 22,
      min: 10,
      chooseFlavors: 2,
      chooseSides: 2,
      hasTopping: true,
      toppingUp: 4,
      premiumUp: 3,
      flavors: [
        { name: "Chef's choice",        note: null,           premium: false },
        { name: 'Spicy salmon',         note: 'GF',           premium: false },
        { name: 'Sweet unagi salmon',   note: null,           premium: false },
        { name: 'Chili garlic salmon',  note: null,           premium: false },
        { name: 'Garlic shrimp',        note: 'GF · cooked',  premium: false },
        { name: 'Teriyaki beef',        note: 'cooked',       premium: false },
        { name: 'Shoyu ginger chicken', note: 'cooked',       premium: false },
        { name: 'Hawaiian tofu',        note: 'GF · vegan',   premium: false },
        { name: 'Shoyu ahi',            note: null,           premium: true  },
        { name: 'Hawaiian ahi',         note: 'GF',           premium: true  },
        { name: 'Spicy ahi',            note: 'GF',           premium: true  },
        { name: 'Tobiko scallop',       note: 'GF',           premium: true  },
        { name: 'Kimchi tako',          note: 'GF · cooked',  premium: true  },
      ],
      sides: ['Sushi rice', 'Greens', 'Crab mac salad', 'Seaweed salad', 'Kimchi cucumber', 'Roasted sweet potato', 'Wonton chips'],
    },
    {
      id: 'bar-nachos',
      name: 'Nachos Bar',
      desc: 'Poke over crispy homemade wonton chips served family-style.',
      pricePerPerson: 18,
      min: 10,
      chooseFlavors: 1,
      chooseSides: 0,
      hasTopping: false,
      premiumUp: 3,
      flavors: [
        { name: "Chef's choice",       note: null,          premium: false },
        { name: 'Spicy salmon',        note: 'GF',          premium: false },
        { name: 'Chili garlic salmon', note: null,          premium: false },
        { name: 'Hawaiian tofu',       note: 'GF · vegan',  premium: false },
        { name: 'Spicy ahi',           note: 'GF',          premium: true  },
        { name: 'Shoyu ahi',           note: null,          premium: true  },
      ],
    },
  ],

  trays: [
    { id: 'tray-std-15',     name: 'Poke tray',           desc: 'Spicy salmon, sweet unagi, chili garlic, garlic shrimp',               cents: 12000, serves: 15 },
    { id: 'tray-std-40',     name: 'Poke tray',           desc: 'Spicy salmon, sweet unagi, chili garlic, garlic shrimp',               cents: 29500, serves: 40 },
    { id: 'tray-premium-15', name: 'Premium poke tray',   desc: 'Shoyu ahi, Hawaiian ahi, spicy ahi, tobiko scallop, kimchi tako',      cents: 17500, serves: 15 },
    { id: 'tray-premium-40', name: 'Premium poke tray',   desc: 'Shoyu ahi, Hawaiian ahi, spicy ahi, tobiko scallop, kimchi tako',      cents: 44000, serves: 40 },
    { id: 'tray-cooked-15',  name: 'Cooked protein tray', desc: 'Teriyaki beef, shoyu ginger chicken',                                  cents:  9000, serves: 15 },
    { id: 'tray-cooked-40',  name: 'Cooked protein tray', desc: 'Teriyaki beef, shoyu ginger chicken',                                  cents: 22500, serves: 40 },
    { id: 'tray-tofu-15',    name: 'Tofu tray',           desc: 'Hawaiian tofu · GF · vegan',                                           cents:  6500, serves: 15 },
    { id: 'tray-tofu-40',    name: 'Tofu tray',           desc: 'Hawaiian tofu · GF · vegan',                                           cents: 16500, serves: 40 },
  ],

  sidesRice: [
    { id: 'rice-15',    name: 'Sushi rice',   desc: '',                                                                      cents:  4000, serves: 15 },
    { id: 'rice-40',    name: 'Sushi rice',   desc: '',                                                                      cents: 10000, serves: 40 },
    { id: 'greens-15',  name: 'Greens',       desc: 'Spring mix and shredded cabbage',                                      cents:  3200, serves: 15 },
    { id: 'greens-40',  name: 'Greens',       desc: 'Spring mix and shredded cabbage',                                      cents:  7800, serves: 40 },
    { id: 'sides-15',   name: 'Sides',        desc: 'Crab mac, seaweed, kimchi cucumber, cold roasted sweet potato',       cents:  4800, serves: 15 },
    { id: 'sides-40',   name: 'Sides',        desc: 'Crab mac, seaweed, kimchi cucumber, cold roasted sweet potato',       cents: 12000, serves: 40 },
    { id: 'topping-15', name: 'Topping bar',  desc: 'Build-your-own toppings spread',                                      cents:  5500, serves: 15 },
    { id: 'topping-40', name: 'Topping bar',  desc: 'Build-your-own toppings spread',                                      cents: 14000, serves: 40 },
    { id: 'chips-15',   name: 'Wonton chips', desc: 'Homemade',                                                             cents:  2800, serves: 15 },
    { id: 'chips-40',   name: 'Wonton chips', desc: 'Homemade',                                                             cents:  6800, serves: 40 },
  ],

  musubi: [
    { id: 'musubi-12', pc: 12, cents:  4200 },
    { id: 'musubi-24', pc: 24, cents:  8000 },
    { id: 'musubi-36', pc: 36, cents: 11400 },
  ],

  sushiBake: {
    id: 'bake',
    name: 'Sushi bake',
    desc: 'Baked sushi casserole over seasoned rice, served with nori.',
    sizes: [
      {
        key: 'half', label: 'Half pan', serves: '10–12',
        proteins: [
          { key: 'crab',   name: 'Crab',             itemId: 'bake-half-crab',   cents:  6200 },
          { key: 'salmon', name: 'Salmon or shrimp',  itemId: 'bake-half-salmon', cents:  7800 },
          { key: 'ahi',    name: 'Ahi or scallop',    itemId: 'bake-half-ahi',    cents:  8800 },
        ],
      },
      {
        key: 'full', label: 'Full pan', serves: '22–25',
        proteins: [
          { key: 'crab',   name: 'Crab',             itemId: 'bake-full-crab',   cents: 11800 },
          { key: 'salmon', name: 'Salmon or shrimp',  itemId: 'bake-full-salmon', cents: 14800 },
          { key: 'ahi',    name: 'Ahi or scallop',    itemId: 'bake-full-ahi',    cents: 16500 },
        ],
      },
    ],
  },

  boxes: [
    { id: 'box-poke',   name: 'Poke box',        desc: 'Rice base, poke, two sides',   cents: 2000, premiumUp: 300, minQty: 5 },
    { id: 'box-musubi', name: 'Musubi combo box', desc: 'Poke, spam musubi, sides',     cents: 2200, premiumUp: 300, minQty: 5 },
  ],

  boxFlavors: [
    { name: 'Spicy salmon',         premium: false },
    { name: 'Sweet unagi salmon',   premium: false },
    { name: 'Chili garlic salmon',  premium: false },
    { name: 'Garlic shrimp',        premium: false },
    { name: 'Teriyaki beef',        premium: false },
    { name: 'Shoyu ginger chicken', premium: false },
    { name: 'Hawaiian tofu',        premium: false },
    { name: 'Shoyu ahi',            premium: true  },
    { name: 'Hawaiian ahi',         premium: true  },
    { name: 'Spicy ahi',            premium: true  },
    { name: 'Tobiko scallop',       premium: true  },
    { name: 'Kimchi tako',          premium: true  },
  ],

  boxSides: ['Sushi rice', 'Greens', 'Crab mac salad', 'Seaweed salad', 'Kimchi cucumber', 'Roasted sweet potato', 'Wonton chips'],

  personalBake: {
    id: 'box-bake',
    name: 'Personal sushi bake',
    desc: 'Single-serve baked sushi',
    proteins: [
      { key: 'crab',   name: 'Crab',             itemId: 'box-bake-crab',   cents: 1200 },
      { key: 'salmon', name: 'Salmon or shrimp',  itemId: 'box-bake-salmon', cents: 1500 },
      { key: 'ahi',    name: 'Ahi or scallop',    itemId: 'box-bake-ahi',    cents: 1700 },
    ],
  },

  extras: [
    { id: 'extra-mayo',        name: 'Spicy mayo',       desc: 'Extra bottle (~12 servings)',                                  cents:  600 },
    { id: 'extra-soy',         name: 'Sweet soy',        desc: 'Extra bottle (~12 servings)',                                  cents:  600 },
    { id: 'extra-serviceware', name: 'Serviceware kit',  desc: 'Bowl, chopsticks, napkin, serving utensils — per person',     cents:  150 },
    { id: 'extra-hsun',        name: 'Hawaiian Sun',     desc: 'Each',                                                         cents:  400 },
    { id: 'extra-hsun-case',   name: 'Hawaiian Sun',     desc: 'Case of 24',                                                   cents: 8000 },
  ],
};
