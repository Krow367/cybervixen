// =============================================================================
// input.js — Keyboard Input & Game Actions
// =============================================================================

import * as S from "./state.js";
import { PAUSE_OPTIONS, SLOT_KEYS, MAX_INVENTORY } from "./data.js";
import { clamp }                                    from "./utils.js";
import { render }                                   from "./render.js";
import { executeSequentialAttacks, pushMessage, pushCombat }          from "./combat.js";
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

    if (S.gameWon) {
        if (e.key === "Enter" || e.key === "Escape") {
            S.setGameWon(false);
            wipeSave();
            if (stopGame) stopGame();
            else window.location.reload();
        }
        return;
    }

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

    // ── Help Sub-Screen ──────────────────────────────────────────────────────
    if (S.pauseSubScreen === "help") {
        if (e.key === "Escape" || e.key === "Backspace" || e.key === "Enter" || key === "p") {
            S.setPauseSubScreen(null);
            S.setPauseMenuIndex(1); // Return to HELP option
        }
        render();
        return;
    }

    // ── Options Sub-Screen ───────────────────────────────────────────────────
    if (S.pauseSubScreen === "options") {
        const OPTS_COUNT = 3; // Scale, Theme, Back
        if (e.key === "Escape" || key === "p") {
            S.setPauseSubScreen(null);
            S.setPauseMenuIndex(2); // Return to OPTIONS option
            render();
            return;
        }

        if (e.key === "ArrowUp" || key === "w") {
            S.setPauseMenuIndex((S.pauseMenuIndex - 1 + OPTS_COUNT) % OPTS_COUNT);
        }
        if (e.key === "ArrowDown" || key === "s") {
            S.setPauseMenuIndex((S.pauseMenuIndex + 1) % OPTS_COUNT);
        }

        const scales = [1.0, 1.3, 1.6];
        const themes = ["green", "amber", "cyan"];

        if (S.pauseMenuIndex === 0) {
            let idx = scales.indexOf(S.options.uiScale);
            if (idx === -1) idx = 1;
            if (e.key === "ArrowLeft" || key === "a") {
                S.options.uiScale = scales[(idx - 1 + scales.length) % scales.length];
            }
            if (e.key === "ArrowRight" || key === "d") {
                S.options.uiScale = scales[(idx + 1) % scales.length];
            }
        } else if (S.pauseMenuIndex === 1) {
            let idx = themes.indexOf(S.options.theme);
            if (idx === -1) idx = 0;
            if (e.key === "ArrowLeft" || key === "a") {
                S.options.theme = themes[(idx - 1 + themes.length) % themes.length];
            }
            if (e.key === "ArrowRight" || key === "d") {
                S.options.theme = themes[(idx + 1) % themes.length];
            }
        } else if (S.pauseMenuIndex === 2) {
            if (e.key === "Enter") {
                S.setPauseSubScreen(null);
                S.setPauseMenuIndex(2); // Return to OPTIONS option
            }
        }
        render();
        return;
    }

    // ── Main Pause Menu ──────────────────────────────────────────────────────
    if (e.key === "Escape" || key === "p") {
        S.setInPauseMenu(false);
        render();
        return;
    }

    if (e.key === "ArrowUp"   || key === "w")
        S.setPauseMenuIndex((S.pauseMenuIndex - 1 + PAUSE_OPTIONS.length) % PAUSE_OPTIONS.length);
    if (e.key === "ArrowDown" || key === "s")
        S.setPauseMenuIndex((S.pauseMenuIndex + 1) % PAUSE_OPTIONS.length);

    if (e.key === "Enter") {
        const choice = PAUSE_OPTIONS[S.pauseMenuIndex];
        if (choice === "RESUME") {
            S.setInPauseMenu(false);
        } else if (choice === "HELP") {
            S.setPauseSubScreen("help");
            S.setPauseMenuIndex(0);
        } else if (choice === "OPTIONS") {
            S.setPauseSubScreen("options");
            S.setPauseMenuIndex(0);
        } else if (choice === "RESTART") {
            wipeSave();
            S.resetState();
            S.setInPauseMenu(false);
        } else if (choice === "QUIT TO TERMINAL") {
            wipeSave();
            if (stopGame) {
                stopGame();
            } else {
                alert("Exiting foxClaw connection...", () => {
                    window.location.reload();
                });
            }
        }
    }
    render();
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

    if (key === "x" || e.key === "Delete" || e.key === "Backspace") {
        if (S.inventorySection === "inventory") {
            const item = S.inventory[S.inventoryIndex];
            if (item) {
                S.inventory.splice(S.inventoryIndex, 1);
                S.loot.push({ x: S.player.x, y: S.player.y, item });
                pushMessage(`SYSTEM: Dropped module [${item.name}] on the floor.`);
                S.setInventoryIndex(Math.min(S.inventoryIndex, Math.max(0, S.inventory.length - 1)));
            }
        } else {
            pushMessage("SYSTEM WARNING: Unmount module before dropping.");
        }
        render();
        return;
    }

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

    const maxSlots = (item.category === "bandwidth" || item.category === "driver") ? 1 : 2;
    const slotIdx  = S.equipped[item.category].findIndex((v, i) => i < maxSlots && v === null);
    if (slotIdx === -1) { pushMessage(`NO VACANT SLOT FOR ${(item.category ?? "???").toUpperCase()}.`); return; }

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
    if (item.fused) {
        item.durability = 0;
        pushMessage(`SYSTEM WARNING: Fused module [${item.name}] was corrupted on unmount.`);
    } else {
        pushMessage(`SYSTEM: Unmounted module [${item.name}].`);
    }
    S.inventory.push(item);
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
    let isMove = false;

    if (e.key === "ArrowUp" || key === "w" || e.key === "Numpad8" || key === "8" || key === "k") { dx = 0; dy = -1; isMove = true; }
    else if (e.key === "ArrowDown" || key === "s" || e.key === "Numpad2" || key === "2" || key === "j") { dx = 0; dy = 1; isMove = true; }
    else if (e.key === "ArrowLeft" || key === "a" || e.key === "Numpad4" || key === "4" || key === "h") { dx = -1; dy = 0; isMove = true; }
    else if (e.key === "ArrowRight" || key === "d" || e.key === "Numpad6" || key === "6" || key === "l") { dx = 1; dy = 0; isMove = true; }
    else if (e.key === "Numpad7" || key === "7" || key === "y") { dx = -1; dy = -1; isMove = true; }
    else if (e.key === "Numpad9" || key === "9" || key === "u") { dx = 1; dy = -1; isMove = true; }
    else if (e.key === "Numpad1" || key === "1" || key === "b") { dx = -1; dy = 1; isMove = true; }
    else if (e.key === "Numpad3" || key === "3" || key === "n") { dx = 1; dy = 1; isMove = true; }

    if (isMove) {
        S.setTargetX(clamp(S.targetX + dx, 0, S.mapW - 1));
        S.setTargetY(clamp(S.targetY + dy, 0, S.mapH - 1));
        render();
        return;
    }

    if (e.key === "Enter") fireRemoteScript();
}

