import { clear } from "../../screen.js";
import { type, alert } from "../../io.js";
import { registerGame, abortGame } from "../../games.js";

// =============================================================================
// 1. ASSET LOADING & INITIALIZATION
// =============================================================================

let _loaded = false;

/**
 * Ensures game stylesheets and HTML elements are loaded and injected.
 * Dynamically re-injects the root container if it was removed on stop.
 */
async function ensureAssets() {
    if (document.getElementById("foxclaw-root")) return;

    if (!_loaded) {
        _loaded = true;
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "/foxClaw/foxclaw.css";
        document.head.appendChild(link);
    }

    const crt = document.getElementById("crt");
    const html = await fetch("/foxClaw/foxclaw.html").then(r => r.text());
    crt.insertAdjacentHTML("afterbegin", html);
}

/**
 * Default command entry point invoked when starting the game from the terminal.
 */
export default async function () {
    await ensureAssets();
    clear();
    await new Promise(resolve => setTimeout(() => init(resolve), 50));
}

/**
 * Initializes the game session, registers it, and binds controls.
 */
export function init(onDone = () => { }) {
    const controller = new AbortController();
    registerGame("foxclaw", controller);
    const { signal } = controller;

    resetState();
    render();
    initViewportSize();
    render();

    document.addEventListener("keydown", e => handleKeyDown(e, onDone), { signal });
    document.addEventListener("keyup", e => handleKeyUp(e), { signal });
    window.addEventListener('load', () => {
        initViewportSize();
        render();
    }, { signal });
    window.addEventListener('resize', () => {
        initViewportSize();
        render();
    }, { signal });
}

function initViewportSize() {
    const wrapper = document.querySelector('.map-wrapper');
    if (wrapper) {
        const rect = wrapper.getBoundingClientRect();

        const temp = document.createElement('div');
        temp.style.fontFamily = '"VT323", monospace';
        temp.style.fontSize = '4.3vh';
        temp.style.lineHeight = '0.85';
        temp.style.position = 'absolute';
        temp.style.visibility = 'hidden';
        temp.style.whiteSpace = 'pre';
        temp.textContent = '@';
        document.body.appendChild(temp);

        const charRect = temp.getBoundingClientRect();
        const charW = charRect.width || 9.2;
        const charH = charRect.height || 18.4;
        document.body.removeChild(temp);

        VIEWPORT_W = Math.max(15, Math.floor((rect.width - 4) / charW));
        VIEWPORT_H = Math.max(15, Math.floor((rect.height - 4) / charH));
    }
}

/**
 * Cleanly stops the game session, cleans up the UI, and returns control.
 */
function stopGame(onDone) {
    const root = document.getElementById("foxclaw-root");
    if (root) root.remove();

    abortGame("foxclaw");
    clear();
    onDone();
}

// =============================================================================
// 2. CONFIGURATION, CONSTANTS & DEFINITIONS
// =============================================================================

// Viewport layout size
const VIEW_W = 30;
const VIEW_H = 30;
let VIEWPORT_W = VIEW_W;
let VIEWPORT_H = VIEW_H;

// Map characters
const WALL = "#";
const PLAYER = "@";

/**
 * Generates a randomized floor glyph to break up visual monotony.
 */
function randomFloorGlyph() {
    const r = Math.random();
    if (r < 0.02) return "{";
    if (r < 0.01) return "}";
    return ".";
}

/**
 * Returns true if the glyph represents a traversable floor tile.
 */
function isFloor(tile) {
    return tile === "." || tile === "{" || tile === "}";
}

// =============================================================================
// 3. GLOBAL GAME STATE
// =============================================================================

let mapW = 50;
let mapH = 30;

let map = [];
let graph = null;
let player = {};
let enemies = [];
let messages = [];
let combatLog = [];
let explored = [];
let visibleTiles = [];

let inventory = [];
let equipped = {
    script: [null, null],
    bandwidth: [null],
    driver: [null, null],
    plugin: [null, null]
};

let inInventoryScreen = false;
let inventoryIndex = 0;
let inventorySection = "inventory";
let inTargetMode = false;
let targetX = 0;
let targetY = 0;
let loot = [];

let inPauseMenu = false;
let pauseMenuIndex = 0;
const PAUSE_OPTIONS = ["RESUME", "SAVE STATE", "LOAD STATE", "QUIT TO TERMINAL"];

let gameOver = false;
let pendingAction = null;
let inCombat = false;
const heldKeys = new Set();

// Ordered equipped slot definitions — shared by render and key handler.
// Bandwidth is listed first; groups are delimited by `group` labels.
const SLOT_KEYS = [
    { cat: "bandwidth", label: "SLOT",   idx: 0, group: "BANDWIDTH" },
    { cat: "script",    label: "SLOT 1", idx: 0, group: "SCRIPTS"   },
    { cat: "script",    label: "SLOT 2", idx: 1, group: null        },
    { cat: "driver",    label: "SLOT 1", idx: 0, group: "DRIVERS"   },
    { cat: "driver",    label: "SLOT 2", idx: 1, group: null        },
    { cat: "plugin",    label: "SLOT 1", idx: 0, group: "PLUGINS"   },
    { cat: "plugin",    label: "SLOT 2", idx: 1, group: null        },
];
const MAX_INVENTORY = 5;

