/**
 * blog.js — CyberVixen's Transmissions & Infinite Scroll Cartridge
 * 
 * Dynamically loads posts from /blog/index.json, generates the vintage
 * left-sidebar date index, and renders the continuous infinite-scrolling document
 * with custom CRT hardware clicky-arrow scrollbars.
 */

import { openWindow } from "../../core/windows.js";
import { setupScrollbar } from "../../core/scrollbar.js";
import { unlockCipher } from "../ciphers/ciphers.js";
import { playRelayThump } from "../../core/audio.js";

export async function launchBlog() {
    unlockCipher("archive_diver");
    // 1. Fetch Blog Manifest
    let files = [];
    try {
        const res = await fetch("/blog/index.json");
        if (res.ok) {
            files = await res.json();
            // Acknowledge read state so notification is cleared on subsequent boots
            localStorage.setItem("blogIndexSnapshot", JSON.stringify(files));
        }
    } catch (e) {
        console.error("Failed to load blog index:", e);
    }

    if (files.length === 0) {
        openWindow("blog", {
            title: "BLOG.EXE - RAMBLINGS OF A MAD FOX",
            content: "<p>[ERROR] Could not load blog manifest from /blog/index.json</p>",
            width: 860,
            height: 560
        });
        return;
    }

    // 2. Fetch all post HTML files in parallel
    const postsHTML = await Promise.all(
        files.map(name => fetch(`/blog/${name}`).then(r => r.ok ? r.text() : `<p>Error loading ${name}</p>`))
    );

    // 3. Build Sidebar Dates and Main Content HTML
    let sidebarHTML = "";
    let contentHTML = "";

    files.forEach((name, index) => {
        const html = postsHTML[index];
        const label = name.replace(".html", "").replaceAll("-", ".");
        const anchorId = `post-${name.replace(".html", "").replace(/[^a-zA-Z0-9]/g, "-")}`;

        // Add clickable sidebar date
        sidebarHTML += `<div style="margin-bottom: 0.6rem;"><a href="#" data-target="#${anchorId}" class="blog-date-link" style="font-size: 1.6rem; text-decoration: none;">${label}</a></div>`;

        // Wrap each post with an anchor ID and clear high-visibility separator
        contentHTML += `
            <article id="${anchorId}" class="blog-post" style="padding-bottom: 1.5rem;">
                ${html}
            </article>
            <div class="blog-divider" style="margin: 3.5rem 0; border-top: 2px solid var(--phosphor); box-shadow: 0 0 10px rgba(var(--phosphor-rgb), 0.6); position: relative; text-align: center;">
                <span style="position: relative; top: -0.85rem; background: var(--boot, #020902); padding: 2px 14px; font-size: 1.1rem; letter-spacing: 2px; border: 1px solid var(--phosphor); box-shadow: 0 0 6px var(--phosphor);">
                    ■ END OF TRANSMISSION: ${label} ■
                </span>
            </div>
        `;
    });

    const windowLayout = `
        <div class="window-split-layout" style="display: flex; height: 100%; width: 100%; min-height: 0;">
            <!-- Left Sidebar: Date Index -->
            <div class="sidebar" style="flex: 0 0 clamp(10rem, 16vw, 15rem); border-right: 1px solid rgba(var(--phosphor-rgb), 0.4); overflow: hidden;">
                <div class="scrollbox" data-scrollbox>
                    <div class="scrollbox-viewport" data-viewport style="padding: 0.75rem;">
                        <div style="font-size: 1.15rem; opacity: 0.7; margin-bottom: 0.75rem; letter-spacing: 1px;">ARCHIVES</div>
                        ${sidebarHTML}
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

            <!-- Right Column: Infinite Document Stream with Custom Hardware Scrollbar -->
            <div class="content blog-viewport" style="flex: 1; min-width: 0; overflow: hidden;">
                <div class="scrollbox" data-scrollbox>
                    <div class="scrollbox-viewport" data-viewport>
                        ${contentHTML}
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

    // 4. Open Window
    const win = openWindow("blog", {
        title: "BLOG.EXE - RAMBLINGS OF A MAD FOX",
        content: windowLayout,
        width: Math.min(1050, Math.round(window.innerWidth * 0.85)),
        height: Math.min(720, Math.round(window.innerHeight * 0.82))
    });

    // 5. Initialize Custom Arrow Scrollbars
    win.querySelectorAll("[data-scrollbox]").forEach(setupScrollbar);

    // 6. Wire Smooth Sidebar Navigation & Image Lightbox Popouts
    const sidebarEl = win.querySelector(".sidebar");
    const viewportEl = win.querySelector(".blog-viewport [data-viewport]");

    sidebarEl.addEventListener("click", (e) => {
        const link = e.target.closest("a[data-target]");
        if (!link) return;
        e.preventDefault();

        const targetId = link.getAttribute("data-target");
        const targetPost = viewportEl.querySelector(targetId);
        if (targetPost) {
            targetPost.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    });

    // Lightbox image viewer
    viewportEl.addEventListener("click", (e) => {
        const img = e.target.closest("img");
        if (!img) return;

        playRelayThump();

        const lightbox = document.createElement("div");
        lightbox.className = "crt-lightbox";
        lightbox.innerHTML = `<img src="${img.src}" alt="${img.alt || 'Full size image'}">`;

        lightbox.addEventListener("click", () => {
            playRelayThump();
            lightbox.remove();
        });

        document.body.appendChild(lightbox);
    });
}
