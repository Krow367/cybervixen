// =============================================================================
// spawn.js — Enemy & Player Spawning Utilities
// =============================================================================

import { enemyDefs }              from "./data.js";
import { isFloor, randInt, pick } from "./utils.js";

/**
 * Instantiates an enemy from its fixed definition.
 * Each instance gets an independent deep-copy of the loadout.
 */
export function spawnEnemy(type, pos) {
    const base = enemyDefs[type];
    if (!base) {
        console.warn(`Unknown enemy type: ${type}`);
        return spawnEnemy("daemon", pos);
    }

    const loadout = {
        script:    base.defaultLoadout.script.map(s    => s ? { ...s } : null),
        bandwidth: base.defaultLoadout.bandwidth.map(b => b ? { ...b } : null),
        driver:    base.defaultLoadout.driver.map(d    => d ? { ...d } : null),
        plugin:    base.defaultLoadout.plugin.map(p    => p ? { ...p } : null),
    };

    return {
        id:      crypto.randomUUID(),
        type,
        x:       pos.x,
        y:       pos.y,
        hp:      base.hp,
        maxHP:   base.maxHP,
        speed:   base.speed,
        vision:  base.vision,
        glyph:   base.glyph,
        color:   base.color,
        alive:   true,
        equipped: loadout
    };
}

/** Resolves the player's spawn tile from the entry node. */
export function spawnAtEntry(graph, map) {
    const entry = graph.nodes.find(n => n.type === "entry") ?? graph.nodes[0];
    const c = centerOf(entry);
    return isFloor(map[c.y]?.[c.x]) ? c : (findOpenTile(map) ?? { x: 1, y: 1 });
}

/** Finds a suitable random floor tile for an enemy, away from the player. */
export function findEnemySpawn(graph, map, playerPos, minDist = 5, maxTries = 50) {
    for (let i = 0; i < maxTries; i++) {
        const x = randInt(0, map[0].length - 1);
        const y = randInt(0, map.length - 1);
        if (Math.abs(x - playerPos.x) + Math.abs(y - playerPos.y) >= minDist
            && isFloor(map[y]?.[x])) {
            return { x, y };
        }
    }
    return findOpenTile(map) ?? { x: 2, y: 2 };
}

/** Returns a random open floor tile from the map. */
export function findOpenTile(map) {
    const spots = [];
    for (let y = 0; y < map.length; y++)
        for (let x = 0; x < map[y].length; x++)
            if (isFloor(map[y][x])) spots.push({ x, y });
    return spots.length ? pick(spots) : null;
}

// Local helper — mirrors utils.js centerOf to avoid import cycles
function centerOf(node) {
    return {
        x: node.x + Math.floor(node.w / 2),
        y: node.y + Math.floor(node.h / 2)
    };
}
