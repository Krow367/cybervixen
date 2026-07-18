// =============================================================================
// render.js — All Rendering Functions
// =============================================================================

import * as S from "./state.js";
import { WALL, PLAYER, SLOT_KEYS, PAUSE_OPTIONS, MAX_INVENTORY } from "./data.js";
import { isFloor }                                                 from "./utils.js";
import { hasLineOfSight }                                          from "./ai.js";
import {
    getPlayerAttack, getPlayerDefense, getPlayerSpeed, getPlayerVision,
    getPlayerMaxBandwidth, getPlayerBandwidthCharge,
    getPlayerMaxWeight, getPlayerTotalWeight
} from "./stats.js";

// Dynamically computed from the map-wrapper element each resize
export let VIEWPORT_W = 30;
export let VIEWPORT_H = 30;
export function setViewportW(v) { VIEWPORT_W = v; }
export function setViewportH(v) { VIEWPORT_H = v; }

// =============================================================================
// VISIBILITY
// =============================================================================

export function updateVisibility() {
    S.setVisibleTiles(Array.from({ length: S.mapH }, () => Array(S.mapW).fill(false)));

    S.visibleTiles[S.player.y][S.player.x] = true;
    S.explored[S.player.y][S.player.x]     = true;

    const r = getPlayerVision();
    for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
            if (dx * dx + dy * dy > r * r) continue;
            const tx = S.player.x + dx, ty = S.player.y + dy;
            if (tx >= 0 && tx < S.mapW && ty >= 0 && ty < S.mapH
                && hasLineOfSight(S.player.x, S.player.y, tx, ty)) {
                S.visibleTiles[ty][tx] = true;
                S.explored[ty][tx]     = true;
            }
        }
    }
}

// =============================================================================
// GLYPH LOOKUP
// =============================================================================

/** Returns the display glyph for a map coordinate. */
export function getGlyph(x, y) {
    if (x < 0 || x >= S.mapW || y < 0 || y >= S.mapH) return " ";
    if (!S.explored[y]?.[x]) return " ";

    const isVisible = S.visibleTiles[y]?.[x];

    if (S.inTargetMode && S.targetX === x && S.targetY === y)
        return `<span style="background-color: rgba(255, 0, 0, 0.6); color: white; font-weight: bold;">X</span>`;

    const lootHere = S.loot.find(l => l.x === x && l.y === y);

    if (isVisible) {
        if (S.player.x === x && S.player.y === y)
            return `<span style="color: #4e51fdff; font-weight: bold;">${PLAYER}</span>`;

        const enemy = S.enemies.find(e => e.alive && e.x === x && e.y === y);
        if (enemy)
            return `<span style="color: ${enemy.color || "#ca0202ff"}; font-weight: bold;">${enemy.glyph}</span>`;

        if (lootHere)
            return `<span style="color: #ffea00; font-weight: bold;">%</span>`;

        const tile = S.map[y][x];
        return tile === WALL ? (isBoundaryWall(x, y) ? WALL : " ") : tile;
    }

    if (lootHere)
        return `<span style="color: rgba(255, 234, 0, 0.25);">%</span>`;

    const tile = S.map[y][x];
    if (tile === WALL)
        return isBoundaryWall(x, y)
            ? `<span style="color: rgba(124, 255, 124, 0.2);">${WALL}</span>` : " ";
    return `<span style="color: rgba(124, 255, 124, 0.2);">${tile}</span>`;
}

function isBoundaryWall(x, y) {
    if (S.map[y]?.[x] !== WALL) return false;
    for (let dy = -1; dy <= 1; dy++) {
        const row = S.map[y + dy];
        if (!row) continue;
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            if (isFloor(row[x + dx])) return true;
        }
    }
    return false;
}

// =============================================================================
// SUB-RENDERS
// =============================================================================