// =============================================================================
// ITEM DATABASE
// shielding: 0.0–1.0 probability that THIS module intercepts an incoming hit
//            instead of the Kernel (player core). Drivers/bandwidth have higher
//            shielding because they sit between the kernel and hostile packets.
// durability / maxDurability: how many effective hits the module can absorb
//            before it degrades and stops providing shielding.
// =============================================================================
const ITEM_DB = {
    // ── Scripts (offensive; low shielding — they're tools, not armor) ──────────
    "backdoor.sh":   { name: "backdoor.sh",   category: "script",    subcategory: "local",
                       attack: 3, weight: 1, cost: 0,
                       shielding: 0.05, durability: 10, maxDurability: 10,
                       desc: "Melee script (+3 ATK). Shielding: 5%." },

    "bruteforce.py": { name: "bruteforce.py", category: "script",    subcategory: "local",
                       attack: 5, weight: 3, cost: 0,
                       shielding: 0.05, durability: 8, maxDurability: 8,
                       desc: "Heavy melee script (+5 ATK). Shielding: 5%." },

    "ping_flood.sh": { name: "ping_flood.sh", category: "script",    subcategory: "remote",
                       attack: 2, range: 4, weight: 1, cost: 2,
                       shielding: 0.05, durability: 12, maxDurability: 12,
                       desc: "Ranged (Rng 4, +2 ATK, Cost 2). Shielding: 5%." },

    "syn_flood.sh":  { name: "syn_flood.sh",  category: "script",    subcategory: "remote",
                       attack: 4, range: 3, weight: 2, cost: 4,
                       shielding: 0.05, durability: 10, maxDurability: 10,
                       desc: "Ranged (Rng 3, +4 ATK, Cost 4). Shielding: 5%." },

    // ── Bandwidth (medium shielding — acts as a buffer layer) ────────────────
    "fiber_optic_link": { name: "Fiber Optic", category: "bandwidth",
                          capacity: 20, chargeRate: 2, weight: 1,
                          shielding: 0.20, durability: 15, maxDurability: 15,
                          desc: "+20 bandwidth cap, +2 charge. Shielding: 20%." },

    "sat_link":         { name: "Sat Link",    category: "bandwidth",
                          capacity: 10, chargeRate: 5, weight: 2,
                          shielding: 0.25, durability: 12, maxDurability: 12,
                          desc: "+10 bandwidth cap, +5 charge. Shielding: 25%." },

    // ── Drivers (high shielding — kernel wrapper, absorbs the most hits) ─────
    "standard_driver": { name: "Standard Driver", category: "driver",
                         maxWeight: 10, speed: 1.0,
                         shielding: 0.35, durability: 20, maxDurability: 20,
                         desc: "Max Wt: 10. Speed: 1.0. Shielding: 35%." },

    "crawler_driver":  { name: "Crawler Driver",  category: "driver",
                         maxWeight: 20, speed: 0.5,
                         shielding: 0.45, durability: 30, maxDurability: 30,
                         desc: "Max Wt: 20. Speed: 0.5. Shielding: 45%." },

    "sprinter_driver": { name: "Sprinter Driver", category: "driver",
                         maxWeight: 6, speed: 2.0,
                         shielding: 0.20, durability: 14, maxDurability: 14,
                         desc: "Max Wt: 6. Speed: 2.0. Shielding: 20%." },

    // ── Plugins (medium shielding — utility buffers) ─────────────────────────
    "firewall_bypass": { name: "Firewall Bypass", category: "plugin",
                         defense: 2, weight: 1,
                         shielding: 0.30, durability: 16, maxDurability: 16,
                         desc: "+2 DEF. Shielding: 30%." },

    "overclock_mod":   { name: "Overclock Mod",   category: "plugin",
                         attack: 2, defense: -1, weight: 1,
                         shielding: 0.10, durability: 12, maxDurability: 12,
                         desc: "+2 ATK, -1 DEF. Shielding: 10%." },

    "optics_scanner":  { name: "Optics Scanner",  category: "plugin",
                         vision: 4, weight: 1,
                         shielding: 0.15, durability: 14, maxDurability: 14,
                         desc: "+4 sight. Shielding: 15%." }
};

// =============================================================================
// ENEMY DEFINITIONS
// Each enemy type now carries a default loadout identical in structure to the
// player's. Stat functions (getEntityAttack, etc.) work on both.
// =============================================================================
const enemyDefs = {
    daemon: {
        glyph: "d",
        color: "#ca0202ff",
        hp: 8,
        maxHP: 8,
        defaultLoadout: {
            script:    [pick_static(["backdoor.sh", "ping_flood.sh", "bruteforce.py"]), null],
            bandwidth: [{ ...ITEM_DB["sat_link"] }],
            driver:    [pick_static(["standard_driver", "crawler_driver", "sprinter_driver"]), null],
            plugin:    [pick_static(["firewall_bypass", "overclock_mod", "optics_scanner"]), null]
        }
    },
    firewall: {
        glyph: "F",
        color: "#ff8800ff",
        hp: 20,
        maxHP: 20,
        defaultLoadout: {
            script:    [{ ...ITEM_DB["syn_flood.sh"] }, null],
            bandwidth: [{ ...ITEM_DB["fiber_optic_link"] }],
            driver:    [{ ...ITEM_DB["crawler_driver"] }, null],
            plugin:    [{ ...ITEM_DB["firewall_bypass"] }, { ...ITEM_DB["firewall_bypass"] }]
        }
    }
};

// pick_static is a seeded-free helper used only at module load time to set up
// the enemy def templates. We do the real random pick per-spawn in spawnEnemy.
function pick_static(arr) {
    return { ...ITEM_DB[arr[Math.floor(Math.random() * arr.length)]] };
}

// =============================================================================
// ENTITY STAT FUNCTIONS (work on player AND enemies symmetrically)
// =============================================================================

function getEntityAttack(entity) {
    if (!entity.equipped) return entity.attack || 0;
    let atk = 0;
    entity.equipped.script.forEach(s => { if (s && s.durability > 0) atk += s.attack || 0; });
    entity.equipped.plugin.forEach(p => { if (p && p.durability > 0) atk += p.attack || 0; });
    return atk;
}

function getEntityDefense(entity) {
    if (!entity.equipped) return entity.defense || 0;
    let def = 0;
    entity.equipped.plugin.forEach(p => { if (p && p.durability > 0) def += p.defense || 0; });
    entity.equipped.driver.forEach(d => { if (d && d.durability > 0) def += d.defense || 0; });
    return def;
}

function getEntitySpeed(entity) {
    if (!entity.equipped) return entity.speed || 1.0;
    let speed = 1.0;
    let driversCount = 0;
    entity.equipped.driver.forEach(d => {
        if (d && d.durability > 0) {
            driversCount++;
            if (d.speed < speed || driversCount === 1) {
                speed = d.speed;
            }
        }
    });
    return speed;
}

function getEntityVision(entity) {
    if (!entity.equipped) return entity.vision || 3;
    let vision = entity.type === "player" ? 8 : 3;
    entity.equipped.plugin.forEach(p => { if (p && p.durability > 0) vision += p.vision || 0; });
    return vision;
}

function getEntityMaxBandwidth(entity) {
    if (!entity.equipped) return 0;
    let cap = 0;
    entity.equipped.bandwidth.forEach(b => { if (b && b.durability > 0) cap += b.capacity || 0; });
    return cap;
}

function getEntityBandwidthCharge(entity) {
    if (!entity.equipped) return 0;
    let charge = 0;
    entity.equipped.bandwidth.forEach(b => { if (b && b.durability > 0) charge += b.chargeRate || 0; });
    return charge;
}

// ── Player-specific helpers ───────────────────────────────────────────────────
function getPlayerAttack()        { return getEntityAttack(player); }
function getPlayerDefense()       { return getEntityDefense(player); }
function getPlayerSpeed()         { return getEntitySpeed(player); }
function getPlayerVision()        { return getEntityVision(player); }
function getPlayerMaxBandwidth()  { return getEntityMaxBandwidth(player); }
function getPlayerBandwidthCharge(){ return getEntityBandwidthCharge(player); }

function getPlayerMaxWeight() {
    let maxW = 0;
    equipped.driver.forEach(d => { if (d && d.durability > 0) maxW += d.maxWeight || 0; });
    return maxW;
}

function getPlayerTotalWeight() {
    let total = 0;
    equipped.script.forEach(s => { if (s) total += s.weight || 0; });
    equipped.bandwidth.forEach(b => { if (b) total += b.weight || 0; });
    equipped.plugin.forEach(p => { if (p) total += p.weight || 0; });
    return total;
}

