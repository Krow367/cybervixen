/**
 * scripts/build.mjs — Pre-deploy build script
 *
 * Run with:  npm run build
 *
 * What it does:
 *   1. Scans public/blog/   → writes public/blog/index.json   (newest-first by filename)
 *   2. Scans public/recipes/ → writes public/recipes/index.json (order preserved)
 *
 * Blog post filename convention: YYYY-MM-DD-optional-slug.html
 *   e.g.  2026-06-01-puzzle-post.html  or  6-01-26.html (legacy — still sorted desc)
 *
 * Any file ending in -print.html is excluded (those are print views for recipes).
 * index.json itself is excluded.
 */

import { readdirSync, writeFileSync } from "fs";
import { join, resolve } from "path";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..", "public");

// ─── Blog ─────────────────────────────────────────────────────────────────────

const blogDir  = join(ROOT, "blog");
const blogFiles = readdirSync(blogDir)
    .filter(f => f.endsWith(".html") && f !== "index.json")
    .sort()          // lexicographic ascending  →  oldest first
    .reverse();      // flip to newest-first

writeFileSync(
    join(blogDir, "index.json"),
    JSON.stringify(blogFiles, null, 4) + "\n"
);
console.log(`✓ blog/index.json  (${blogFiles.length} posts):`, blogFiles);

// ─── Recipes ──────────────────────────────────────────────────────────────────

const recipesDir  = join(ROOT, "recipes");
const recipeFiles = readdirSync(recipesDir)
    .filter(f =>
        f.endsWith(".html") &&
        !f.endsWith("-print.html") &&   // exclude print views
        f !== "index.json" &&
        f !== "recipes.html"            // exclude the old static window file if present
    )
    .sort();

writeFileSync(
    join(recipesDir, "index.json"),
    JSON.stringify(recipeFiles, null, 4) + "\n"
);
console.log(`✓ recipes/index.json  (${recipeFiles.length} recipes):`, recipeFiles);
