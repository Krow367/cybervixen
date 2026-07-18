// =============================================================================
// input.js — Keyboard Input & Game Actions
// =============================================================================

import * as S from "./state.js";
import { PAUSE_OPTIONS, SLOT_KEYS, MAX_INVENTORY } from "./data.js";
import { clamp }                                    from "./utils.js";
import { render }                                   from "./render.js";
import { attack, pushMessage, pushCombat }          from "./combat.js";
import { enemyTurn, hasLineOfSight }                from "./ai.js";
import { saveGame, loadGame, wipeSave }                       from "./save.js";
import {
    getPlayerMaxBandwidth, getPlayerBandwidthCharge,
    getPlayerMaxWeight, getPlayerTotalWeight
} from "./stats.js";
import { resetState } from "./state.js";

// =============================================================================
// KEY HANDLERS
// =============================================================================

export function handleKeyDown(e, onDone, stopGame) {
    const key = e.key.toLowerCase();

    if (S.gameOver) {
        if (key === "y") {
            S.setGameOver(false);
            S.setPendingAction(null);
            S.resetState();
            render();
            document.getElementById("alert-frame")?.classList.add("hidden");
        }
        return;
    }

    if (S.inResetConfirm)    return handleResetConfirmKeys(e, key);
    if (S.inPauseMenu)       return handlePauseKeys(e, key, onDone, stopGame);
    if (S.inInventoryScreen) return handleInventoryKeys(e, key);
    if (S.inTargetMode)      return handleTargetKeys(e, key);

    handleNormalKeys(e, key);
}

export function handleKeyUp(e) {
    S.heldKeys.delete(e.code);
}

// =============================================================================
// RESET CONFIRMATION
// =============================================================================

function handleResetConfirmKeys(e, key) {
    if (key === "y") {
        S.setInResetConfirm(false);
        wipeSave();
        S.resetState();
        render();
    } else if (key === "n" || e.key === "Escape") {
        S.setInResetConfirm(false);
        S.setInPauseMenu(true);
        render();
    }
}

// =============================================================================
// PAUSE MENU
// =============================================================================

function handlePauseKeys(e, key, onDone, stopGame) {
    if (e.key === "Escape") { S.setInPauseMenu(false); render(); return; }

    if (e.key === "ArrowUp"   || key === "w")
        S.setPauseMenuIndex((S.pauseMenuIndex - 1 + PAUSE_OPTIONS.length) % PAUSE_OPTIONS.length);
    else if (e.key === "ArrowDown" || key === "s")
        S.setPauseMenuIndex((S.pauseMenuIndex + 1) % PAUSE_OPTIONS.length);
    else if (e.key === "Enter")
        return handlePauseMenuSelect(onDone, stopGame);

    render();
}

function handlePauseMenuSelect(onDone, stopGame) {
    const choice = PAUSE_OPTIONS[S.pauseMenuIndex];
    S.setInPauseMenu(false);

    if (choice === "RESUME")           { render(); return; }
    if (choice === "RESET")             { S.setInResetConfirm(true); render(); return; }
    if (choice === "SAVE AND QUIT TO TERMINAL") { saveGame(); stopGame(onDone); return; }
}

// =============================================================================
// INVENTORY SCREEN
// =============================================================================

function handleInventoryKeys(e, key) {
    if (e.key === "Escape" || key === "i") { S.setInInventoryScreen(false); render(); return; }

    if (e.key === "Tab" || e.key === "ArrowLeft" || e.key === "ArrowRight" || key === "a" || key === "d") {
        S.setInventorySection(S.inventorySection === "inventory" ? "equipped" : "inventory");
        S.setInventoryIndex(0);
        render();
        return;
    }

    const maxIdx = S.inventorySection === "inventory" ? MAX_INVENTORY : SLOT_KEYS.length;
    if (e.key === "ArrowUp"   || key === "w") S.setInventoryIndex((S.inventoryIndex - 1 + maxIdx) % maxIdx);
    if (e.key === "ArrowDown" || key === "s") S.setInventoryIndex((S.inventoryIndex + 1) % maxIdx);

    if (e.key === "Enter") { handleInventoryAction(); return; }

    render();
}

function handleInventoryAction() {
    if (S.inventorySection === "inventory") {
        equipFromInventory();
    } else {
        unequipToInventory();
    }
    S.player.bandwidth = Math.min(getPlayerMaxBandwidth(), S.player.bandwidth);
    render();
}

function equipFromInventory() {
    const item = S.inventory[S.inventoryIndex];
    if (!item) return;

    const maxSlots = item.category === "bandwidth" ? 1 : 2;
    const slotIdx  = S.equipped[item.category].findIndex((v, i) => i < maxSlots && v === null);
    if (slotIdx === -1) { pushMessage(`NO VACANT SLOT FOR ${(item.category ?? "???").toUpperCase()}.`); return; }
    if (S.inventory.length >= MAX_INVENTORY) { pushMessage("ARCHIVE FULL: Cannot equip — no free archive slots."); return; }

    S.inventory.splice(S.inventoryIndex, 1);
    S.equipped[item.category][slotIdx] = item;

    const load = getPlayerTotalWeight(), maxLoad = getPlayerMaxWeight();
    if (load > maxLoad) pushMessage(`WARNING: Load ${load}/${maxLoad} exceeds capacity. Speed reduced.`);
    else                pushMessage(`SYSTEM: Mounted module [${item.name}].`);

    S.setInventoryIndex(Math.min(S.inventoryIndex, Math.max(0, S.inventory.length - 1)));
}