// =============================================================================
// SHIELDING / DAMAGE INTERCEPTION
// =============================================================================

/**
 * Collects all functional (durability > 0) equipped modules for an entity.
 */
function getActiveModules(entity) {
    if (!entity.equipped) return [];
    const mods = [];
    Object.values(entity.equipped).forEach(slots => {
        slots.forEach(m => { if (m && m.durability > 0) mods.push(m); });
    });
    return mods;
}

/**
 * Determines which module (if any) intercepts an incoming hit, or null if the
 * Kernel absorbs it directly.
 *
 * Each module rolls independently: if Math.random() < module.shielding the
 * module volunteers to take the hit. The first volunteer wins.
 * If no module volunteers, the Kernel takes the damage.
 *
 * @returns {object|null} The intercepting module, or null for direct kernel hit
 */
function resolveHitTarget(entity) {
    const mods = getActiveModules(entity);
    for (const mod of mods) {
        if (Math.random() < (mod.shielding || 0)) {
            return mod;
        }
    }
    return null; // Kernel takes the hit
}

/**
 * Applies damage to a module. Reduces durability; logs degradation warnings.
 */
function damageModule(mod, damage, ownerLabel) {
    mod.durability = Math.max(0, mod.durability - damage);
    if (mod.durability === 0) {
        pushCombat(`[${ownerLabel}] Module [${(mod.name ?? '???').toUpperCase()}] has been CORRUPTED.`);
    }
}

// =============================================================================
// SAVE / LOAD
// =============================================================================

const SAVE_KEY = "foxclaw_save";

function buildSavePayload() {
    return JSON.stringify({
        player: { ...player },
        inventory,
        equipped,
        messages: messages.slice(-20),
        combatLog: combatLog.slice(-20),
        // map state is regenerated; we only persist the player's progress flags
    });
}

function saveGame() {
    try {
        localStorage.setItem(SAVE_KEY, buildSavePayload());
        pushMessage("SYSTEM: State written to persistent memory.");
    } catch(e) {
        pushMessage("SYSTEM ERROR: Save failed — " + e.message);
    }
}

function loadGame() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) {
            pushMessage("SYSTEM: No saved state found.");
            return false;
        }
        const data = JSON.parse(raw);
        player    = data.player;
        inventory = data.inventory;
        equipped  = data.equipped;
        messages  = data.messages || [];
        combatLog = data.combatLog || [];
        pushMessage("SYSTEM: State restored from persistent memory.");
        return true;
    } catch(e) {
        pushMessage("SYSTEM ERROR: Load failed — " + e.message);
        return false;
    }
}

function wipeSave() {
    localStorage.removeItem(SAVE_KEY);
}

// =============================================================================
// GAME STATE RESET
// =============================================================================

/**
 * Resets all gameplay, player, enemy, and map state variables.
 */
function resetState() {
    gameOver = false;
    pendingAction = null;
    inCombat = false;
    heldKeys.clear();
    inPauseMenu = false;
    pauseMenuIndex = 0;

    const generated = carveNetworkLevel({ nodeCount: randInt(6, 9) });
    map   = generated.map;
    graph = generated.graph;
    mapW  = generated.width;
    mapH  = generated.height;

    explored     = Array.from({ length: mapH }, () => Array(mapW).fill(false));
    visibleTiles = Array.from({ length: mapH }, () => Array(mapW).fill(false));

    inInventoryScreen = false;
    inventoryIndex    = 0;
    inventorySection  = "inventory";
    inTargetMode      = false;
    targetX = 0;
    targetY = 0;

    const spawn = spawnAtEntry(graph, map);
    player = {
        x: spawn.x,
        y: spawn.y,
        hp: 10,
        maxHP: 10,
        type: "player",
        bandwidth: 0,
        equipped: null // alias — player uses the module-level `equipped`
    };

    inventory = [
        { ...ITEM_DB["ping_flood.sh"] },
        { ...ITEM_DB["firewall_bypass"] },
        { ...ITEM_DB["overclock_mod"] }
    ];
    equipped = {
        script:    [ { ...ITEM_DB["backdoor.sh"] }, null ],
        bandwidth: [ { ...ITEM_DB["sat_link"] } ],
        driver:    [ { ...ITEM_DB["standard_kernel"] }, null ],
        plugin:    [ null, null ]
    };

    // Point player's equipped reference at the module-level object so
    // getEntity* functions work symmetrically on the player too.
    player.equipped = equipped;
    player.bandwidth = getPlayerMaxBandwidth();

    messages  = ["Modules online. Use WASD or Arrow Keys to move."];
    combatLog = ["COMBAT LOG STANDBY"];

    loot = [];
    const itemCount = randInt(4, 6);
    for (let i = 0; i < itemCount; i++) {
        const pos = findOpenTile(map);
        if (pos) {
            const itemKeys = Object.keys(ITEM_DB);
            const randomItemKey = pick(itemKeys);
            loot.push({ x: pos.x, y: pos.y, item: { ...ITEM_DB[randomItemKey] } });
        }
    }

    enemies = [];
    graph.nodes.forEach(n => {
        if (n.type !== "entry") {
            const c = centerOf(n);
            const type = n.type === "firewall" ? "firewall" : "daemon";
            const pos = (map[c.y]?.[c.x] !== undefined && isFloor(map[c.y][c.x])) ? c : findEnemySpawn(graph, map, spawn);
            enemies.push(spawnEnemy(type, pos));
        }
    });
}

// =============================================================================
// 4. RENDERING
// =============================================================================

