// =============================================================================
// combat.js — Attack Resolution, Shielding & Player Death
// =============================================================================

import * as S from "./state.js";
import { getEntityAttack, getEntityDefense } from "./stats.js";
import { alert }                             from "../../io.js";
import { wipeSave }                          from "./save.js";

// =============================================================================
// SHIELDING — hit interception
// =============================================================================

/** Collects all functional (durability > 0) modules from an entity's loadout. */
function getActiveModules(entity) {
    if (!entity.equipped) return [];
    return Object.values(entity.equipped).flat().filter(m => m && m.durability > 0);
}

/**
 * Determines which module (if any) intercepts an incoming hit.
 * Each module independently rolls against its shielding value.
 * First module to succeed wins; if none do, the Kernel takes the hit.
 *
 * @returns {object|null} Intercepting module, or null for a direct kernel hit.
 */
function resolveHitTarget(entity) {
    for (const mod of getActiveModules(entity))
        if (Math.random() < (mod.shielding || 0)) return mod;
    return null;
}

/** Applies damage to a module, clamping durability to 0. Logs corruption. */
function damageModule(mod, damage, ownerLabel) {
    mod.durability = Math.max(0, mod.durability - damage);
    if (mod.durability === 0)
        S.pushCombatRaw(`[${ownerLabel}] Module [${(mod.name ?? "???").toUpperCase()}] has been CORRUPTED.`);
}

// =============================================================================
// COMBAT
// =============================================================================

/**
 * Resolves a single attack between two entities.
 * Modules may intercept the hit before the Kernel absorbs it.
 * Does NOT call render — callers are responsible for the final render.
 */
export function attack(attacker, defender) {
    const damage         = Math.max(1, getEntityAttack(attacker) - getEntityDefense(defender));
    const ownerLabel     = defender === S.player ? "KERNEL" : (defender.type ?? "ENTITY").toUpperCase();
    const attackerLabel  = (attacker.type ?? "ENTITY").toUpperCase();
    const weaponName     = attacker.equipped
        ?.script.find(s => s && s.durability > 0)?.name ?? "standard scan";

    const interceptMod = resolveHitTarget(defender);
    if (interceptMod) {
        damageModule(interceptMod, damage, ownerLabel);
        S.pushCombatRaw(`${attackerLabel} → ${weaponName}: ${damage} DMG intercepted by [${(interceptMod.name ?? "???").toUpperCase()}]`);
    } else {
        defender.hp -= damage;
        if (defender.hp <= 0) defender.alive = false;
        S.pushCombatRaw(`${attackerLabel} → ${weaponName}: ${damage} DMG hit ${ownerLabel} directly`);
    }

    if (defender === S.player && S.player.hp <= 0) handlePlayerDeath();
}

/**
 * Permadeath: wipes save and shows death prompt.
 * render() is not called here — the caller in input.js triggers it.
 */
export function handlePlayerDeath() {
    if (S.gameOver) return;
    wipeSave();
    S.setGameOver(true);
    S.setPendingAction("restart-run");
    alert("KERNEL CORRUPTION CRITICAL :: ALL MEMORY WIPED :: PRESS Y TO REBOOT");
}

// ── Log helpers ───────────────────────────────────────────────────────────────
// These push text only. Callers (input.js, ai.js) manage the render call.

export function pushMessage(text) { S.pushMessageRaw(text); }
export function pushCombat(text)  { S.pushCombatRaw(text); }
