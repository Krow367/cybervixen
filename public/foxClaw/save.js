// =============================================================================
// save.js — Save / Load / Wipe
// =============================================================================

import * as S from "./state.js";
import { getPlayerMaxBandwidth } from "./stats.js";

const SAVE_KEY = "foxclaw_save";

/**
 * Serialises the full world state to localStorage.
 * Map is stored as an array of strings for compact JSON encoding.
 */
export function saveGame() {
    try {
        const payload = JSON.stringify({
            version: 2,
            mapW: S.mapW, mapH: S.mapH,
            mapRows:      S.map.map(row => row.join("")),
            graphNodes:   S.graph.nodes.map(({ id, type, x, y, w, h, links }) =>
                          ({ id, type, x, y, w, h, links })),
            exploredRows: S.explored.map(row => row.map(v => v ? 1 : 0).join("")),
            player:       { x: S.player.x, y: S.player.y, hp: S.player.hp,
                            maxHP: S.player.maxHP, bandwidth: S.player.bandwidth,
                            type: "player" },
            inventory: S.inventory,
            equipped:  S.equipped,
            enemies:   S.enemies.map(({ id, type, x, y, hp, maxHP, glyph, color, alive, equipped }) =>
                       ({ id, type, x, y, hp, maxHP, glyph, color, alive, equipped })),
            loot:      S.loot.map(({ x, y, item }) => ({ x, y, item })),
            messages:  S.messages.slice(-30),
            combatLog: S.combatLog.slice(-30),
            inCombat:  S.inCombat,
        });
        localStorage.setItem(SAVE_KEY, payload);
        S.pushMessageRaw("SYSTEM: World state written to persistent memory.");
    } catch (e) {
        S.pushMessageRaw("SYSTEM ERROR: Save failed — " + e.message);
    }
}

export function loadGame() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) { S.pushMessageRaw("SYSTEM: No saved state found."); return false; }

        const d = JSON.parse(raw);

        S.setMapW(d.mapW);
        S.setMapH(d.mapH);
        S.setMap(d.mapRows.map(row => row.split("")));
        S.setGraph({ nodes: d.graphNodes.map(n => ({ ...n })) });

        S.setExplored(d.exploredRows.map(row => row.split("").map(c => c === "1")));
        S.setVisibleTiles(Array.from({ length: d.mapH }, () => Array(d.mapW).fill(false)));

        S.setEquipped(d.equipped);
        S.setInventory(d.inventory);

        const p = { ...d.player };
        p.equipped = d.equipped; // keep alias in sync
        S.setPlayer(p);

        S.setEnemies(d.enemies.map(e => ({ ...e })));
        S.setLoot(d.loot.map(l => ({ ...l })));

        S.setMessages(d.messages  || []);
        S.setCombatLog(d.combatLog || []);
        S.setInCombat(d.inCombat  || false);

        S.pushMessageRaw("SYSTEM: World state restored from persistent memory.");
        return true;
    } catch (e) {
        S.pushMessageRaw("SYSTEM ERROR: Load failed — " + e.message);
        return false;
    }
}

export function wipeSave() {
    localStorage.removeItem(SAVE_KEY);
}
