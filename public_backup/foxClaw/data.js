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
export const PAUSE_OPTIONS = ["RESUME", "HELP", "OPTIONS", "RESTART", "QUIT TO TERMINAL"];

// Ordered equipped-slot definitions shared by render and key handler.
// Bandwidth is listed first; groups delimit category sections.
export const SLOT_KEYS = [
    { cat: "bandwidth", label: "SLOT",   idx: 0, group: "BANDWIDTH" },
    { cat: "script",    label: "SLOT 1", idx: 0, group: "SCRIPTS"   },
    { cat: "script",    label: "SLOT 2", idx: 1, group: null        },
    { cat: "driver",    label: "SLOT",   idx: 0, group: "DRIVERS"   },
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
                       attack: 4, weight: 1, cost: 0,
                       shred: 0.20,
                       shielding: 0.05, durability: 100, maxDurability: 100,
                       desc: "Melee script (+4 ATK). Shred Rating: +20%." },

    "bruteforce.py": { name: "bruteforce.py", category: "script",    subcategory: "local",
                       attack: 7, weight: 3, cost: 0,
                       shred: 0.50,
                       shielding: 0.05, durability: 80, maxDurability: 80,
                       desc: "Heavy melee script (+7 ATK). Shred Rating: +50%." },

    "ping_flood.sh": { name: "ping_flood.sh", category: "script",    subcategory: "remote",
                       attack: 3, range: 4, weight: 1, cost: 2,
                       bypass: 0.15,
                       shielding: 0.05, durability: 120, maxDurability: 120,
                       desc: "Ranged (Rng 4, +3 ATK, Cost 2). Bypass Rating: +15%." },

    "syn_flood.sh":  { name: "syn_flood.sh",  category: "script",    subcategory: "remote",
                       attack: 6, range: 3, weight: 2, cost: 4,
                       bypass: 0.35,
                       shielding: 0.05, durability: 100, maxDurability: 100,
                       desc: "Ranged (Rng 3, +6 ATK, Cost 4). Bypass Rating: +35%." },

    // ── Bandwidth (medium shielding — buffer layer) ───────────────────────────
    "fiber_optic_link": { name: "Fiber Optic", category: "bandwidth",
                          capacity: 100, chargeRate: 10, weight: 1,
                          shielding: 0.30, durability: 150, maxDurability: 150,
                          desc: "+100 bandwidth cap, +10 charge. Shielding: 30%." },

    "sat_link":         { name: "Sat Link",    category: "bandwidth",
                          capacity: 50, chargeRate: 20, weight: 2,
                          shielding: 0.35, durability: 120, maxDurability: 120,
                          desc: "+50 bandwidth cap, +20 charge. Shielding: 35%." },

    // ── Drivers (high shielding — kernel wrapper, absorbs the most hits) ──────
    // speed: 100-base scale — 100 = default, 160 = 60% faster, 60 = 40% slower.
    "standard_driver": { name: "Standard Driver", category: "driver",
                         maxWeight: 15, speed: 100,
                         shielding: 0.55, durability: 200, maxDurability: 200,
                         desc: "+15 carry cap. Speed: 100. Shielding: 55%." },

    "crawler_driver":  { name: "Crawler Driver",  category: "driver",
                         maxWeight: 25, speed: 60,
                         shielding: 0.65, durability: 300, maxDurability: 300,
                         desc: "+25 carry cap. Speed: 60. Shielding: 65%." },

    "sprinter_driver": { name: "Sprinter Driver", category: "driver",
                         maxWeight: 8, speed: 160,
                         shielding: 0.40, durability: 140, maxDurability: 140,
                         desc: "+8 carry cap. Speed: 160. Shielding: 40%." },

    // ── Plugins (medium shielding — utility buffers) ──────────────────────────
    "firewall_bypass": { name: "Firewall Bypass", category: "plugin",
                         defense: 3, weight: 1,
                         shielding: 0.40, durability: 160, maxDurability: 160,
                         desc: "+3 DEF. Shielding: 40%." },

    "overclock_mod":   { name: "Overclock Mod",   category: "plugin",
                         attack: 2, defense: -2, weight: 1,
                         fused: true,
                         shielding: 0.20, durability: 120, maxDurability: 120,
                         desc: "+2 ATK, -2 DEF. FUSE-LOCKED: Corrupted on unmount." },

    "optics_scanner":  { name: "Optics Scanner",  category: "plugin",
                         vision: 4, weight: 1,
                         shielding: 0.30, durability: 140, maxDurability: 140,
                         desc: "+4 sight. Shielding: 30%." },

    "corrosive_injector": { name: "Corrosive Injector", category: "plugin",
                            shred: 0.25, weight: 2,
                            shielding: 0.25, durability: 100, maxDurability: 100,
                            desc: "Injects acid. Shred Rating: +25%." },

    "tunneling_bridge":   { name: "Tunneling Bridge", category: "plugin",
                            bypass: 0.20, weight: 2,
                            shielding: 0.25, durability: 100, maxDurability: 100,
                            desc: "Bypasses firewalls. Bypass Rating: +20%." }
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
        hp: 10, maxHP: 10, speed: 100, vision: 5,
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
        hp: 8, maxHP: 8, speed: 160, vision: 10,
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
        hp: 6, maxHP: 6, speed: 80, vision: 12,
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
        hp: 18, maxHP: 18, speed: 50, vision: 4,
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
        hp: 14, maxHP: 14, speed: 75, vision: 9,
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
        hp: 25, maxHP: 25, speed: 120, vision: 8,
        defaultLoadout: {
            script:    [{ ...ITEM_DB["syn_flood.sh"] }, { ...ITEM_DB["bruteforce.py"] }],
            bandwidth: [{ ...ITEM_DB["fiber_optic_link"] }],
            driver:    [{ ...ITEM_DB["crawler_driver"] }, null],
            plugin:    [{ ...ITEM_DB["firewall_bypass"] }, { ...ITEM_DB["firewall_bypass"] }]
        }
    }
};
