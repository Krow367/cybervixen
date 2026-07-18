// =============================================================================
// mapgen.js — Procedural Map Generation
// =============================================================================

import { randInt, randomFloorGlyph } from "./utils.js";

/**
 * Entry point for map generation.
 * Generates a network layout based on selected topology,
 * enforces a single Firewall boss blocking the exit path,
 * and handles varied node room shapes.
 */
export function carveNetworkLevel({ nodeCount = 8, securityRating = 1 } = {}) {
    // Determine topology
    const topologies = ["star", "ring", "mesh", "line"];
    const topology = topologies[randInt(0, topologies.length - 1)];

    // Overall size scaling: higher security networks are larger
    const sizeMultiplier = 1 + (securityRating - 1) * 0.25;
    const baseNodeCount = Math.max(6, Math.floor(nodeCount * sizeMultiplier));

    const graph = createNetworkGraph(baseNodeCount, topology);
    placeNetworkNodes(graph.nodes);

    const margin = 4;
    const width  = Math.max(...graph.nodes.map(n => n.x + n.w)) + margin;
    const height = Math.max(...graph.nodes.map(n => n.y + n.h)) + margin;

    const map = Array.from({ length: height }, () =>
        Array.from({ length: width }, () => "#")
    );

    carveRooms(map, graph.nodes);
    carveConnections(map, graph.nodes);

    return { map, graph, width, height, topology, securityRating };
}

// ── Graph Generation with Topologies ─────────────────────────────────────────

function createNetworkGraph(count, topology) {
    const nodes = [];

    // Assign node types.
    // 0: entry
    // count - 1: core (exit node)
    // There must be exactly one firewall node, which is positioned dynamically/logically,
    // or we will designate a specific link as the firewall gate.
    // Let's place the firewall node right before the core.
    for (let i = 0; i < count; i++) {
        let type = "relay";
        if (i === 0) type = "entry";
        else if (i === count - 1) type = "core";
        else if (i === count - 2) type = "firewall"; // gateway before core
        else if (Math.random() < 0.2) type = "cache";

        // Varied Room Shapes and Sizes (rect, square, circle/cross)
        const shapeType = i === 0 ? "rect" : ["rect", "square", "cross", "circle"][randInt(0, 3)];
        let w = randInt(8, 12);
        let h = randInt(8, 12);
        if (type === "core") { w = randInt(14, 18); h = randInt(14, 18); }
        if (type === "entry") { w = 6; h = 6; }
        if (shapeType === "square") {
            const size = randInt(8, 11);
            w = size; h = size;
        }

        nodes.push({
            id: `node_${i}`,
            type,
            shape: shapeType,
            w,
            h,
            x: 0,
            y: 0,
            links: []
        });
    }

    // Build connections based on network topology
    if (topology === "star") {
        // Center node is firewall (count-2) or a main hub. Let's make the firewall node the center hub
        // that all other nodes must connect through to reach the core.
        const centerIdx = count - 2; // Firewall node
        // Connect entry to center
        link(nodes[0], nodes[centerIdx]);
        // Connect core to center
        link(nodes[count - 1], nodes[centerIdx]);
        // Connect all relays / caches to center
        for (let i = 1; i < count - 2; i++) {
            link(nodes[i], nodes[centerIdx]);
        }
    } else if (topology === "ring") {
        // Ring topology: 0 -> 1 -> 2 -> ... -> firewall -> core -> 0
        for (let i = 0; i < count; i++) {
            link(nodes[i], nodes[(i + 1) % count]);
        }
    } else if (topology === "mesh") {
        // Partial mesh: Chain them first to ensure connectivity, then add extra links
        for (let i = 0; i < count - 1; i++) {
            link(nodes[i], nodes[i + 1]);
        }
        // Add random links, but avoid bypassing the firewall gating the core (nodes[count-1])
        for (let i = 0; i < count; i++) {
            for (let j = i + 2; j < count; j++) {
                // Core (count-1) should ONLY be connected to Firewall (count-2) to ensure Firewall blocks it.
                if (j === count - 1 && i !== count - 2) continue;
                if (Math.random() < 0.25) {
                    link(nodes[i], nodes[j]);
                }
            }
        }
    } else {
        // Line / Chain topology
        // Ensure Firewall node (count-2) is the ONLY path to Core (count-1)
        for (let i = 0; i < count - 1; i++) {
            link(nodes[i], nodes[i + 1]);
        }
    }

    return { nodes };
}

