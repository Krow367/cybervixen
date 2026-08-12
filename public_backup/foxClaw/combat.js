// =============================================================================
// combat.js — Attack Resolution, Shielding & Player Death
// =============================================================================

import * as S from "./state.js";
import { getEntityDefense, getEntitySpeed, sumSlots } from "./stats.js";
import { alert }                             from "../io.js";
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
 * Supports reducing shielding rate based on attacker's bypass ratio.
 *
 * @returns {object|null} Intercepting module, or null for a direct kernel hit.
 */
function resolveHitTarget(entity, bypassRatio = 0) {
    for (const mod of getActiveModules(entity)) {
        let shielding = mod.shielding || 0;
        if (bypassRatio > 0) {
            shielding *= (1 - bypassRatio); // Shielding reduced by the bypass ratio
        }
        if (Math.random() < shielding) return mod;
    }
    return null;
}

/** Applies damage to a module, clamping durability to 0. Logs corruption. */
function damageModule(mod, durLoss, ownerLabel) {
    mod.durability = Math.max(0, mod.durability - durLoss);
    if (mod.durability === 0)
        S.pushCombatRaw(`[${ownerLabel}] Module [${(mod.name ?? "???").toUpperCase()}] has been CORRUPTED.`);
}

// =============================================================================
// COMBAT
// =============================================================================

/**
 * Resolves a single attack using a specific weapon script.
 * Phase 1: Speed-dependent Hit check.
 * Phase 2: Sequential module Interception check (mitigated by stacked Bypass ratios).
 * Phase 3: Damage Resolution (mitigated by stacked Shred multipliers on modules).
 *
 * Does NOT call render — callers are responsible for the final render.
 */
export function attack(attacker, defender, script = null) {
    const weaponName = script ? script.name : "standard scan";

    const attackerLabel  = (attacker.type ?? "ENTITY").toUpperCase();
    const ownerLabel     = defender === S.player ? "KERNEL" : (defender.type ?? "ENTITY").toUpperCase();

    // Attacker and Defender speeds
    const attackerSpeed = getEntitySpeed(attacker);
    const defenderSpeed = getEntitySpeed(defender);

    // Phase 1: Speed-based Hit check
    const hitChance = Math.max(0.40, Math.min(0.98, 0.85 + (attackerSpeed - defenderSpeed) / 500));
    if (Math.random() > hitChance) {
        S.pushCombatRaw(`${attackerLabel} → ${weaponName}: TRANSMISSION FAILED (Missed)`);
        return;
    }

    // Phase 2: Interception target resolution (takes stacked bypass ratio)
    const scriptBypass = script ? (script.bypass || 0) : 0;
    const pluginBypass = attacker.equipped ? sumSlots(attacker.equipped.plugin, p => p.bypass || 0) : 0;
    const totalBypass = Math.min(0.90, scriptBypass + pluginBypass);

    const interceptMod = resolveHitTarget(defender, totalBypass);

    // Phase 3: Damage resolution
    const scriptAtk = script ? (script.attack || 0) : 2; // base unarmed attack: 2
    const pluginAtk = attacker.equipped ? sumSlots(attacker.equipped.plugin, p => p.attack || 0) : 0;
    const attackVal = scriptAtk + pluginAtk;
    const defenseVal = getEntityDefense(defender);

    const damage = Math.max(1, attackVal - defenseVal);

    if (interceptMod) {
        const scriptShred = script ? (script.shred || 0) : 0;
        const pluginShred = attacker.equipped ? sumSlots(attacker.equipped.plugin, p => p.shred || 0) : 0;
        const shredMultiplier = 1.0 + scriptShred + pluginShred;

        // Granular durability loss: raw damage * shredMultiplier
        const durLoss = Math.max(1, Math.round(damage * shredMultiplier));

        damageModule(interceptMod, durLoss, ownerLabel);
        
        const shredMsg = shredMultiplier > 1.0 ? ` [SHREDDED x${shredMultiplier.toFixed(2)}]` : "";
        S.pushCombatRaw(`${attackerLabel} → ${weaponName}: Intercepted by [${(interceptMod.name ?? "???").toUpperCase()}] (Durability -${durLoss})${shredMsg}`);
    } else {
        defender.hp -= damage;
        if (defender.hp <= 0) defender.alive = false;
        S.pushCombatRaw(`${attackerLabel} → ${weaponName}: ${damage} DMG hit ${ownerLabel} directly`);
    }

    if (defender === S.player && S.player.hp <= 0) handlePlayerDeath();
}

/**
 * Fires all equipped, active scripts that are currently in range sequentially.
 * If unarmed, triggers a default scan attack (melee only).
 */
export function executeSequentialAttacks(attacker, defender, distance) {
    if (!attacker.equipped || !attacker.equipped.script) {
        if (distance === 1) attack(attacker, defender, null);
        return;
    }

    const scripts = attacker.equipped.script.filter(s => s && s.durability > 0);
    if (scripts.length === 0) {
        if (distance === 1) attack(attacker, defender, null);
        return;
    }

    for (const script of scripts) {
        const range = script.subcategory === "remote" ? (script.range || 1) : 1;
        if (distance <= range) {
            if (attacker === S.player) {
                const cost = script.cost || 0;
                if (S.player.bandwidth < cost) {
                    S.pushCombatRaw(`SYSTEM: Insufficient bandwidth to execute [${script.name}].`);
                    continue;
                }
                S.player.bandwidth -= cost;
            }
            attack(attacker, defender, script);
        }
    }
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