/** Renders the full inventory/equipment configuration screen. */
function renderInventoryHTML() {
    const atk       = getPlayerAttack();
    const def       = getPlayerDefense();
    const spd       = getPlayerSpeed();
    const vision    = getPlayerVision();
    const maxW      = getPlayerMaxWeight();
    const curW      = getPlayerTotalWeight();
    const cap       = getPlayerMaxBandwidth();
    const charge    = getPlayerBandwidthCharge();
    const bandwidth = player.bandwidth;

    // ── Equipped column: grouped by category ─────────────────────────────────
    let slotsHTML = `<div class="inv-column"><div class="inv-header">/ MOUNTED MODULES /</div>`;

    SLOT_KEYS.forEach((s, idx) => {
        const item       = equipped[s.cat][s.idx];
        const isSelected = (inventorySection === "equipped" && inventoryIndex === idx);
        const cursor     = isSelected ? "> " : "  ";
        const dur        = item ? ` [${item.durability ?? '?'}/${item.maxDurability ?? '?'}]` : "";
        const shield     = item ? ` SHD:${Math.round((item.shielding || 0) * 100)}%` : "";
        const itemText   = item ? `[ ${(item.name ?? '???').toUpperCase()}${dur}${shield} ]` : "- VACANT -";
        const cls        = isSelected ? "inv-row selected" : (item && item.durability === 0 ? "inv-row corrupted" : "inv-row");

        // Emit a group header whenever a new category begins
        if (s.group) slotsHTML += `<div class="inv-group-header">${s.group}</div>`;
        slotsHTML += `<div class="${cls}">${cursor}${s.label}: ${itemText}</div>`;
    });
    slotsHTML += `</div>`;

    // ── Archive column: always MAX_INVENTORY rows ─────────────────────────────
    let invHTML = `<div class="inv-column"><div class="inv-header">/ SOFTWARE ARCHIVE /</div>`;
    for (let idx = 0; idx < MAX_INVENTORY; idx++) {
        const item       = inventory[idx] ?? null;
        const isSelected = (inventorySection === "inventory" && inventoryIndex === idx);
        const cursor     = isSelected ? "> " : "  ";
        if (item) {
            const dur = ` [${item.durability ?? '?'}/${item.maxDurability ?? '?'}]`;
            const cls = isSelected ? "inv-row selected" : (item.durability === 0 ? "inv-row corrupted" : "inv-row");
            invHTML += `<div class="${cls}">${cursor}[${(item.category ?? '???').toUpperCase()}] ${item.name ?? '???'}${dur}</div>`;
        } else {
            const cls = isSelected ? "inv-row empty selected" : "inv-row empty";
            invHTML += `<div class="${cls}">${cursor}- EMPTY -</div>`;
        }
    }
    invHTML += `</div>`;

    // ── Details footer ────────────────────────────────────────────────────────
    let selectedItem = null;
    if (inventorySection === "inventory" && inventory[inventoryIndex]) {
        selectedItem = inventory[inventoryIndex];
    } else if (inventorySection === "equipped") {
        const s = SLOT_KEYS[inventoryIndex];
        if (s) selectedItem = equipped[s.cat][s.idx];
    }

    const descText   = selectedItem ? selectedItem.desc : "Select a module to view specifications.";
    const weightText = selectedItem && selectedItem.category !== "driver" ? ` | WT: ${selectedItem.weight}` : "";

    return `
<div class="inventory-screen">
    <div class="inventory-columns">
        ${slotsHTML}
        ${invHTML}
    </div>
    <div class="inventory-details">
        <div class="details-desc">${descText}${weightText}</div>
        <div class="details-stats">
            <span>ATK: ${atk}</span>
            <span>DEF: ${def}</span>
            <span>SPD: ${spd}x</span>
            <span>SIGHT: ${vision}</span>
            <span>BAND: ${bandwidth}/${cap} (+${charge})</span>
            <span>LOAD: ${curW}/${maxW}</span>
        </div>
    </div>
</div>`;
}

/** Renders the pause/system menu overlay. */
function renderPauseHTML() {
    let optionsHTML = "";
    PAUSE_OPTIONS.forEach((opt, idx) => {
        const isSelected = idx === pauseMenuIndex;
        const cursor     = isSelected ? "> " : "  ";
        const cls        = isSelected ? "inv-row selected" : "inv-row";
        optionsHTML += `<div class="${cls}">${cursor}${opt}</div>`;
    });

    return `
<div class="pause-screen">
    <div class="pause-title">// SYSTEM PAUSE //</div>
    <div class="pause-options">
        ${optionsHTML}
    </div>
    <div class="pause-hint">[ARROWS] SELECT ~ [ENTER] CONFIRM ~ [ESC] RESUME</div>
</div>
    `;
}

function render() {
    const root = document.getElementById("foxclaw-root");
    if (!root) return;

    updateVisibility();

    const camX = player.x - Math.floor(VIEWPORT_W / 2);
    const camY = player.y - Math.floor(VIEWPORT_H / 2);

    const rows = [];
    for (let y = 0; y < VIEWPORT_H; y++) {
        let line = "";
        for (let x = 0; x < VIEWPORT_W; x++) {
            line += getGlyph(camX + x, camY + y);
        }
        rows.push(line);
    }

    const combatStatus = inCombat ? "ACTIVE" : "STANDBY";

    let partsHTML = "";
    let mountedCount = 0;

    const allEquipped = [];
    equipped.script.forEach(s    => { if (s) allEquipped.push(s); });
    equipped.bandwidth.forEach(b => { if (b) allEquipped.push(b); });
    equipped.driver.forEach(d    => { if (d) allEquipped.push(d); });
    equipped.plugin.forEach(p    => { if (p) allEquipped.push(p); });

    allEquipped.slice(0, 3).forEach(item => {
        const durRatio  = item.maxDurability > 0 ? item.durability / item.maxDurability : 0;
        const durColor  = durRatio > 0.5 ? "#a3ffa3" : durRatio > 0.2 ? "#ffea00" : "#ff4444";
        const durBar    = `${item.durability}/${item.maxDurability}`;
        const shldPct   = Math.round((item.shielding || 0) * 100);
        partsHTML += `<div class="reserved-row" style="color: ${durColor};">[ ${(item.name ?? '???').toUpperCase()} ] DUR:${durBar} SHD:${shldPct}%</div>`;
        mountedCount++;
    });

    for (let i = mountedCount; i < 3; i++) {
        partsHTML += `<div class="reserved-row">- VACANT SLOT -</div>`;
    }

    // Determine what to show in the main panel
    let mainPanelHeader, mainPanelContent, mainPanelFooter;
    if (inPauseMenu) {
        mainPanelHeader  = "/ SYSTEM MENU /";
        mainPanelContent = renderPauseHTML();
        mainPanelFooter  = "[ARROWS] NAV ~ [ENTER] CONFIRM ~ [ESC] RESUME";
    } else if (inInventoryScreen) {
        mainPanelHeader  = "/ MODULE CONFIG /";
        mainPanelContent = renderInventoryHTML();
        mainPanelFooter  = "[ARROWS] NAV ~ [TAB] LISTS ~ [ENTER] MOUNT/UNMOUNT ~ [ESC] CLOSE";
    } else {
        mainPanelHeader  = "";
        mainPanelContent = `<pre class="foxclaw-map">${rows.join("\n")}</pre>`;
        mainPanelFooter  = "[WASD/ARROWS] MOVE ~ [I] MODULES ~ [F] REMOTE ~ [ESC] PAUSE";
    }

    root.innerHTML = `
<div class="foxclaw-container">
    <!-- Top Row: Message Log and Combat Calculations -->
    <div class="foxclaw-top-row">
        <!-- Log Column -->
        <div class="foxclaw-panel log-panel">
            <div class="panel-header">/ LOG /</div>
            <div class="panel-content log-content">
                ${messages.slice(-5).join("<br>")}
            </div>
        </div>

        <!-- Calc / Combat Log Column -->
        <div class="foxclaw-panel calc-panel">
            <div class="panel-header">/ CALC /</div>
            <div class="panel-content calc-content">
                ${combatLog.slice(-5).join("<br>")}
            </div>
        </div>
    </div>

    <!-- Bottom Row: Map and Right Sidebar -->
    <div class="foxclaw-bottom-row">
        <!-- Map Panel -->
        <div class="foxclaw-panel map-panel">
            <div class="panel-header">${mainPanelHeader}</div>
            <div class="map-wrapper">
                ${mainPanelContent}
            </div>
            <div class="panel-footer">${mainPanelFooter}</div>
        </div>

        <!-- Right Sidebar: Status & Module summary -->
        <div class="foxclaw-sidebar">
            <!-- Status Panel -->
            <div class="foxclaw-panel status-panel">
                <div class="panel-header">/ STATUS /</div>
                <div class="panel-content status-content">
                    <div class="status-row"><span class="label">KERNEL:</span> <span class="value">${player.hp}/${player.maxHP || 10} HP</span></div>
                    <div class="status-row"><span class="label">BAND:</span>   <span class="value">${player.bandwidth}/${getPlayerMaxBandwidth()}</span></div>
                    <div class="status-row"><span class="label">ATK/DEF:</span><span class="value">${getPlayerAttack()}/${getPlayerDefense()}</span></div>
                    <div class="status-row"><span class="label">LOAD:</span>   <span class="value">${getPlayerTotalWeight()}/${getPlayerMaxWeight()} WT</span></div>
                </div>
            </div>

            <!-- Module Summary Panel -->
            <div class="foxclaw-panel reserved-panel">
                <div class="panel-header">/ PARTS /</div>
                <div class="panel-content reserved-content">
                    ${partsHTML}
                </div>
            </div>
        </div>
    </div>
</div>
    `;
}


