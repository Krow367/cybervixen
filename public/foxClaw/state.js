// =============================================================================
// state.js — Mutable Game State & Reset
// =============================================================================

import { ITEM_DB }                           from "./data.js";
import { randInt, pick, isFloor }            from "./utils.js";
import { carveNetworkLevel }                 from "./mapgen.js";
import { spawnEnemy, spawnAtEntry, findEnemySpawn, findOpenTile } from "./spawn.js";

// ── World geometry ────────────────────────────────────────────────────────────
export let mapW  = 50;
export let mapH  = 30;
export let map   = [];
export let graph = null;

// ── Visibility ────────────────────────────────────────────────────────────────
export let explored     = [];
export let visibleTiles = [];

// ── Entities ──────────────────────────────────────────────────────────────────
export let player  = {};
export let enemies = [];
export let loot    = [];

// ── Player loadout ────────────────────────────────────────────────────────────
export let inventory = [];
export let equipped  = {
    script:    [null, null],
    bandwidth: [null],
    driver:    [null, null],
    plugin:    [null, null]
};

// ── Logs ──────────────────────────────────────────────────────────────────────
export let messages  = [];
export let combatLog = [];

// ── UI state ──────────────────────────────────────────────────────────────────
export let inInventoryScreen = false;
export let inventoryIndex    = 0;
export let inventorySection  = "inventory";
export let inTargetMode      = false;
export let targetX = 0;
export let targetY = 0;

export let inPauseMenu    = false;
export let pauseMenuIndex = 0;

// ── Gameplay flags ────────────────────────────────────────────────────────────
export let gameOver      = false;
export let pendingAction = null;
export let inCombat      = false;
export let inResetConfirm = false;
export const heldKeys    = new Set();

// ── Setters (allow other modules to mutate exported let primitives) ───────────
export function setMapW(v)               { mapW = v; }
export function setMapH(v)               { mapH = v; }
export function setMap(v)                { map  = v; }
export function setGraph(v)              { graph = v; }
export function setExplored(v)           { explored = v; }
export function setVisibleTiles(v)       { visibleTiles = v; }
export function setPlayer(v)             { player = v; }
export function setEnemies(v)            { enemies = v; }
export function setLoot(v)               { loot = v; }
export function setInventory(v)          { inventory = v; }
export function setEquipped(v)           { equipped = v; }
export function setMessages(v)           { messages = v; }
export function setCombatLog(v)          { combatLog = v; }
export function setInInventoryScreen(v)  { inInventoryScreen = v; }
export function setInventoryIndex(v)     { inventoryIndex = v; }
export function setInventorySection(v)   { inventorySection = v; }
export function setInTargetMode(v)       { inTargetMode = v; }
export function setTargetX(v)            { targetX = v; }
export function setTargetY(v)            { targetY = v; }
export function setInPauseMenu(v)        { inPauseMenu = v; }
export function setPauseMenuIndex(v)     { pauseMenuIndex = v; }
export function setGameOver(v)           { gameOver = v; }
export function setPendingAction(v)      { pendingAction = v; }
export function setInCombat(v)           { inCombat = v; }
export function setInResetConfirm(v)     { inResetConfirm = v; }

/** Pushes a message to the narrative log (without triggering a render). */
export function pushMessageRaw(text) { messages.push(text); }
/** Pushes a line to the combat log (without triggering a render). */
export function pushCombatRaw(text)  { combatLog.push(text); }

// =============================================================================
// RESET — wipes everything and generates a fresh game world
// =============================================================================

export function resetState() {
    gameOver      = false;
    pendingAction = null;
    inCombat      = false;
    heldKeys.clear();
    inPauseMenu    = false;
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
        x: spawn.x, y: spawn.y,
        hp: 150, maxHP: 150,
        type: "player",
        bandwidth: 0,
        equipped: null // alias — player uses module-level `equipped`
    };

    inventory = [
        { ...ITEM_DB["ping_flood.sh"] },
        { ...ITEM_DB["firewall_bypass"] },
        { ...ITEM_DB["overclock_mod"] }
    ];
    equipped = {
        script:    [ { ...ITEM_DB["backdoor.sh"] }, null ],
        bandwidth: [ { ...ITEM_DB["sat_link"] } ],
        driver:    [ { ...ITEM_DB["standard_driver"] }, null ],
        plugin:    [ null, null ]
    };

    // Point player's equipped reference at the module-level object so
    // getEntity* functions work symmetrically on both player and enemies.
    player.equipped  = equipped;

    // Inline initial bandwidth — avoids importing stats.js (circular dependency).
    // sat_link has capacity:10, so starting bandwidth = 10.
    player.bandwidth = equipped.bandwidth.reduce(
        (cap, b) => cap + (b && b.durability > 0 ? (b.capacity || 0) : 0), 0
    );

    messages  = ["Modules online. Use WASD or Arrow Keys to move."];
    combatLog = ["COMBAT LOG STANDBY"];

    loot = [];
    for (let i = 0; i < randInt(4, 6); i++) {
        const pos = findOpenTile(map);
        if (pos) loot.push({ x: pos.x, y: pos.y, item: { ...ITEM_DB[pick(Object.keys(ITEM_DB))] } });
    }

    enemies = [];
    graph.nodes.forEach(n => {
        if (n.type === "entry") return;
        const c   = nodeCenter(n);
        let type;
        if (n.type === "firewall") {
            type = "firewall"; // Guaranteed Firewall boss at the gateway node
        } else {
            type = n.type === "core"  ? pick(["crawler", "sentinel"])             :
                   n.type === "cache" ? pick(["sniffer",  "sentinel"])             :
                                        pick(["daemon",   "watchdog", "sniffer"]);
        }
        const pos = isFloor(map[c.y]?.[c.x]) ? c : findEnemySpawn(graph, map, spawn);
        enemies.push(spawnEnemy(type, pos));
    });
}

// Local helper — avoids importing utils.js centerOf to prevent potential cycles
function nodeCenter(node) {
    return {
        x: node.x + Math.floor(node.w / 2),
        y: node.y + Math.floor(node.h / 2)
    };
}
