// =============================================================================
// utils.js — Pure Math & Utility Helpers
// =============================================================================

export const clamp   = (v, min, max) => Math.max(min, Math.min(max, v));
export const randInt = (min, max)    => Math.floor(Math.random() * (max - min + 1)) + min;
export const pick    = arr           => arr[randInt(0, arr.length - 1)];

export const isAdjacent = (a, b) =>
    Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;

export const centerOf = node => ({
    x: node.x + Math.floor(node.w / 2),
    y: node.y + Math.floor(node.h / 2)
});

/** Returns true if the glyph represents a traversable floor tile. */
export const isFloor = tile => tile === "." || tile === "{" || tile === "}";

/** Generates a randomised floor glyph to break up visual monotony. */
export function randomFloorGlyph() {
    const r = Math.random();
    if (r < 0.02) return "{";
    if (r < 0.01) return "}";
    return ".";
}
