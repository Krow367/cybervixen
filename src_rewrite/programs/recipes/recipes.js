/**
 * recipes.js — Serenity Culinary Database Cartridge (RECIPES.EXE)
 * 
 * An authentic retro recipe reader application:
 * - Left column: Interactive Recipe Index with active selector (▶)
 * - Right column: Dedicated single-recipe card with custom CRT hardware scrollbars
 */

import { openWindow } from "../../core/windows.js";
import { setupScrollbar } from "../../core/scrollbar.js";
import { unlockCipher } from "../ciphers/ciphers.js";

function formatRecipeTitle(filename) {
    return filename
        .replace(".html", "")
        .split("-")
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}

export async function launchRecipes() {
    unlockCipher("culinary_notes");
    // 1. Fetch Recipe Manifest
    let files = [];
    try {
        const res = await fetch("/recipes/index.json");
        if (res.ok) {
            files = await res.json();
            // Acknowledge read state so notification is cleared on subsequent boots
            localStorage.setItem("recipeIndexSnapshot", JSON.stringify(files));
        }
    } catch (e) {
        console.error("Failed to load recipe index:", e);
    }

    if (files.length === 0) {
        openWindow("recipes", {
            title: "RECIPES.EXE // CULINARY DATABASE",
            content: "<p>[ERROR] Could not load recipe database index.</p>",
            width: 900,
            height: 600
        });
        return;
    }

    // Fetch all recipes in parallel
    const recipesData = await Promise.all(
        files.map(async (name) => {
            const res = await fetch(`/recipes/${name}`);
            const html = res.ok ? await res.text() : "<p>Error loading recipe.</p>";
            const printFile = name.replace(".html", "-print.html");
            return {
                id: name.replace(".html", ""),
                title: formatRecipeTitle(name),
                filename: name,
                printUrl: `/recipes/${printFile}`,
                html: html
            };
        })
    );

    let selectedIndex = 0;

    // Helper to render the Left Sidebar list
    function renderSidebar() {
        return recipesData.map((recipe, index) => {
            const isSelected = index === selectedIndex;
            const icon = isSelected ? "▶" : " ";
            const activeClass = isSelected ? "active" : "";

            return `
                <div style="margin-bottom: 4px;">
                    <a href="#" data-index="${index}" class="recipe-nav-item ${activeClass}">
                        <span>${icon}</span> ${recipe.title}
                    </a>
                </div>
            `;
        }).join("");
    }

    // Helper to render the Active Recipe Viewport
    function renderActiveRecipe() {
        const recipe = recipesData[selectedIndex];
        return `
            <div class="recipe-header" style="display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid rgba(var(--phosphor-rgb), 0.3); padding-bottom: 8px; margin-bottom: 16px;">
                <div style="font-size: 1.3rem; opacity: 0.7;">RECIPE ${selectedIndex + 1} OF ${recipesData.length}</div>
                <div>
                    <a href="${recipe.printUrl}" target="_blank" style="font-size: 1.25rem; border: 1px solid var(--phosphor); padding: 3px 10px; text-decoration: none;">
                        [PRINT-FRIENDLY VERSION]
                    </a>
                </div>
            </div>
            <div class="recipe-content-body">
                ${recipe.html}
            </div>
        `;
    }

    const windowLayout = `
        <div class="window-split-layout" style="display: flex; height: 100%; width: 100%; min-height: 0;">
            <!-- Left Column: Recipe Selector Index -->
            <div class="sidebar recipe-sidebar" style="flex: 0 0 clamp(14rem, 22vw, 22rem); border-right: 1px solid rgba(var(--phosphor-rgb), 0.4); overflow: hidden;">
                <div class="scrollbox" data-scrollbox>
                    <div class="scrollbox-viewport" data-viewport style="padding: 0.75rem;">
                        <div style="font-size: 1.15rem; opacity: 0.7; margin-bottom: 0.75rem; letter-spacing: 1px;">DATABASE INDEX</div>
                        <div id="recipe-list-container">
                            ${renderSidebar()}
                        </div>
                    </div>
                    <div class="scrollbar" data-scrollbar>
                        <button class="scrollbar-btn up" data-dir="-1" aria-label="Scroll Up"></button>
                        <div class="scrollbar-track" data-track>
                            <div class="scrollbar-thumb" data-thumb></div>
                        </div>
                        <button class="scrollbar-btn down" data-dir="1" aria-label="Scroll Down"></button>
                    </div>
                </div>
            </div>

            <!-- Right Column: Single Active Recipe Card with Hardware Scrollbar -->
            <div class="content recipe-viewport" style="flex: 1; min-width: 0; overflow: hidden;">
                <div class="scrollbox" data-scrollbox id="recipe-scrollbox">
                    <div class="scrollbox-viewport" data-viewport id="recipe-viewport-content">
                        ${renderActiveRecipe()}
                    </div>
                    <div class="scrollbar" data-scrollbar>
                        <button class="scrollbar-btn up" data-dir="-1" aria-label="Scroll Up"></button>
                        <div class="scrollbar-track" data-track>
                            <div class="scrollbar-thumb" data-thumb></div>
                        </div>
                        <button class="scrollbar-btn down" data-dir="1" aria-label="Scroll Down"></button>
                    </div>
                </div>
            </div>
        </div>
    `;

    const win = openWindow("recipes", {
        title: "RECIPES.EXE // CULINARY DATABASE",
        content: windowLayout,
        width: Math.min(1100, Math.round(window.innerWidth * 0.88)),
        height: Math.min(740, Math.round(window.innerHeight * 0.82))
    });

    // Initialize Scrollbars
    win.querySelectorAll("[data-scrollbox]").forEach(setupScrollbar);

    // Wire Interactive Selection
    const listContainer = win.querySelector("#recipe-list-container");
    const viewportContent = win.querySelector("#recipe-viewport-content");
    const recipeScrollbox = win.querySelector("#recipe-scrollbox");

    listContainer.addEventListener("click", (e) => {
        const link = e.target.closest("a[data-index]");
        if (!link) return;
        e.preventDefault();

        selectedIndex = parseInt(link.getAttribute("data-index"), 10);
        listContainer.innerHTML = renderSidebar();
        viewportContent.innerHTML = renderActiveRecipe();
        viewportContent.scrollTop = 0;

        // Refresh scrollbar metrics
        setupScrollbar(recipeScrollbox);
    });
}
