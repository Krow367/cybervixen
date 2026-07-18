// =============================================================================
// data.js — Static Item Database, Enemy Definitions & UI Constants
// =============================================================================

// ── Viewport layout defaults ─────────────────────────────────────────────────
export const VIEW_W = 30;
export const VIEW_H = 30;

// ── Map glyphs ───────────────────────────────────────────────────────────────
export const WALL   = "#";
export const PLAYER = "@";

// ── Inventory limits ─────────────────────────────────────────────────────────
export const MAX_INVENTORY = 5;

// ── Pause menu options ───────────────────────────────────────────────────────
export const PAUSE_OPTIONS = ["RESUME", "RESET", "QUIT TO TERMINAL"];

// Ordered equipped-slot definitions shared by render and key handler.
// Bandwidth is listed first; groups delimit category sections.
export const SLOT_KEYS = [
    { cat: "bandwidth", label: "SLOT",   idx: 0, group: "BANDWIDTH" },
    { cat: "script",    label: "SLOT 1", idx: 0, group: "SCRIPTS"   },
    { cat: "script",    label: "SLOT 2", idx: 1, group: null        },
    { cat: "driver",    label: "SLOT 1", idx: 0, group: "DRIVERS"   },
    { cat: "driver",    label: "SLOT 2", idx: 1, group: null        },
    { cat: "plugin",    label: "SLOT 1", idx: 0, group: "PLUGINS"   },
    { cat: "plugin",    label: "SLOT 2", idx: 1, group: null        },
];

// =============================================================================
// ITEM DATABASE
// shielding:    0.0–1.0 probability a module intercepts an incoming hit.
// durability:   hits the module can absorb before it degrades and stops shielding.
// =============================================================================
export const ITEM_DB = {
    // ── Scripts (offensive; low shielding — tools, not armour) ───────────────
    "backdoor.sh":   { name: "backdoor.sh",   category: "script",    subcategory: "local",
                       attack: 12, weight: 1, cost: 0,
                       shielding: 0.05, durability: 10, maxDurability: 10,
                       desc: "Melee script (+12 ATK). Shielding: 5%." },

    "bruteforce.py": { name: "bruteforce.py", category: "script",    subcategory: "local",
                       attack: 20, weight: 3, cost: 0,
                       shielding: 0.05, durability: 8, maxDurability: 8,
                       desc: "Heavy melee script (+20 ATK). Shielding: 5%." },

    "ping_flood.sh": { name: "ping_flood.sh", category: "script",    subcategory: "remote",
                       attack: 10, range: 4, weight: 1, cost: 2,
                       shielding: 0.05, durability: 12, maxDurability: 12,
                       desc: "Ranged (Rng 4, +10 ATK, Cost 2). Shielding: 5%." },

    "syn_flood.sh":  { name: "syn_flood.sh",  category: "script",    subcategory: "remote",
                       attack: 18, range: 3, weight: 2, cost: 4,
                       shielding: 0.05, durability: 10, maxDurability: 10,
                       desc: "Ranged (Rng 3, +18 ATK, Cost 4). Shielding: 5%." },

    // ── Bandwidth (medium shielding — buffer layer) ───────────────────────────
    "fiber_optic_link": { name: "Fiber Optic", category: "bandwidth",
                          capacity: 20, chargeRate: 2, weight: 1,
                          shielding: 0.20, durability: 15, maxDurability: 15,
                          desc: "+20 bandwidth cap, +2 charge. Shielding: 20%." },

    "sat_link":         { name: "Sat Link",    category: "bandwidth",
                          capacity: 10, chargeRate: 5, weight: 2,
                          shielding: 0.25, durability: 12, maxDurability: 12,
                          desc: "+10 bandwidth cap, +5 charge. Shielding: 25%." },

    // ── Drivers (high shielding — kernel wrapper, absorbs the most hits) ──────
    // speed: 100-base scale — 100 = default, 160 = 60% faster, 60 = 40% slower.
    "standard_driver": { name: "Standard Driver", category: "driver",
                         maxWeight: 15, speed: 100,
                         shielding: 0.35, durability: 20, maxDurability: 20,
                         desc: "+15 carry cap. Speed: 100. Shielding: 35%." },

    "crawler_driver":  { name: "Crawler Driver",  category: "driver",
                         maxWeight: 25, speed: 60,
                         shielding: 0.45, durability: 30, maxDurability: 30,
                         desc: "+25 carry cap. Speed: 60. Shielding: 45%." },

    "sprinter_driver": { name: "Sprinter Driver", category: "driver",
                         maxWeight: 8, speed: 160,
                         shielding: 0.20, durability: 14, maxDurability: 14,
                         desc: "+8 carry cap. Speed: 160. Shielding: 20%." },

    // ── Plugins (medium shielding — utility buffers) ──────────────────────────
    "firewall_bypass": { name: "Firewall Bypass", category: "plugin",
                         defense: 8, weight: 1,
                         shielding: 0.30, durability: 16, maxDurability: 16,
                         desc: "+8 DEF. Shielding: 30%." },

    "overclock_mod":   { name: "Overclock Mod",   category: "plugin",
                         attack: 6, defense: -3, weight: 1,
                         shielding: 0.10, durability: 12, maxDurability: 12,
                         desc: "+6 ATK, -3 DEF. Shielding: 10%." },

    "optics_scanner":  { name: "Optics Scanner",  category: "plugin",
                         vision: 4, weight: 1,
                         shielding: 0.15, durability: 14, maxDurability: 14,
                         desc: "+4 sight. Shielding: 15%." }
};