function link(a, b) {
    if (!a.links.includes(b.id)) a.links.push(b.id);
    if (!b.links.includes(a.id)) b.links.push(a.id);
}

// ── Room Placement ───────────────────────────────────────────────────────────

function placeNetworkNodes(nodes) {
    const margin = 2;
    let currentX = margin;

    // Linear distribution left-to-right to naturally space topology nodes out
    nodes.forEach(n => {
        n.x = currentX + randInt(4, 8);
        n.y = randInt(-6, 6);
        currentX = n.x + n.w;
    });

    // Resolve overlaps
    for (let a = 0; a < nodes.length; a++) {
        for (let b = a + 1; b < nodes.length; b++) {
            if (rectsOverlap(nodes[a], nodes[b])) {
                nodes[b].x = nodes[a].x + nodes[a].w + 2;
            }
        }
    }

    // Centering shift
    let minX = Infinity, minY = Infinity;
    nodes.forEach(n => {
        if (n.x < minX) minX = n.x;
        if (n.y < minY) minY = n.y;
    });
    const sx = margin - minX, sy = margin - minY;
    nodes.forEach(n => { n.x += sx; n.y += sy; });
}

function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// ── Room Carving with Varied Shapes ──────────────────────────────────────────

function carveRooms(map, nodes) {
    for (const node of nodes) {
        const cx = Math.floor(node.w / 2);
        const cy = Math.floor(node.h / 2);

        for (let y = 0; y < node.h; y++) {
            for (let x = 0; x < node.w; x++) {
                const gx = node.x + x;
                const gy = node.y + y;

                if (!map[gy] || map[gy][gx] === undefined) continue;

                let shouldCarve = false;
                if (node.shape === "rect" || node.shape === "square") {
                    shouldCarve = true;
                } else if (node.shape === "circle") {
                    // Elliptical boundary check
                    const dx = (x - cx) / cx;
                    const dy = (y - cy) / cy;
                    if (dx * dx + dy * dy <= 1.05) shouldCarve = true;
                } else if (node.shape === "cross") {
                    // Plus sign pattern
                    const thicknessX = Math.max(3, Math.floor(node.w * 0.35));
                    const thicknessY = Math.max(3, Math.floor(node.h * 0.35));
                    if (Math.abs(x - cx) <= thicknessX || Math.abs(y - cy) <= thicknessY) {
                        shouldCarve = true;
                    }
                }

                if (shouldCarve) {
                    map[gy][gx] = randomFloorGlyph();
                }
            }
        }
    }
}

// ── Connection Carving ───────────────────────────────────────────────────────

function carveConnections(map, nodes) {
    const byId  = new Map(nodes.map(n => [n.id, n]));
    const carved = new Set();

    for (const node of nodes) {
        for (const linkId of node.links) {
            const key = [node.id, linkId].sort().join("--");
            if (carved.has(key)) continue;
            carved.add(key);
            const other = byId.get(linkId);
            if (other) carveCorridor(map, centerOf(node), centerOf(other));
        }
    }
}

function carveCorridor(map, a, b) {
    const cols  = map[0].length - 1;
    const rows  = map.length - 1;
    let x = clamp(a.x, 0, cols), y = clamp(a.y, 0, rows);
    const tx = clamp(b.x, 0, cols), ty = clamp(b.y, 0, rows);

    let guard = 0;
    const limit = map.length * map[0].length * 4;

    while (x !== tx && guard++ < limit) {
        if (map[y]?.[x] !== undefined) map[y][x] = randomFloorGlyph();
        x += Math.sign(tx - x);
    }
    while (y !== ty && guard++ < limit) {
        if (map[y]?.[x] !== undefined) map[y][x] = randomFloorGlyph();
        y += Math.sign(ty - y);
    }
    if (map[y]?.[x] !== undefined) map[y][x] = randomFloorGlyph();
}

function centerOf(node) {
    return {
        x: node.x + Math.floor(node.w / 2),
        y: node.y + Math.floor(node.h / 2)
    };
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