/**
 * Retrieves the appropriate display glyph for a given coordinate.
 */
function getGlyph(x, y) {
    if (x < 0 || x >= mapW || y < 0 || y >= mapH) return " ";
    if (!explored[y]?.[x]) return " ";

    const isVisible = visibleTiles[y]?.[x];

    if (inTargetMode && targetX === x && targetY === y) {
        return `<span style="background-color: rgba(255, 0, 0, 0.6); color: white; font-weight: bold;">X</span>`;
    }

    if (isVisible) {
        if (player.x === x && player.y === y) {
            return `<span style="color: #4e51fdff; font-weight: bold;">${PLAYER}</span>`;
        }

        const enemy = enemies.find(e => e.alive && e.x === x && e.y === y);
        if (enemy) {
            return `<span style="color: ${enemy.color || '#ca0202ff'}; font-weight: bold;">${enemy.glyph}</span>`;
        }

        const itemOnGround = loot.find(l => l.x === x && l.y === y);
        if (itemOnGround) {
            return `<span style="color: #ffea00; font-weight: bold;">%</span>`;
        }

        const tile = map[y][x];
        if (tile === WALL) {
            return isBoundaryWall(x, y) ? WALL : " ";
        }
        return tile;
    }

    const itemOnGround = loot.find(l => l.x === x && l.y === y);
    if (itemOnGround) {
        return `<span style="color: rgba(255, 234, 0, 0.25);">%</span>`;
    }

    const tile = map[y][x];
    if (tile === WALL) {
        return isBoundaryWall(x, y) ? `<span style="color: rgba(124, 255, 124, 0.2);">${WALL}</span>` : " ";
    }
    return `<span style="color: rgba(124, 255, 124, 0.2);">${tile}</span>`;
}

// =============================================================================
// 5. INPUT HANDLING
// =============================================================================

/**
 * Maps keyboard keydown events to player moves or menu actions.
 */