/** Inventory / equipment configuration screen HTML. */
function renderInventoryHTML() {
    const atk      = getPlayerAttack();
    const def      = getPlayerDefense();
    const spd      = getPlayerSpeed();
    const vision   = getPlayerVision();
    const maxW     = getPlayerMaxWeight();
    const curW     = getPlayerTotalWeight();
    const cap      = getPlayerMaxBandwidth();
    const charge   = getPlayerBandwidthCharge();
    const band     = S.player.bandwidth;

    // ── Equipped column ───────────────────────────────────────────────────────
    let slotsHTML = `<div class="inv-column"><div class="inv-header">/ MOUNTED MODULES /</div>`;
    SLOT_KEYS.forEach((s, idx) => {
        const item    = S.equipped[s.cat][s.idx];
        const sel     = S.inventorySection === "equipped" && S.inventoryIndex === idx;
        const dur     = item ? ` [${item.durability ?? "?"}/${item.maxDurability ?? "?"}]` : "";
        const shd     = item ? ` SHD:${Math.round((item.shielding || 0) * 100)}%` : "";
        const label   = item ? `[ ${(item.name ?? "???").toUpperCase()}${dur}${shd} ]` : "- VACANT -";
        const cls     = sel ? "inv-row selected"
                            : (item && item.durability === 0 ? "inv-row corrupted" : "inv-row");
        if (s.group) slotsHTML += `<div class="inv-group-header">${s.group}</div>`;
        slotsHTML += `<div class="${cls}">${sel ? "> " : "  "}${s.label}: ${label}</div>`;
    });
    slotsHTML += `</div>`;

    // ── Archive column ────────────────────────────────────────────────────────
    let invHTML = `<div class="inv-column"><div class="inv-header">/ SOFTWARE ARCHIVE /</div>`;
    for (let idx = 0; idx < MAX_INVENTORY; idx++) {
        const item = S.inventory[idx] ?? null;
        const sel  = S.inventorySection === "inventory" && S.inventoryIndex === idx;
        const cur  = sel ? "> " : "  ";
        if (item) {
            const dur = ` [${item.durability ?? "?"}/${item.maxDurability ?? "?"}]`;
            const cls = sel ? "inv-row selected" : (item.durability === 0 ? "inv-row corrupted" : "inv-row");
            invHTML += `<div class="${cls}">${cur}[${(item.category ?? "???").toUpperCase()}] ${item.name ?? "???"}${dur}</div>`;
        } else {
            invHTML += `<div class="${sel ? "inv-row empty selected" : "inv-row empty"}">${cur}- EMPTY -</div>`;
        }
    }
    invHTML += `</div>`;

    // ── Details footer ────────────────────────────────────────────────────────
    let sel = null;
    if (S.inventorySection === "inventory") sel = S.inventory[S.inventoryIndex] ?? null;
    else { const s = SLOT_KEYS[S.inventoryIndex]; if (s) sel = S.equipped[s.cat][s.idx]; }

    const descText   = sel ? sel.desc : "Select a module to view specifications.";
    const weightText = sel && sel.category !== "driver" ? ` | WT: ${sel.weight}` : "";

    return `
<div class="inventory-screen">
    <div class="inventory-columns">${slotsHTML}${invHTML}</div>
    <div class="inventory-details">
        <div class="details-desc">${descText}${weightText}</div>
        <div class="details-stats">
            <span>ATK: ${atk}</span><span>DEF: ${def}</span><span>SPD: ${spd}</span>
            <span>SIGHT: ${vision}</span><span>BAND: ${band}/${cap} (+${charge})</span>
            <span>LOAD: ${curW}/${maxW}</span>
        </div>
    </div>
</div>`;
}

/** Pause / system menu overlay HTML. */
function renderPauseHTML() {
    let opts = "";
    PAUSE_OPTIONS.forEach((opt, idx) => {
        const sel = idx === S.pauseMenuIndex;
        opts += `<div class="${sel ? "inv-row selected" : "inv-row"}">${sel ? "> " : "  "}${opt}</div>`;
    });
    return `
<div class="pause-screen">
    <div class="pause-title">// SYSTEM PAUSE //</div>
    <div class="pause-options">${opts}</div>
    <div class="pause-hint">[ARROWS] SELECT ~ [ENTER] CONFIRM ~ [ESC] RESUME</div>
</div>`;
}

/** Reset confirmation overlay HTML. */
function renderResetConfirmHTML() {
    return `
<div class="pause-screen">
    <div class="pause-title" style="color: #ff4444; text-shadow: 0 0 12px rgba(255, 68, 68, 0.6);">// WARNING //</div>
    <div style="font-size: calc(2vh * var(--fc-scale)); text-align: center; margin: 15px 0;">
        ARE YOU SURE YOU WANT TO REFORMAT ALL DATA AND RECONNECT?<br>THIS ACTION CANNOT BE UNDONE.
    </div>
    <div class="pause-hint">[Y] YES, RESET ~ [N] NO, CANCEL</div>
</div>`;
}

/** ASCII durability-bar pane for the sidebar. */
function renderPartsHTML() {
    const BAR_W = 10;
    const allEquipped = [
        ...S.equipped.script,
        ...S.equipped.bandwidth,
        ...S.equipped.driver,
        ...S.equipped.plugin
    ].filter(Boolean).slice(0, 4);

    let html = allEquipped.map(item => {
        const ratio    = item.maxDurability > 0 ? item.durability / item.maxDurability : 0;
        const filled   = Math.round(ratio * BAR_W);
        const color    = ratio > 0.5 ? "#a3ffa3" : ratio > 0.2 ? "#ffea00" : "#ff4444";
        const fillChar = ratio > 0.5 ? "#" : ratio > 0.2 ? "+" : "-";
        const barFill  = fillChar.repeat(filled);
        const barEmpty = "\u00B7".repeat(BAR_W - filled);
        const label    = (item.name ?? "???").toUpperCase().slice(0, 14).padEnd(14);
        const shd      = Math.round((item.shielding || 0) * 100);
        return `<div class="reserved-row" style="color: ${color};">`
            + `${label} [<span class="dur-bar-fill">${barFill}</span>`
            + `<span class="dur-bar-empty">${barEmpty}</span>] SHD:${shd}%</div>`;
    }).join("");

    const emptyBar = "\u00B7".repeat(BAR_W);
    for (let i = allEquipped.length; i < 4; i++)
        html += `<div class="reserved-row">${"-".padEnd(14)} [<span class="dur-bar-empty">${emptyBar}</span>]</div>`;

    return html;
}

