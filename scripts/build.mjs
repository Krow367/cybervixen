/**
 * scripts/build.mjs — In-Place Manifest Generator for Blog & Recipes
 *
 * Scans public/blog/ and public/recipes/ and updates their index.json files.
 * Does NOT overwrite, copy, or delete any source files.
 */

import { readdirSync, writeFileSync, existsSync } from "fs";
import { join, resolve } from "path";

const ROOT_DIR = resolve(new URL(".", import.meta.url).pathname, "..");
const PUBLIC_DIR = join(ROOT_DIR, "public");

// ─── 1. Index Blog Posts (Reverse Chronological) ──────────────────────────────
function indexBlog() {
    const blogDir = join(PUBLIC_DIR, "blog");
    if (!existsSync(blogDir)) return;

    const files = readdirSync(blogDir)
        .filter(f => f.endsWith(".html") && f !== "index.html")
        .sort((a, b) => {
            // Sort dates like "8-16-26.html" or ISO dates descending
            const parseDate = (name) => {
                const match = name.match(/(\d+)-(\d+)-(\d+)/);
                if (match) {
                    const m = parseInt(match[1], 10);
                    const d = parseInt(match[2], 10);
                    const y = parseInt(match[3], 10) + (parseInt(match[3], 10) < 100 ? 2000 : 0);
                    return new Date(y, m - 1, d).getTime();
                }
                return 0;
            };
            return parseDate(b) - parseDate(a);
        });

    const outPath = join(blogDir, "index.json");
    writeFileSync(outPath, JSON.stringify(files, null, 4) + "\n", "utf8");
    console.log(`✓ public/blog/index.json updated (${files.length} posts indexed)`);
}

// ─── 2. Index Recipes (Alphabetical, excluding print templates) ───────────────
function indexRecipes() {
    const recipeDir = join(PUBLIC_DIR, "recipes");
    if (!existsSync(recipeDir)) return;

    const files = readdirSync(recipeDir)
        .filter(f => f.endsWith(".html") && !f.endsWith("-print.html") && f !== "recipes.html" && f !== "index.html")
        .sort();

    const outPath = join(recipeDir, "index.json");
    writeFileSync(outPath, JSON.stringify(files, null, 4) + "\n", "utf8");
    console.log(`✓ public/recipes/index.json updated (${files.length} recipes indexed)`);
}

console.log("\n📦 foxOS Manifest Indexer");
console.log("────────────────────────");
indexBlog();
indexRecipes();
console.log("────────────────────────\n");