// =============================================================================
// ENEMY DEFINITIONS
// Each type has a fixed, predictable loadout — glyphs/names are unambiguous.
// speed is on the 100-base scale (100 = default player speed).
// =============================================================================
export const enemyDefs = {

    // d — basic melee attacker. Slow, predictable.
    daemon: {
        glyph: "d", color: "#ca0202ff",
        hp: 20, maxHP: 20, speed: 100, vision: 5,
        defaultLoadout: {
            script:    [{ ...ITEM_DB["backdoor.sh"] }, null],
            bandwidth: [null],
            driver:    [{ ...ITEM_DB["standard_driver"] }, null],
            plugin:    [null, null]
        }
    },

    // w — fast pursuit hunter. Low HP, high speed, keen senses.
    watchdog: {
        glyph: "w", color: "#e8a020ff",
        hp: 15, maxHP: 15, speed: 160, vision: 10,
        defaultLoadout: {
            script:    [{ ...ITEM_DB["backdoor.sh"] }, null],
            bandwidth: [null],
            driver:    [{ ...ITEM_DB["sprinter_driver"] }, null],
            plugin:    [{ ...ITEM_DB["optics_scanner"] }, null]
        }
    },

    // ? — remote attacker. Fragile but shoots from distance.
    sniffer: {
        glyph: "?", color: "#00d4ffff",
        hp: 12, maxHP: 12, speed: 80, vision: 12,
        defaultLoadout: {
            script:    [{ ...ITEM_DB["ping_flood.sh"] }, { ...ITEM_DB["syn_flood.sh"] }],
            bandwidth: [{ ...ITEM_DB["sat_link"] }],
            driver:    [{ ...ITEM_DB["standard_driver"] }, null],
            plugin:    [{ ...ITEM_DB["optics_scanner"] }, null]
        }
    },

    // C — slow armoured brawler. High HP, heavy shielding, brutal melee.
    crawler: {
        glyph: "C", color: "#8b0000ff",
        hp: 45, maxHP: 45, speed: 50, vision: 4,
        defaultLoadout: {
            script:    [{ ...ITEM_DB["bruteforce.py"] }, null],
            bandwidth: [null],
            driver:    [{ ...ITEM_DB["crawler_driver"] }, null],
            plugin:    [{ ...ITEM_DB["firewall_bypass"] }, { ...ITEM_DB["firewall_bypass"] }]
        }
    },

    // S — defensive guardian. Mixed melee/ranged, high DEF.
    sentinel: {
        glyph: "S", color: "#ff6600ff",
        hp: 30, maxHP: 30, speed: 75, vision: 9,
        defaultLoadout: {
            script:    [{ ...ITEM_DB["syn_flood.sh"] }, { ...ITEM_DB["backdoor.sh"] }],
            bandwidth: [{ ...ITEM_DB["fiber_optic_link"] }],
            driver:    [{ ...ITEM_DB["standard_driver"] }, null],
            plugin:    [{ ...ITEM_DB["firewall_bypass"] }, { ...ITEM_DB["overclock_mod"] }]
        }
    },

    // F — apex threat. Fast, tanky, all weapons online.
    firewall: {
        glyph: "F", color: "#ff8800ff",
        hp: 60, maxHP: 60, speed: 120, vision: 8,
        defaultLoadout: {
            script:    [{ ...ITEM_DB["syn_flood.sh"] }, { ...ITEM_DB["bruteforce.py"] }],
            bandwidth: [{ ...ITEM_DB["fiber_optic_link"] }],
            driver:    [{ ...ITEM_DB["crawler_driver"] }, null],
            plugin:    [{ ...ITEM_DB["firewall_bypass"] }, { ...ITEM_DB["firewall_bypass"] }]
        }
    }
};
