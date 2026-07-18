// =============================================================================
// stats.js — Entity Stat Derivation
// Functions work symmetrically on both the player and enemies.
// =============================================================================

import { player, equipped } from "./state.js";

// ── Shared entity helpers ─────────────────────────────────────────────────────

export function getEntityAttack(entity) {
    if (!entity.equipped) return entity.attack || 0;
    return sumSlots(entity.equipped.script, s => s.attack || 0)
         + sumSlots(entity.equipped.plugin, p => p.attack || 0);
}

export function getEntityDefense(entity) {
    if (!entity.equipped) return entity.defense || 0;
    return sumSlots(entity.equipped.plugin, p => p.defense || 0)
         + sumSlots(entity.equipped.driver, d => d.defense || 0);
}

export function getEntitySpeed(entity) {
    if (entity.type !== "player") return entity.speed ?? 100;

    // Player: lowest equipped driver speed, default 100.
    let speed = 100;
    equipped.driver.forEach(d => {
        if (d && d.durability > 0 && d.speed !== undefined && d.speed < speed)
            speed = d.speed;
    });

    // Encumbrance penalty — player retains a minimum speed of 10.
    const maxW = getPlayerMaxWeight();
    const curW = getPlayerTotalWeight();
    if (curW > maxW) speed = Math.max(10, Math.floor(speed * (maxW / curW)));

    return speed;
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
    if (!entity.equipped) return 0;
    return sumSlots(entity.equipped.bandwidth, b => b.capacity || 0);
}

export function getEntityBandwidthCharge(entity) {
    if (!entity.equipped) return 0;
    return sumSlots(entity.equipped.bandwidth, b => b.chargeRate || 0);
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

// ── Internal helper ───────────────────────────────────────────────────────────
/** Sums a stat from all slots that have items with durability > 0. */
function sumSlots(slots, fn) {
    return slots.reduce((acc, m) => acc + (m && m.durability > 0 ? fn(m) : 0), 0);
}