function unequipToInventory() {
    const slot = SLOT_KEYS[S.inventoryIndex];
    const item = S.equipped[slot.cat][slot.idx];
    if (!item) return;
    if (S.inventory.length >= MAX_INVENTORY) { pushMessage("ARCHIVE FULL: Cannot unmount — no free archive slots."); return; }

    S.equipped[slot.cat][slot.idx] = null;
    S.inventory.push(item);
    pushMessage(`SYSTEM: Unmounted module [${item.name}].`);
}

// =============================================================================
// TARGET MODE
// =============================================================================

function handleTargetKeys(e, key) {
    if (e.key === "Escape" || key === "f") {
        S.setInTargetMode(false);
        pushMessage("Target mode aborted.");
        render();
        return;
    }

    let dx = 0, dy = 0;
    if (e.key === "ArrowUp"    || key === "w") dy = -1;
    if (e.key === "ArrowDown"  || key === "s") dy =  1;
    if (e.key === "ArrowLeft"  || key === "a") dx = -1;
    if (e.key === "ArrowRight" || key === "d") dx =  1;

    if (dx !== 0 || dy !== 0) {
        S.setTargetX(clamp(S.targetX + dx, 0, S.mapW - 1));
        S.setTargetY(clamp(S.targetY + dy, 0, S.mapH - 1));
        render();
        return;
    }

    if (e.key === "Enter") fireRemoteScript();
}

function fireRemoteScript() {
    const script = S.equipped.script.find(s => s && s.subcategory === "remote" && s.durability > 0);
    if (!script) { S.setInTargetMode(false); render(); return; }

    if (S.player.bandwidth < (script.cost || 0)) { pushMessage("SYSTEM: INSUFFICIENT BANDWIDTH."); return; }

    const enemy = S.enemies.find(e => e.alive && e.x === S.targetX && e.y === S.targetY);
    if (!enemy) { pushMessage("No target detected at coordinate."); return; }

    const dist = Math.abs(S.targetX - S.player.x) + Math.abs(S.targetY - S.player.y);
    if (dist > script.range)  { pushMessage("SYSTEM: Target out of transmission range."); return; }
    if (!hasLineOfSight(S.player.x, S.player.y, S.targetX, S.targetY))
        { pushMessage("SYSTEM: Transmission path blocked."); return; }

    S.player.bandwidth -= script.cost || 0;
    pushCombat(`Fired ${script.name} at ${enemy.type}.`);
    attack(S.player, enemy);

    S.setInTargetMode(false);
    S.player.bandwidth = Math.min(getPlayerMaxBandwidth(), S.player.bandwidth + getPlayerBandwidthCharge());

    if (!enemy.alive) pushCombat(`The ${enemy.type} collapses.`);
    enemyTurn();
    render();
}

// =============================================================================
// NORMAL GAMEPLAY KEYS
// =============================================================================

function handleNormalKeys(e, key) {
    if (e.key === "Escape") {
        S.setInPauseMenu(true);
        S.setPauseMenuIndex(0);
        render();
        return;
    }

    if (key === "i") {
        S.setInInventoryScreen(!S.inInventoryScreen);
        S.setInventoryIndex(0);
        S.setInventorySection("inventory");
        render();
        return;
    }

    if (key === "f") {
        const rs = S.equipped.script.find(s => s && s.subcategory === "remote" && s.durability > 0);
        if (!rs) { pushMessage("SYSTEM ERROR: NO FUNCTIONAL REMOTE SCRIPT DETECTED."); return; }
        S.setInTargetMode(true);
        S.setTargetX(S.player.x);
        S.setTargetY(S.player.y);
        pushMessage("TARGET MODE ARMED. ARROWS SELECT, ENTER FIRES.");
        render();
        return;
    }

    const isMoveKey = ["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key)
                   || ["w","a","s","d"].includes(key);
    if (!isMoveKey) return;
    if (S.inCombat && (e.repeat || S.heldKeys.has(e.code))) return;

    S.heldKeys.add(e.code);

    if (e.key === "ArrowUp"    || key === "w") tryMove( 0, -1);
    if (e.key === "ArrowDown"  || key === "s") tryMove( 0,  1);
    if (e.key === "ArrowLeft"  || key === "a") tryMove(-1,  0);
    if (e.key === "ArrowRight" || key === "d") tryMove( 1,  0);
}

// =============================================================================
// MOVEMENT & LOOT
// =============================================================================

function tryMove(dx, dy) {
    const nx = S.player.x + dx;
    const ny = S.player.y + dy;

    if (S.map[ny]?.[nx] === "#") { pushMessage("You bump into a wall."); return; }

    const enemy = S.enemies.find(e => e.alive && e.x === nx && e.y === ny);
    if (enemy) {
        attack(S.player, enemy);
        S.player.bandwidth = Math.min(getPlayerMaxBandwidth(), S.player.bandwidth + getPlayerBandwidthCharge());
        if (enemy.alive) {
            enemyTurn();
        } else {
            pushCombat(`The ${enemy.type} collapses.`);
            S.player.x = nx;
            S.player.y = ny;
            pickUpLoot();
            enemyTurn();
        }
        render();
        return;
    }

    S.player.x = nx;
    S.player.y = ny;
    pickUpLoot();
    S.player.bandwidth = Math.min(getPlayerMaxBandwidth(), S.player.bandwidth + getPlayerBandwidthCharge());
    enemyTurn();
    render();
}

/** Picks up any loot item at the player's current position. */
function pickUpLoot() {
    const idx = S.loot.findIndex(l => l.x === S.player.x && l.y === S.player.y);
    if (idx === -1) return;
    const found = S.loot[idx];
    S.inventory.push(found.item);
    pushMessage(`SYSTEM: Loaded module [${found.item.name}]. Press 'I' to configure.`);
    S.loot.splice(idx, 1);
}