function handleKeyDown(e, onDone) {
    const el  = document.getElementById("alert-frame");
    const key = e.key.toLowerCase();

    // ── Game Over state: only Y to restart ───────────────────────────────────
    if (gameOver) {
        if (e.key === "y" || e.key === "Y") {
            gameOver = false;
            pendingAction = null;
            resetState();
            render();
            el?.classList.add("hidden");
        }
        return;
    }

    // ── Pause Menu ────────────────────────────────────────────────────────────
    if (inPauseMenu) {
        if (e.key === "Escape") {
            inPauseMenu = false;
            render();
            return;
        }
        if (e.key === "ArrowUp" || key === "w") {
            pauseMenuIndex = (pauseMenuIndex - 1 + PAUSE_OPTIONS.length) % PAUSE_OPTIONS.length;
            render();
            return;
        }
        if (e.key === "ArrowDown" || key === "s") {
            pauseMenuIndex = (pauseMenuIndex + 1) % PAUSE_OPTIONS.length;
            render();
            return;
        }
        if (e.key === "Enter") {
            handlePauseMenuSelect(onDone);
        }
        return;
    }

    // ── Inventory Screen ──────────────────────────────────────────────────────
    if (inInventoryScreen) {
        if (e.key === "Escape" || key === "i") {
            inInventoryScreen = false;
            render();
            return;
        }

        if (e.key === "Tab" || e.key === "ArrowLeft" || e.key === "ArrowRight" || key === "a" || key === "d") {
            inventorySection = inventorySection === "inventory" ? "equipped" : "inventory";
            inventoryIndex   = 0;
            render();
            return;
        }

        if (e.key === "ArrowUp" || key === "w") {
            const maxIdx = inventorySection === "inventory" ? MAX_INVENTORY : SLOT_KEYS.length;
            inventoryIndex = (inventoryIndex - 1 + maxIdx) % maxIdx;
            render();
            return;
        }

        if (e.key === "ArrowDown" || key === "s") {
            const maxIdx = inventorySection === "inventory" ? MAX_INVENTORY : SLOT_KEYS.length;
            inventoryIndex = (inventoryIndex + 1) % maxIdx;
            render();
            return;
        }

        if (e.key === "Enter") {
            if (inventorySection === "inventory") {
                const item = inventory[inventoryIndex];
                if (!item) return;

                const maxSlots = item.category === "bandwidth" ? 1 : 2;
                let slotIdx = -1;
                for (let i = 0; i < maxSlots; i++) {
                    if (equipped[item.category][i] === null) { slotIdx = i; break; }
                }

                if (slotIdx === -1) {
                    pushMessage(`NO VACANT SLOT FOR ${(item.category ?? '???').toUpperCase()}.`);
                    return;
                }

                if (item.category !== "driver") {
                    const maxWeight = getPlayerMaxWeight();
                    const currentWeight = getPlayerTotalWeight();
                    if (currentWeight + (item.weight || 0) > maxWeight) {
                        pushMessage("DRIVER OVERLOAD: WEIGHT CAPACITY EXCEEDED.");
                        return;
                    }
                }

                // Check inventory capacity before equipping
                if (inventory.length >= MAX_INVENTORY) {
                    pushMessage("ARCHIVE FULL: Cannot equip — no free archive slots.");
                    return;
                }
                inventory.splice(inventoryIndex, 1);
                equipped[item.category][slotIdx] = item;
                pushMessage(`SYSTEM: Mounted module [${item.name}].`);
                inventoryIndex = Math.min(inventoryIndex, Math.max(0, inventory.length - 1));
            } else {
                const slot = SLOT_KEYS[inventoryIndex];
                const item = equipped[slot.cat][slot.idx];
                if (!item) return;
                if (inventory.length >= MAX_INVENTORY) {
                    pushMessage("ARCHIVE FULL: Cannot unmount — no free archive slots.");
                    return;
                }
                equipped[slot.cat][slot.idx] = null;
                inventory.push(item);
                pushMessage(`SYSTEM: Unmounted module [${item.name}].`);
            }

            player.bandwidth = Math.min(getPlayerMaxBandwidth(), player.bandwidth);
            render();
            return;
        }
        return;
    }

    // ── Target Mode ───────────────────────────────────────────────────────────
    if (inTargetMode) {
        if (e.key === "Escape" || key === "f") {
            inTargetMode = false;
            pushMessage("Target mode aborted.");
            render();
            return;
        }

        let dx = 0, dy = 0;
        if (e.key === "ArrowUp"    || key === "w") dy = -1;
        if (e.key === "ArrowDown"  || key === "s") dy = 1;
        if (e.key === "ArrowLeft"  || key === "a") dx = -1;
        if (e.key === "ArrowRight" || key === "d") dx = 1;

        if (dx !== 0 || dy !== 0) {
            targetX = clamp(targetX + dx, 0, mapW - 1);
            targetY = clamp(targetY + dy, 0, mapH - 1);
            render();
            return;
        }

        if (e.key === "Enter") {
            const script = equipped.script.find(s => s && s.subcategory === "remote" && s.durability > 0);
            if (!script) {
                inTargetMode = false;
                render();
                return;
            }

            if (player.bandwidth < (script.cost || 0)) {
                pushMessage("SYSTEM: INSUFFICIENT BANDWIDTH.");
                return;
            }

            const enemy = enemies.find(e => e.alive && e.x === targetX && e.y === targetY);
            if (!enemy) {
                pushMessage("No target detected at coordinate.");
                return;
            }

            const dist = Math.abs(targetX - player.x) + Math.abs(targetY - player.y);
            if (dist > script.range) {
                pushMessage("SYSTEM: Target out of transmission range.");
                return;
            }

            if (!hasLineOfSight(player.x, player.y, targetX, targetY)) {
                pushMessage("SYSTEM: Transmission path blocked.");
                return;
            }

            player.bandwidth -= (script.cost || 0);
            pushCombat(`Fired ${script.name} at ${enemy.type}.`);
            attack(player, enemy);

            inTargetMode = false;
            player.bandwidth = Math.min(getPlayerMaxBandwidth(), player.bandwidth + getPlayerBandwidthCharge());

            if (enemy.alive) {
                enemyTurn();
            } else {
                pushCombat(`The ${enemy.type} collapses.`);
                enemyTurn();
            }
            render();
            return;
        }
        return;
    }

    // ── Normal Gameplay ───────────────────────────────────────────────────────

    // ESC in normal play → open pause menu
    if (e.key === "Escape") {
        inPauseMenu   = true;
        pauseMenuIndex = 0;
        render();
        return;
    }

    if (key === "i") {
        inInventoryScreen = !inInventoryScreen;
        inventoryIndex    = 0;
        inventorySection  = "inventory";
        render();
        return;
    }

    if (key === "f") {
        const remoteScript = equipped.script.find(s => s && s.subcategory === "remote" && s.durability > 0);
        if (!remoteScript) {
            pushMessage("SYSTEM ERROR: NO FUNCTIONAL REMOTE SCRIPT DETECTED.");
            return;
        }
        inTargetMode = true;
        targetX = player.x;
        targetY = player.y;
        pushMessage("TARGET MODE ARMED. ARROWS SELECT, ENTER FIRES.");
        render();
        return;
    }

    const isMoveKey =
        e.key === "ArrowUp"    || key === "w" ||
        e.key === "ArrowDown"  || key === "s" ||
        e.key === "ArrowLeft"  || key === "a" ||
        e.key === "ArrowRight" || key === "d";

    if (!isMoveKey) return;
    if (inCombat && e.repeat) return;
    if (heldKeys.has(e.code) && inCombat) return;

    heldKeys.add(e.code);

    if (e.key === "ArrowUp"    || key === "w") return tryMove(0, -1);
    if (e.key === "ArrowDown"  || key === "s") return tryMove(0, 1);
    if (e.key === "ArrowLeft"  || key === "a") return tryMove(-1, 0);
    if (e.key === "ArrowRight" || key === "d") return tryMove(1, 0);
}

function handleKeyUp(e) {
    heldKeys.delete(e.code);
}

/**
 * Handles a confirmed selection in the pause menu.
 */
function handlePauseMenuSelect(onDone) {
    const choice = PAUSE_OPTIONS[pauseMenuIndex];
    inPauseMenu  = false;

    if (choice === "RESUME") {
        render();
        return;
    }

    if (choice === "SAVE STATE") {
        saveGame();
        render();
        return;
    }

    if (choice === "LOAD STATE") {
        if (loadGame()) {
            // Re-sync player equipped reference after load
            player.equipped = equipped;
            player.bandwidth = Math.min(getPlayerMaxBandwidth(), player.bandwidth);
        }
        render();
        return;
    }

    if (choice === "QUIT TO TERMINAL") {
        stopGame(onDone);
        return;
    }
}

// =============================================================================
// 6. GAMEPLAY LOGIC & ACTIONS
// =============================================================================

function tryMove(dx, dy) {
    const nx = player.x + dx;
    const ny = player.y + dy;

    if (map[ny]?.[nx] === WALL) {
        pushMessage("You bump into a wall.");
        return;
    }

    const enemy = enemies.find(e => e.alive && e.x === nx && e.y === ny);
    if (enemy) {
        attack(player, enemy);
        player.bandwidth = Math.min(getPlayerMaxBandwidth(), player.bandwidth + getPlayerBandwidthCharge());
        if (enemy.alive) {
            enemyTurn();
        } else {
            pushCombat(`The ${enemy.type} collapses.`);
            player.x = nx;
            player.y = ny;

            const lootIndex = loot.findIndex(l => l.x === player.x && l.y === player.y);
            if (lootIndex !== -1) {
                const found = loot[lootIndex];
                inventory.push(found.item);
                pushMessage(`SYSTEM: Loaded module [${found.item.name}]. Press 'I' to configure.`);
                loot.splice(lootIndex, 1);
            }

            enemyTurn();
        }
        render();
        return;
    }

    player.x = nx;
    player.y = ny;

    const lootIndex = loot.findIndex(l => l.x === player.x && l.y === player.y);
    if (lootIndex !== -1) {
        const found = loot[lootIndex];
        inventory.push(found.item);
        pushMessage(`SYSTEM: Loaded module [${found.item.name}]. Press 'I' to configure.`);
        loot.splice(lootIndex, 1);
    }

    player.bandwidth = Math.min(getPlayerMaxBandwidth(), player.bandwidth + getPlayerBandwidthCharge());
    enemyTurn();
    render();
}

/**
 * Resolves a combat exchange. Modules may intercept the hit before the Kernel.
 * Broken modules are reported but items stay in the slot (for visibility/repair).
 */