function fireRemoteScript() {
    const enemy = S.enemies.find(e => e.alive && e.x === S.targetX && e.y === S.targetY);
    if (!enemy) { pushMessage("No target detected at coordinate."); S.setInTargetMode(false); render(); return; }

    const dist = Math.abs(S.targetX - S.player.x) + Math.abs(S.targetY - S.player.y);
    if (!hasLineOfSight(S.player.x, S.player.y, S.targetX, S.targetY)) {
        pushMessage("SYSTEM: Transmission path blocked.");
        S.setInTargetMode(false);
        render();
        return;
    }

    executeSequentialAttacks(S.player, enemy, dist);

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

    if (key === " " || key === ".") {
        pushMessage("SYSTEM: Rested. Auto-repair active.");
        if (S.equipped) {
            Object.values(S.equipped).flat().forEach(m => {
                if (m && m.durability > 0 && m.durability < m.maxDurability) {
                    m.durability = Math.min(m.maxDurability, m.durability + 3);
                }
            });
        }
        S.player.bandwidth = Math.min(getPlayerMaxBandwidth(), S.player.bandwidth + getPlayerBandwidthCharge());
        enemyTurn();
        render();
        return;
    }

    let dx = 0, dy = 0;
    let isMoveKey = false;

    if (e.key === "ArrowUp" || key === "w" || e.key === "Numpad8" || key === "8" || key === "k") { dx = 0; dy = -1; isMoveKey = true; }
    else if (e.key === "ArrowDown" || key === "s" || e.key === "Numpad2" || key === "2" || key === "j") { dx = 0; dy = 1; isMoveKey = true; }
    else if (e.key === "ArrowLeft" || key === "a" || e.key === "Numpad4" || key === "4" || key === "h") { dx = -1; dy = 0; isMoveKey = true; }
    else if (e.key === "ArrowRight" || key === "d" || e.key === "Numpad6" || key === "6" || key === "l") { dx = 1; dy = 0; isMoveKey = true; }
    else if (e.key === "Numpad7" || key === "7" || key === "y") { dx = -1; dy = -1; isMoveKey = true; }
    else if (e.key === "Numpad9" || key === "9" || key === "u") { dx = 1; dy = -1; isMoveKey = true; }
    else if (e.key === "Numpad1" || key === "1" || key === "b") { dx = -1; dy = 1; isMoveKey = true; }
    else if (e.key === "Numpad3" || key === "3" || key === "n") { dx = 1; dy = 1; isMoveKey = true; }

    if (!isMoveKey) return;
    if (S.inCombat && (e.repeat || S.heldKeys.has(e.code))) return;

    S.heldKeys.add(e.code);
    tryMove(dx, dy);
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
        executeSequentialAttacks(S.player, enemy, 1);

        // Ticks proceed: charge bandwidth
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

    // Movement consumes 1 bandwidth
    const moveCost = 1;
    if (S.player.bandwidth < moveCost) {
        pushMessage("SYSTEM ERROR: INSUFFICIENT BANDWIDTH TO EXECUTE DRIVER INSTRUCTION.");
        return;
    }

    S.player.bandwidth -= moveCost;
    S.player.x = nx;
    S.player.y = ny;

    if (S.player.x === S.exitX && S.player.y === S.exitY) {
        const firewall = S.enemies.find(e => e.alive && e.type === "firewall");
        if (firewall) {
            pushMessage("GATEWAY FIREWALL ONLINE: Access to Core denied.");
        } else {
            if (S.securityLevel === 3) {
                S.setGameWon(true);
                pushMessage("SYSTEM: Final breach successful. Loading broadcast...");
            } else {
                const nextSec = S.securityLevel + 1;
                pushMessage(`SYSTEM: Subnet cleared. Transitioning to Security Level ${nextSec}...`);
                // Subnet transition bonus: heal 50 HP (precious healing between levels)
                S.player.hp = Math.min(S.player.maxHP, S.player.hp + 50);
                S.setSecurityLevel(nextSec);
                S.resetState(true);
            }
            render();
            return;
        }
    }

    pickUpLoot();
    // Ticks proceed: charge bandwidth
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
