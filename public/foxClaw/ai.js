// =============================================================================
// ai.js — Enemy AI & Movement
// =============================================================================

import * as S from "./state.js";
import { getPlayerSpeed, getEntitySpeed, getEntityVision } from "./stats.js";
import { attack }  from "./combat.js";
import { isFloor } from "./utils.js";
import { WALL }    from "./data.js";

/**
 * Executes one turn for all living enemies.
 *
 * Speed model (100-base):
 *   elapsed       = 100 / playerSpeed   — ticks credited per player action.
 *   enemyCost     = 100 / enemySpeed    — ticks required for one enemy action.
 *   An enemy acts once each time its accumulated ticks reach enemyCost.
 */
export function enemyTurn() {
    const BASE    = 100;
    const elapsed = BASE / getPlayerSpeed();
    let seenPlayer = false;

    for (const enemy of S.enemies) {
        if (!enemy.alive) continue;

        enemy.ticks = (enemy.ticks ?? 0) + elapsed;
        const enemySpeed = getEntitySpeed(enemy);

        // Zero-speed enemies: melee-only, act when adjacent regardless of ticks
        if (enemySpeed <= 0) {
            if (isAdjacent(enemy, S.player)) { seenPlayer = true; attack(enemy, S.player); }
            continue;
        }

        const enemyCost = BASE / enemySpeed;
        while (enemy.ticks >= enemyCost) {
            enemy.ticks -= enemyCost;

            if (isAdjacent(enemy, S.player)) {
                seenPlayer = true;
                attack(enemy, S.player);
                continue;
            }

            const dist = manhattanDist(enemy, S.player);
            const vision = getEntityVision(enemy);
            const remoteScript = enemy.equipped
                ?.script.find(s => s && s.subcategory === "remote" && s.durability > 0);

            if (remoteScript && dist <= remoteScript.range && canSee(enemy, S.player)) {
                seenPlayer = true;
                attack(enemy, S.player);
            } else if (dist <= vision && canSee(enemy, S.player)) {
                seenPlayer = true;
                moveToward(enemy, S.player);
            }
        }
    }

    S.setInCombat(seenPlayer);
}

// ── Movement helpers ──────────────────────────────────────────────────────────

/** Moves an enemy one step toward the player if a passable cell is available. */
function moveToward(enemy, player) {
    const dx = Math.sign(player.x - enemy.x);
    const dy = Math.sign(player.y - enemy.y);

    for (const pos of [{ x: enemy.x + dx, y: enemy.y }, { x: enemy.x, y: enemy.y + dy }]) {
        if (isCellOpen(pos.x, pos.y)) {
            enemy.x = pos.x;
            enemy.y = pos.y;
            return;
        }
    }
}

/** True if a tile is traversable and not occupied by a living enemy. */
function isCellOpen(x, y) {
    if (S.map[y]?.[x] === WALL) return false;
    return !S.enemies.some(e => e.alive && e.x === x && e.y === y);
}

// ── Line-of-sight ─────────────────────────────────────────────────────────────

/** Bresenham LOS between two entities. */
export function canSee(a, b) {
    return hasLineOfSight(a.x, a.y, b.x, b.y);
}

/**
 * Bresenham's line algorithm — returns true if the path between two
 * coordinates is unobstructed by walls.
 */
export function hasLineOfSight(x0, y0, x1, y1) {
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (!(x0 === x1 && y0 === y1)) {
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 <  dx) { err += dx; y0 += sy; }
        if (x0 === x1 && y0 === y1) return true;
        if (S.map[y0]?.[x0] === WALL) return false;
    }
    return true;
}

// ── Utility ───────────────────────────────────────────────────────────────────

function isAdjacent(a, b) {
    return manhattanDist(a, b) === 1;
}

function manhattanDist(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