function attack(attacker, defender) {
    const atk    = getEntityAttack(attacker);
    const def    = getEntityDefense(defender);
    const damage = Math.max(1, atk - def);

    let weaponName = "standard scan";
    if (attacker.equipped) {
        const activeScript = attacker.equipped.script.find(s => s !== null && s.durability > 0);
        if (activeScript) weaponName = activeScript.name;
    }

    const ownerLabel = defender === player ? "KERNEL" : (defender.type ?? 'ENTITY').toUpperCase();

    // Determine if a module intercepts the hit
    const interceptMod = resolveHitTarget(defender);
    if (interceptMod) {
        damageModule(interceptMod, damage, ownerLabel);
        pushCombat(
            `${(attacker.type ?? 'ENTITY').toUpperCase()} → ${weaponName}: ${damage} DMG ` +
            `intercepted by [${(interceptMod.name ?? '???').toUpperCase()}]`
        );
    } else {
        // Direct kernel hit
        defender.hp -= damage;
        if (defender.hp <= 0) defender.alive = false;
        pushCombat(
            `${(attacker.type ?? 'ENTITY').toUpperCase()} → ${weaponName}: ${damage} DMG ` +
            `hit ${ownerLabel} directly`
        );
    }

    if (defender === player && player.hp <= 0) {
        handlePlayerDeath();
    }
}

/**
 * Pushes a new message to the narrative log.
 */
function pushMessage(text) {
    messages.push(text);
    render();
}

function pushCombat(text) {
    combatLog.push(text);
    render();
}

/**
 * Triggered when player HP reaches 0. Wipes save data, shows death message.
 */
function handlePlayerDeath() {
    if (gameOver) return;

    // Permadeath: wipe all save data on death
    wipeSave();

    gameOver = true;
    pendingAction = "restart-run";
    alert("KERNEL CORRUPTION CRITICAL :: ALL MEMORY WIPED :: PRESS Y TO REBOOT");
    render();
}

// =============================================================================
// 7. ENEMY AI & MOVEMENT
// =============================================================================

/**
 * Executes the turn for all active, living enemies.
 */
function enemyTurn() {
    let seenPlayer   = false;
    const playerSpeed = getPlayerSpeed();
    const elapsed    = 1.0 / playerSpeed;

    for (const enemy of enemies) {
        if (!enemy.alive) continue;

        if (enemy.ticks === undefined) enemy.ticks = 0;
        enemy.ticks += elapsed;

        const enemySpeed = getEntitySpeed(enemy);
        if (enemySpeed <= 0) {
            if (isAdjacent(enemy, player)) {
                seenPlayer = true;
                attack(enemy, player);
            }
            continue;
        }

        const enemyCost = 1.0 / enemySpeed;
        while (enemy.ticks >= enemyCost) {
            enemy.ticks -= enemyCost;

            if (isAdjacent(enemy, player)) {
                seenPlayer = true;
                attack(enemy, player);
                continue;
            }

            const dist = Math.abs(enemy.x - player.x) + Math.abs(enemy.y - player.y);
            const remoteScript = enemy.equipped ? enemy.equipped.script.find(s => s && s.subcategory === "remote" && s.durability > 0) : null;
            const enemyVision  = getEntityVision(enemy);

            if (remoteScript && dist <= remoteScript.range && canSee(enemy, player, map)) {
                seenPlayer = true;
                attack(enemy, player);
                continue;
            }

            if (dist <= enemyVision && canSee(enemy, player, map)) {
                seenPlayer = true;
                moveToward(enemy, player, map, enemies);
            }
        }
    }

    inCombat = seenPlayer;
}

/**
 * Moves an enemy one cell closer to the player.
 */
function moveToward(enemy, player, map, enemies) {
    const dx = Math.sign(player.x - enemy.x);
    const dy = Math.sign(player.y - enemy.y);

    const options = [
        { x: enemy.x + dx, y: enemy.y },
        { x: enemy.x, y: enemy.y + dy }
    ];

    for (const pos of options) {
        if (isOpen(pos.x, pos.y, map, enemies)) {
            enemy.x = pos.x;
            enemy.y = pos.y;
            return;
        }
    }
}

/**
 * Returns true if the coordinate is not a wall and not occupied by an enemy.
 */
function isOpen(x, y, map, enemies) {
    if (map[y]?.[x] === "#") return false;
    if (enemies.some(e => e.alive && e.x === x && e.y === y)) return false;
    return true;
}

/**
 * Performs a line-of-sight check using Bresenham's algorithm.
 */
function hasLineOfSight(x0, y0, x1, y1) {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;

    let err = dx - dy;

    while (!(x0 === x1 && y0 === y1)) {
        const e2 = 2 * err;

        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 < dx)  { err += dx; y0 += sy; }

        if (x0 === x1 && y0 === y1) return true;
        if (map[y0]?.[x0] === WALL) return false;
    }

    return true;
}

function canSee(enemy, player, map) {
    return hasLineOfSight(enemy.x, enemy.y, player.x, player.y);
}

function isBoundaryWall(x, y) {
    if (map[y]?.[x] !== WALL) return false;
    for (let dy = -1; dy <= 1; dy++) {
        const ty = y + dy;
        const row = map[ty];
        if (!row) continue;
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const tx = x + dx;
            if (isFloor(row[tx])) return true;
        }
    }
    return false;
}

function updateVisibility() {
    visibleTiles = Array.from({ length: mapH }, () => Array(mapW).fill(false));

    if (map[player.y]?.[player.x] !== undefined) {
        visibleTiles[player.y][player.x] = true;
        explored[player.y][player.x]     = true;
    }

    const r = getPlayerVision();
    for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
            if (dx*dx + dy*dy <= r*r) {
                const tx = player.x + dx;
                const ty = player.y + dy;

                if (tx >= 0 && tx < mapW && ty >= 0 && ty < mapH) {
                    if (hasLineOfSight(player.x, player.y, tx, ty)) {
                        visibleTiles[ty][tx] = true;
                        explored[ty][tx]     = true;
                    }
                }
            }
        }
    }
}

// =============================================================================
// 8. SPAWNING UTILITIES
// =============================================================================

/**
 * Instantiates an enemy object. All stat functions work on it symmetrically
 * with the player because it uses the same equipped structure.
 */
function spawnEnemy(type, pos) {
    const base = enemyDefs[type];

    // Deep-copy the loadout so each enemy instance has independent durability
    const loadout = {
        script:    base.defaultLoadout.script.map(s    => s ? { ...s } : null),
        bandwidth: base.defaultLoadout.bandwidth.map(b => b ? { ...b } : null),
        driver:    base.defaultLoadout.driver.map(d    => d ? { ...d } : null),
        plugin:    base.defaultLoadout.plugin.map(p    => p ? { ...p } : null),
    };

    // Daemons get a randomized loadout for variety
    if (type === "daemon") {
        const scriptId = pick(["backdoor.sh", "ping_flood.sh", "bruteforce.py"]);
        loadout.script[0] = { ...ITEM_DB[scriptId] };

        const driverId = pick(["standard_kernel", "crawler_driver", "sprinter_driver"]);
        loadout.driver[0] = { ...ITEM_DB[driverId] };

        const pluginId = pick(["firewall_bypass", "overclock_mod", "optics_scanner"]);
        loadout.plugin[0] = { ...ITEM_DB[pluginId] };
    }

    return {
        id:       crypto.randomUUID(),
        type,
        x:        pos.x,
        y:        pos.y,
        hp:       base.hp,
        maxHP:    base.maxHP,
        glyph:    base.glyph,
        color:    base.color,
        alive:    true,
        equipped: loadout
    };
}