// =============================================================================
// MAIN RENDER
// =============================================================================

export function render() {
    const root = document.getElementById("foxclaw-root");
    if (!root) return;

    updateVisibility();

    const camX = S.player.x - Math.floor(VIEWPORT_W / 2);
    const camY = S.player.y - Math.floor(VIEWPORT_H / 2) + 2;

    const rows = [];
    for (let y = 0; y < VIEWPORT_H; y++) {
        let line = "";
        for (let x = 0; x < VIEWPORT_W; x++) line += getGlyph(camX + x, camY + y);
        rows.push(line);
    }

    const combatStatus = S.inCombat ? "ACTIVE" : "STANDBY";

    let mainHeader, mainContent, mainFooter;
    if (S.inResetConfirm) {
        mainHeader  = "/ CONFIRMATION REQUIRED /";
        mainContent = renderResetConfirmHTML();
        mainFooter  = "[Y] CONFIRM RESET ~ [N] ABORT";
    } else if (S.inPauseMenu) {
        mainHeader  = "/ SYSTEM MENU /";
        mainContent = renderPauseHTML();
        mainFooter  = "[ARROWS] NAV ~ [ENTER] CONFIRM ~ [ESC] RESUME";
    } else if (S.inInventoryScreen) {
        mainHeader  = "/ MODULE CONFIG /";
        mainContent = renderInventoryHTML();
        mainFooter  = "[ARROWS] NAV ~ [TAB] LISTS ~ [ENTER] MOUNT/UNMOUNT ~ [ESC] CLOSE";
    } else {
        mainHeader  = "";
        mainContent = `<pre class="foxclaw-map">${rows.join("\n")}</pre>`;
        mainFooter  = "[WASD/ARROWS] MOVE ~ [I] MODULES ~ [F] REMOTE ~ [ESC] PAUSE";
    }

    root.innerHTML = `
<div class="foxclaw-container">
    <div class="foxclaw-bottom-row">
        <div class="foxclaw-viewport-col">
            <div class="foxclaw-log-strip">
                <div class="foxclaw-panel log-panel">
                    <div class="panel-header">/ LOG /</div>
                    <div class="panel-content log-content">${S.messages.slice(-5).join("<br>")}</div>
                </div>
                <div class="foxclaw-panel calc-panel">
                    <div class="panel-header">/ CALC /</div>
                    <div class="panel-content calc-content">${S.combatLog.slice(-5).join("<br>")}</div>
                </div>
            </div>
            <div class="foxclaw-panel map-panel">
                <div class="panel-header">${mainHeader}</div>
                <div class="map-wrapper">${mainContent}</div>
                <div class="panel-footer">${mainFooter}</div>
            </div>
        </div>
        <div class="foxclaw-sidebar">
            <div class="foxclaw-panel status-panel">
                <div class="panel-header">/ STATUS /</div>
                <div class="panel-content status-content">
                    <div class="status-row"><span class="label">KERNEL:</span> <span class="value">${S.player.hp}/${S.player.maxHP || 150} HP</span></div>
                    <div class="status-row"><span class="label">BAND:  </span> <span class="value">${S.player.bandwidth}/${getPlayerMaxBandwidth()}</span></div>
                    <div class="status-row"><span class="label">ATK:   </span> <span class="value">${getPlayerAttack()}</span></div>
                    <div class="status-row"><span class="label">DEF:   </span> <span class="value">${getPlayerDefense()}</span></div>
                    <div class="status-row"><span class="label">SPD:   </span> <span class="value">${getPlayerSpeed()}</span></div>
                    <div class="status-row"><span class="label">SIGHT: </span> <span class="value">${getPlayerVision()}</span></div>
                    <div class="status-row"><span class="label">LOAD:  </span> <span class="value">${getPlayerTotalWeight()}/${getPlayerMaxWeight()} WT</span></div>
                    <div class="status-row"><span class="label">COMBAT:</span> <span class="value">${combatStatus}</span></div>
                </div>
            </div>
            <div class="foxclaw-panel reserved-panel">
                <div class="panel-header">/ PARTS /</div>
                <div class="panel-content reserved-content">${renderPartsHTML()}</div>
            </div>
        </div>
    </div>
</div>`;
}
