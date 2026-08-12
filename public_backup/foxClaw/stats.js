// =============================================================================
// stats.js — Entity Stat Derivation
// Functions work symmetrically on both the player and enemies.
// =============================================================================

import { player, equipped } from "./state.js";

// ── Shared entity helpers ─────────────────────────────────────────────────────

export function getEntityAttack(entity) {
    if (!entity.equipped) return entity.attack || 2;
    
    // Find the first active script to act as the primary weapon
    const activeScript = entity.equipped.script.find(s => s && s.durability > 0);
    const scriptAtk = activeScript ? (activeScript.attack || 0) : 2; // Default scan attack: 2
    
    const pluginAtk = sumSlots(entity.equipped.plugin, p => p.attack || 0);
    return scriptAtk + pluginAtk;
}

export function getEntityDefense(entity) {
    if (!entity.equipped) return entity.defense || 0;
    return sumSlots(entity.equipped.plugin, p => p.defense || 0)
         + sumSlots(entity.equipped.driver, d => d.defense || 0);
}

export function getEntitySpeed(entity) {
    if (entity.type !== "player") return entity.speed ?? 100;

    // Get active drivers
    const activeDrivers = equipped.driver.filter(d => d && d.durability > 0);
    
    let baseSpeed = 100;
    if (activeDrivers.length > 0) {
        // Average the speed of active drivers
        baseSpeed = activeDrivers.reduce((sum, d) => sum + (d.speed ?? 100), 0) / activeDrivers.length;
    }

    const maxW = getPlayerMaxWeight();
    const curW = getPlayerTotalWeight();

    let speed = baseSpeed;
    if (curW > maxW && maxW > 0) {
        const overageRatio = (curW - maxW) / maxW;
        // Faster drivers are more sensitive to overload (quadratic scaling)
        const sensitivity = Math.pow(baseSpeed / 100, 2);
        speed = baseSpeed / (1 + sensitivity * overageRatio);
    }

    return Math.max(10, Math.round(speed));
}

export function getEntityVision(entity) {
    if (entity.type !== "player") {
        let vision = entity.vision ?? 4;
        if (entity.equipped)
            entity.equipped.plugin.forEach(p => { if (p && p.durability > 0) vision += p.vision || 0; });
        return vision;
    }
    return 8 + sumSlots(equipped.plugin, p => p.vision || 0); // player base: 8
}

export function getEntityMaxBandwidth(entity) {
    const base = entity.type === "player" ? 100 : 0;
    if (!entity.equipped) return base;
    return base + sumSlots(entity.equipped.bandwidth, b => b.capacity || 0);
}

export function getEntityBandwidthCharge(entity) {
    const base = entity.type === "player" ? 1 : 0;
    if (!entity.equipped) return base;
    return base + sumSlots(entity.equipped.bandwidth, b => b.chargeRate || 0);
}

// ── Player-specific convenience wrappers ──────────────────────────────────────
export const getPlayerAttack         = () => getEntityAttack(player);
export const getPlayerDefense        = () => getEntityDefense(player);
export const getPlayerSpeed          = () => getEntitySpeed(player);
export const getPlayerVision         = () => getEntityVision(player);
export const getPlayerMaxBandwidth   = () => getEntityMaxBandwidth(player);
export const getPlayerBandwidthCharge = () => getEntityBandwidthCharge(player);

export function getPlayerMaxWeight() {
    return 5 + sumSlots(equipped.driver, d => d.maxWeight || 0); // base carry: 5
}

export function getPlayerTotalWeight() {
    return sumSlots(equipped.script,    s => s.weight || 0)
         + sumSlots(equipped.bandwidth, b => b.weight || 0)
         + sumSlots(equipped.plugin,    p => p.weight || 0);
}

export function getEntityShredMultiplier(entity) {
    if (!entity.equipped) return 1.0;
    const bonus = sumSlots(entity.equipped.script, s => s.shred || 0)
                + sumSlots(entity.equipped.plugin, p => p.shred || 0);
    return 1.0 + bonus;
}

export function getEntityBypassRatio(entity) {
    if (!entity.equipped) return 0.0;
    const ratio = sumSlots(entity.equipped.script, s => s.bypass || 0)
                + sumSlots(entity.equipped.plugin, p => p.bypass || 0);
    return Math.min(0.90, ratio); // Cap at 90% bypass to ensure shielding is always active at 10% effectiveness
}

// ── Internal helper ───────────────────────────────────────────────────────────
/** Sums a stat from all slots that have items with durability > 0. */
export function sumSlots(slots, fn) {
    return slots.reduce((acc, m) => acc + (m && m.durability > 0 ? fn(m) : 0), 0);
}
