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
    placeNetworkNodes(graph.nodes, topology);

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

        let shapeType = "rect";
        let w = 8, h = 8;

        if (topology === "ring") {
            // Ring levels have smooth, circular nodes reflecting data loops
            shapeType = "circle";
            if (type === "entry") { w = 8; h = 8; }
            else if (type === "core") { w = 14; h = 14; }
            else if (type === "firewall") { w = 12; h = 12; }
            else if (type === "cache") { w = 10; h = 10; }
            else { w = 8; h = 8; }
        } else if (topology === "star") {
            // Star levels have a massive cross-shaped central hub and square satellites
            if (type === "firewall") {
                shapeType = "cross";
                w = 14; h = 14;
            } else {
                shapeType = "square";
                if (type === "entry") { w = 6; h = 6; }
                else if (type === "core") { w = 12; h = 12; }
                else if (type === "cache") { w = 10; h = 10; }
                else { w = 8; h = 8; }
            }
        } else if (topology === "mesh") {
            // Mesh levels have sharp rectangular matrices representing grids
            shapeType = Math.random() < 0.5 ? "square" : "rect";
            if (type === "entry") { w = 6; h = 6; }
            else if (type === "core") { w = 13; h = 13; }
            else {
                w = randInt(8, 12);
                h = randInt(8, 12);
                if (shapeType === "square") {
                    const size = randInt(8, 10);
                    w = size; h = size;
                }
            }
        } else {
            // Line topology (Bus/Chain) gets a hybrid linear structure with various shapes
            shapeType = ["rect", "square", "circle", "cross"][randInt(0, 3)];
            if (type === "entry") { w = 6; h = 6; }
            else if (type === "core") { w = 12; h = 12; }
            else {
                w = randInt(8, 12);
                h = randInt(8, 12);
                if (shapeType === "square") {
                    const size = randInt(8, 11);
                    w = size; h = size;
                }
            }
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
        for (let i = 0; i < count; i++) {
            link(nodes[i], nodes[(i + 1) % count]);
        }
    } else if (topology === "mesh") {
        for (let i = 0; i < count - 1; i++) {
            link(nodes[i], nodes[i + 1]);
        }
        for (let i = 0; i < count; i++) {
            for (let j = i + 2; j < count; j++) {
                if (j === count - 1 && i !== count - 2) continue;
                if (Math.random() < 0.25) {
                    link(nodes[i], nodes[j]);
                }
            }
        }
    } else {
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

function placeNetworkNodes(nodes, topology) {
    const margin = 4;

    if (topology === "star") {
        // Star Layout: Place the Firewall hub in the center, arrange satellites in a circle around it
        const centerNode = nodes.find(n => n.type === "firewall") || nodes[0];
        centerNode.x = 22;
        centerNode.y = 22;

        const satellites = nodes.filter(n => n !== centerNode);
        satellites.forEach((n, idx) => {
            const angle = (idx * 2 * Math.PI) / satellites.length;
            const radius = 16;
            n.x = Math.round(centerNode.x + Math.cos(angle) * radius - n.w / 2);
            n.y = Math.round(centerNode.y + Math.sin(angle) * radius - n.h / 2);
        });
    } else if (topology === "ring") {
        // Ring Layout: Arrange all nodes in a clean circular perimeter loop
        nodes.forEach((n, idx) => {
            const angle = (idx * 2 * Math.PI) / nodes.length;
            const radius = 18;
            n.x = Math.round(22 + Math.cos(angle) * radius - n.w / 2);
            n.y = Math.round(22 + Math.sin(angle) * radius - n.h / 2);
        });
    } else if (topology === "mesh") {
        // Mesh Layout: Grid placement (e.g. 3 columns grid) with slight jittering
        const cols = 3;
        nodes.forEach((n, idx) => {
            const r = Math.floor(idx / cols);
            const c = idx % cols;
            const spacingX = 16;
            const spacingY = 16;
            n.x = margin + c * spacingX + randInt(-1, 1);
            n.y = margin + r * spacingY + randInt(-1, 1);
        });
    } else {
        // Line Layout: Straight sequence flow
        nodes.forEach((n, idx) => {
            n.x = margin + idx * 13 + randInt(-1, 1);
            n.y = 12 + randInt(-3, 3);
        });
    }

    // Resolve overlaps (secondary safety check)
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