/**
 * Determines the spawn location for the player at the entry node.
 */
function spawnAtEntry(graph, map) {
    const entry = graph.nodes.find(n => n.type === "entry") ?? graph.nodes[0];
    const c = centerOf(entry);
    if (isFloor(map[c.y]?.[c.x])) return c;
    return findOpenTile(map) ?? { x: 1, y: 1 };
}

/**
 * Tries to find a suitable random coordinate to spawn an enemy.
 */
function findEnemySpawn(graph, map, playerPos) {
    const minDist = 5;
    const maxTries = 50;

    for (let i = 0; i < maxTries; i++) {
        const x = randInt(0, mapW - 1);
        const y = randInt(0, mapH - 1);
        const dist = Math.abs(x - playerPos.x) + Math.abs(y - playerPos.y);
        if (dist >= minDist && isFloor(map[y]?.[x])) return { x, y };
    }

    return findOpenTile(map) ?? { x: 2, y: 2 };
}

/**
 * Searches the map for any open floor tile.
 */
function findOpenTile(map) {
    const spots = [];
    for (let y = 0; y < map.length; y++) {
        for (let x = 0; x < map[y].length; x++) {
            if (isFloor(map[y][x])) spots.push({ x, y });
        }
    }
    return spots.length ? pick(spots) : null;
}

// =============================================================================
// 9. MAP GENERATION (PCG)
// =============================================================================

/**
 * Entry point for map generation. Places rooms, shifts coordinates, carves tiles.
 */
function carveNetworkLevel({ nodeCount = 6 } = {}) {
    const graph = createNetworkGraph(nodeCount);
    placeNetworkNodes(graph.nodes);

    const margin = 2;
    const width  = Math.max(...graph.nodes.map(n => n.x + n.w)) + margin;
    const height = Math.max(...graph.nodes.map(n => n.y + n.h)) + margin;

    const map = Array.from({ length: height }, () =>
        Array.from({ length: width }, () => "#")
    );

    carveRooms(map, graph.nodes);
    carveConnections(map, graph.nodes);

    return { map, graph, width, height };
}

/**
 * Generates the room graph structure with linked nodes.
 */
function createNetworkGraph(count = 6) {
    const nodes = [];

    for (let i = 0; i < count; i++) {
        const type =
            i === 0          ? "entry"    :
            i === count - 1  ? "core"     :
            Math.random() < 0.15 ? "firewall" :
            Math.random() < 0.25 ? "cache"    :
                                   "relay";

        nodes.push({
            id:    `node_${i}`,
            type,
            w:     type === "core" ? randInt(25, 30) : type === "entry" ? randInt(6, 7) : randInt(20, 30),
            h:     type === "core" ? randInt(20, 30) : type === "entry" ? randInt(6, 7) : randInt(20, 30),
            x:     0,
            y:     0,
            links: []
        });
    }

    for (let i = 0; i < nodes.length - 1; i++) link(nodes[i], nodes[i + 1]);

    if (nodes.length >= 4 && Math.random() < 0.65) {
        const a = randInt(1, nodes.length - 3);
        const b = randInt(a + 1, nodes.length - 2);
        link(nodes[a], nodes[b]);
    }

    if (nodes.length >= 5 && Math.random() < 0.35) {
        const a = randInt(0, nodes.length - 3);
        const b = randInt(a + 2, nodes.length - 1);
        link(nodes[a], nodes[b]);
    }

    return { nodes };
}

function link(a, b) {
    if (!a.links.includes(b.id)) a.links.push(b.id);
    if (!b.links.includes(a.id)) b.links.push(a.id);
}

function placeNetworkNodes(nodes) {
    const margin  = 2;
    let currentX  = margin;

    nodes.forEach(n => {
        n.x = currentX + randInt(3, 6);
        n.y = randInt(-4, 4);
        currentX = n.x + n.w;
    });

    for (let a = 0; a < nodes.length; a++) {
        for (let b = a + 1; b < nodes.length; b++) {
            const A = nodes[a], B = nodes[b];
            if (rectsOverlap(A, B)) B.x = A.x + A.w + 1;
        }
    }

    let minX = Infinity, minY = Infinity;
    nodes.forEach(n => {
        if (n.x < minX) minX = n.x;
        if (n.y < minY) minY = n.y;
    });

    const shiftX = margin - minX;
    const shiftY = margin - minY;
    nodes.forEach(n => { n.x += shiftX; n.y += shiftY; });
}

function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function carveRooms(map, nodes) {
    for (const node of nodes) {
        for (let y = 0; y < node.h; y++) {
            for (let x = 0; x < node.w; x++) {
                const gx = node.x + x;
                const gy = node.y + y;
                if (map[gy] && map[gy][gx] !== undefined) {
                    map[gy][gx] = randomFloorGlyph();
                }
            }
        }
    }
}

function carveConnections(map, nodes) {
    const byId  = new Map(nodes.map(n => [n.id, n]));
    const carved = new Set();

    for (const node of nodes) {
        for (const linkId of node.links) {
            const key = [node.id, linkId].sort().join("--");
            if (carved.has(key)) continue;
            carved.add(key);
            const other = byId.get(linkId);
            if (!other) continue;
            carveCorridor(map, centerOf(node), centerOf(other));
        }
    }
}

function carveCorridor(map, a, b) {
    let x = clamp(a.x, 0, map[0].length - 1);
    let y = clamp(a.y, 0, map.length - 1);
    const tx = clamp(b.x, 0, map[0].length - 1);
    const ty = clamp(b.y, 0, map.length - 1);

    let guard = 0;
    const limit = map.length * map[0].length * 4;

    while (x !== tx && guard++ < limit) {
        if (map[y] && map[y][x] !== undefined) map[y][x] = randomFloorGlyph();
        x += Math.sign(tx - x);
    }

    while (y !== ty && guard++ < limit) {
        if (map[y] && map[y][x] !== undefined) map[y][x] = randomFloorGlyph();
        y += Math.sign(ty - y);
    }

    if (map[y] && map[y][x] !== undefined) map[y][x] = randomFloorGlyph();
}

// =============================================================================
// 10. GENERAL MATH & UTILITY FUNCTIONS
// =============================================================================

function isAdjacent(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

function centerOf(node) {
    return {
        x: node.x + Math.floor(node.w / 2),
        y: node.y + Math.floor(node.h / 2)
    };
}

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
    return arr[randInt(0, arr.length - 1)];
}