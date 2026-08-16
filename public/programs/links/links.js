/**
 * links.js — Serenity Neighboring Network Nodes Viewer
 * Dual-Mode Prototype: Rolodex 3D Card Stack vs. DEC Microfiche Projector
 */

import { openWindow } from "../../core/windows.js";
import { unlockCipher } from "../ciphers/ciphers.js";
import { playRelayThump, playKeyClick, playBell, playMicroficheSlide } from "../../core/audio.js";
import { MY_LINK_BADGE, NEIGHBOR_NODES } from "./links_data.js";

let activeMode = "microfiche"; // Default to Microfiche 35mm projector
let activeIndex = 0;

function injectLinksCSS() {
    if (!document.getElementById("links-cartridge-css")) {
        const link = document.createElement("link");
        link.id = "links-cartridge-css";
        link.rel = "stylesheet";
        link.href = "./programs/links/links.css";
        document.head.appendChild(link);
    }
}

/**
 * Builds the interactive Rolodex Card Stack Mode HTML
 */
function renderRolodexMode() {
    const cur = NEIGHBOR_NODES[activeIndex];
    const total = NEIGHBOR_NODES.length;

    // Generate miniature tabs for side index
    const tabsList = NEIGHBOR_NODES.map((node, i) => {
        const isSel = i === activeIndex;
        return `
            <div class="rolodex-tab-item" data-index="${i}" style="padding: 5px 8px; margin-bottom: 3px; font-size: 0.82em; cursor: pointer; border: 1px ${isSel ? 'solid var(--phosphor)' : 'dashed rgba(var(--phosphor-rgb), 0.3)'}; background: ${isSel ? 'rgba(var(--phosphor-rgb), 0.22)' : 'rgba(0, 0, 0, 0.3)'}; color: var(--phosphor); display: flex; justify-content: space-between; align-items: center; text-shadow: ${isSel ? '0 0 6px var(--phosphor)' : 'none'}; transition: all 0.15s ease;">
                <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">[${String(i + 1).padStart(2, '0')}] ${node.title}</span>
                ${isSel ? '<span style="font-size: 0.85em; font-weight: bold;">◄</span>' : ''}
            </div>
        `;
    }).join("");

    return `
        <div style="display: flex; height: 100%; width: 100%; overflow: hidden; gap: 14px;">
            <!-- Left Side: Rolodex Tab Index Column -->
            <div style="width: 180px; flex-shrink: 0; display: flex; flex-direction: column; border-right: 1px solid rgba(var(--phosphor-rgb), 0.35); padding-right: 10px;">
                <div style="font-size: 0.8em; font-weight: bold; letter-spacing: 1px; opacity: 0.8; margin-bottom: 6px; border-bottom: 1px dashed rgba(var(--phosphor-rgb), 0.3); padding-bottom: 3px;">
                    // INDEX TABS (${total}) //
                </div>
                <div class="scrollbox-viewport" style="flex: 1; overflow-y: auto; padding-right: 4px;">
                    ${tabsList}
                </div>
            </div>

            <!-- Right Side: 3D Physical Rolodex Card Display with Real Depth Ghost Cards -->
            <div style="flex: 1; display: flex; flex-direction: column; justify-content: space-between; min-width: 0;">
                <!-- Physical Card Header & Stepper Controls -->
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(var(--phosphor-rgb), 0.4); padding-bottom: 6px; margin-bottom: 8px;">
                    <div style="font-size: 0.9em; font-weight: bold; letter-spacing: 1px;">
                        CARD: ${activeIndex + 1} OF ${total}
                    </div>
                    <div style="display: flex; gap: 6px;">
                        <button type="button" id="btn-prev-card" style="background: rgba(var(--phosphor-rgb), 0.1); border: 1px solid var(--phosphor); color: var(--phosphor); font-family: inherit; font-size: 0.85em; padding: 3px 12px; cursor: pointer; transition: background 0.15s ease;">
                            [◄ PREV]
                        </button>
                        <button type="button" id="btn-next-card" style="background: rgba(var(--phosphor-rgb), 0.1); border: 1px solid var(--phosphor); color: var(--phosphor); font-family: inherit; font-size: 0.85em; padding: 3px 12px; cursor: pointer; transition: background 0.15s ease;">
                            [NEXT ►]
                        </button>
                    </div>
                </div>

                <!-- 3D Perspective Stage -->
                <div class="rolodex-perspective-stage" style="flex: 1; min-height: 0;">
                    <div class="rolodex-card-deck">
                        <div class="rolodex-card-ghost rolodex-ghost-2"></div>
                        <div class="rolodex-card-ghost rolodex-ghost-1"></div>

                        <!-- Active 3D Flipping Card -->
                        <div class="rolodex-card-active">
                            <div>
                                <!-- Top Card Header: ID / Hostname -->
                                <div style="display: flex; justify-content: space-between; border-bottom: 1px dashed rgba(var(--phosphor-rgb), 0.3); padding-bottom: 4px; margin-bottom: 12px; font-size: 0.82em; opacity: 0.85;">
                                    <span>HOST: ${cur.url.replace(/^https?:\/\//i, '')}</span>
                                    <span>NODE [${String(activeIndex + 1).padStart(2, '0')}]</span>
                                </div>

                                <!-- Card Center: Badge + Title -->
                                <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 14px;">
                                    <div style="width: 96px; height: 39px; border: 1px solid var(--phosphor); background: #000; display: flex; align-items: center; justify-content: center; padding: 2px; box-shadow: inset 0 0 6px rgba(var(--phosphor-rgb), 0.4), 0 0 8px rgba(var(--phosphor-rgb), 0.25); flex-shrink: 0;">
                                        <img src="${cur.badge}" alt="${cur.title}" width="88" height="31" style="image-rendering: pixelated; display: block;">
                                    </div>
                                    <div>
                                        <h3 style="margin: 0; font-size: 1.4em; text-shadow: 0 0 6px var(--phosphor);">${cur.title}</h3>
                                        <div style="font-size: 0.85em; opacity: 0.75; word-break: break-all; margin-top: 2px;">${cur.url}</div>
                                    </div>
                                </div>

                                <!-- Description Box -->
                                <div style="font-size: 0.92em; line-height: 1.4; opacity: 0.9; background: rgba(0, 0, 0, 0.45); padding: 10px 12px; border-left: 3px solid var(--phosphor); margin-bottom: 8px;">
                                    ${cur.desc}
                                </div>
                            </div>

                            <!-- Bottom Action Bar -->
                            <div style="display: flex; justify-content: flex-end; gap: 10px; border-top: 1px dashed rgba(var(--phosphor-rgb), 0.3); padding-top: 8px;">
                                <a href="${cur.url}" target="_blank" rel="noopener" style="background: var(--phosphor); color: #000; font-weight: bold; text-decoration: none; font-size: 0.9em; padding: 5px 16px; border-radius: 2px; text-shadow: none; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 0 8px rgba(var(--phosphor-rgb), 0.3);">
                                    [ ESTABLISH UPLINK ↗ ]
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Builds the interactive DEC Microfiche Slide Projector Mode HTML
 * Continuous multi-frame mechanical spool reel with authentic black film margins
 */
function renderMicroficheMode() {
    const total = NEIGHBOR_NODES.length;

    // Create a 60x continuous repeating spool array for deep infinite rapid seeking
    const spoolNodes = Array(60).fill(NEIGHBOR_NODES).flat();

    const framesHTML = spoolNodes.map((node, i) => {
        const realIdx = i % total;
        const isCurrent = realIdx === activeIndex;
        return `
            <div class="microfiche-frame-cell ${isCurrent ? 'frame-active' : ''}" data-real-idx="${realIdx}">
                <!-- Newspaper Archive Document Sheet -->
                <div class="microfiche-document-sheet">
                    
                    <!-- Archive Masthead / Headline Banner -->
                    <div class="microfiche-masthead">
                        <div>
                            <div style="font-size: 0.7em; opacity: 0.7; letter-spacing: 1px;">SERENITY ARCHIVES // NODE TRANSMISSION RECORD</div>
                            <div class="microfiche-masthead-title">${node.title.toUpperCase()}</div>
                        </div>
                        <div style="text-align: right; font-size: 0.72em; opacity: 0.8;">
                            <div>RECORD #${String(realIdx + 1).padStart(3, '0')}</div>
                            <div style="color: var(--phosphor); font-weight: bold;">[ VERIFIED NODE ]</div>
                        </div>
                    </div>

                    <!-- Article Body: Badge Left, Clean URL + Text Right -->
                    <div class="microfiche-columns">
                        <!-- 88x31 Animated Badge Stamped in High Contrast Frame -->
                        <div style="width: 100px; height: 42px; border: 2px solid var(--phosphor); background: #000; display: flex; align-items: center; justify-content: center; padding: 2px; box-shadow: inset 0 0 8px rgba(var(--phosphor-rgb), 0.5), 0 0 10px rgba(var(--phosphor-rgb), 0.3); flex-shrink: 0;">
                            <img src="${node.badge}" alt="${node.title}" width="88" height="31" style="image-rendering: pixelated; display: block;">
                        </div>

                        <div style="flex: 1; min-width: 0;">
                            <div style="font-size: 0.8em; opacity: 0.75; letter-spacing: 0.5px;">CARRIER TARGET URL:</div>
                            <div style="font-size: 0.95em; font-weight: bold; color: var(--phosphor); word-break: break-all; text-shadow: 0 0 6px var(--phosphor);">
                                ${node.url}
                            </div>
                        </div>
                    </div>

                    <!-- Historic Archive Note / Excerpt -->
                    <div style="font-size: 0.88em; line-height: 1.45; opacity: 0.9; background: rgba(0, 0, 0, 0.4); padding: 8px 12px; border-left: 3px solid var(--phosphor); margin-top: 4px;">
                        "${node.desc}"
                    </div>

                    <!-- Footer Uplink Launcher -->
                    <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed rgba(var(--phosphor-rgb), 0.35); padding-top: 6px; margin-top: 4px;">
                        <span style="font-size: 0.75em; opacity: 0.7;">OPTICAL DENSITY: 1.42D</span>
                        <a href="${node.url}" target="_blank" rel="noopener" style="background: var(--phosphor); color: #000; font-weight: bold; text-decoration: none; font-size: 0.85em; padding: 4px 16px; border-radius: 2px; text-shadow: none; box-shadow: 0 0 10px rgba(var(--phosphor-rgb), 0.4);">
                            [ ESTABLISH UPLINK ↗ ]
                        </a>
                    </div>
                </div>
            </div>
            
            <!-- Heavy Black Inter-Frame Dividing Bar (True Film Negative Margin) -->
            <div class="microfiche-film-divider"></div>
        `;
    }).join("");

    return `
        <div style="display: flex; flex-direction: column; height: 100%; width: 100%; overflow: hidden; justify-content: space-between;">
            <!-- Top Projector Lens & Frame Viewport Aperture -->
            <div class="microfiche-lens-housing" id="microfiche-lens-viewport" style="flex: 1; min-height: 0; position: relative; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between;">
                <div class="microfiche-crosshair-v"></div>
                <div class="microfiche-crosshair-h"></div>
                
                <!-- Optical Graticule Telemetry Header -->
                <div style="display: flex; justify-content: space-between; font-size: 0.75em; opacity: 0.8; letter-spacing: 1px; z-index: 5;">
                    <span>[ OPTICAL CASSETTE: DEC-35MM-F9 ]</span>
                    <span id="microfiche-frame-counter">FRAME: ${String(activeIndex + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}</span>
                    <span>MAGNIFICATION: 24X</span>
                </div>

                <!-- Continuous Moving Reel Stage -->
                <div id="microfiche-stage-container" style="flex: 1; min-height: 0; position: relative; overflow: hidden; display: flex; align-items: center; width: 100%;">
                    <div id="microfiche-film-track">
                        ${framesHTML}
                    </div>
                </div>

                <!-- Optical Focus Footer -->
                <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed rgba(var(--phosphor-rgb), 0.3); padding-top: 6px; z-index: 5;">
                    <span style="font-size: 0.75em; opacity: 0.65;">FOCUS: AUTO-CALIBRATED</span>
                    <span style="font-size: 0.75em; opacity: 0.65;">MOTOR: DUAL-SPINDLE REEL</span>
                </div>
            </div>

            <!-- Bottom Motorized Turret Rotary Controls -->
            <div style="margin-top: 10px; display: flex; justify-content: space-between; align-items: center; background: rgba(0, 0, 0, 0.4); border: 1px solid rgba(var(--phosphor-rgb), 0.35); padding: 6px 12px; border-radius: 3px; z-index: 5;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 0.85em; opacity: 0.8;">TURRET MOTOR:</span>
                    <button type="button" id="btn-prev-card" style="background: rgba(var(--phosphor-rgb), 0.1); border: 1px solid var(--phosphor); color: var(--phosphor); font-family: inherit; font-size: 0.85em; padding: 3px 12px; cursor: pointer;">
                        [ ◄ FAST REV ]
                    </button>
                    <button type="button" id="btn-next-card" style="background: rgba(var(--phosphor-rgb), 0.1); border: 1px solid var(--phosphor); color: var(--phosphor); font-family: inherit; font-size: 0.85em; padding: 3px 12px; cursor: pointer;">
                        [ FAST FWD ► ]
                    </button>
                </div>
                <div style="font-size: 0.8em; opacity: 0.7;">
                    SEEK: [ MOUSE WHEEL / ARROW KEYS ]
                </div>
            </div>
        </div>
    `;
}

/**
 * Builds the full window markup including Mode Switcher and Backlink Box
 */
function buildFullViewerHTML() {
    const isRolo = activeMode === "rolodex";

    return `
        <div id="links-container" style="display: flex; flex-direction: column; height: 100%; width: 100%; overflow: hidden; background: transparent; font-family: inherit; font-size: inherit; color: var(--phosphor); padding: 10px; box-sizing: border-box; gap: 10px;">
            
            <!-- Top Master Controls: Prototype Switcher & CyberVixen Backlink Header -->
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(var(--phosphor-rgb), 0.4); padding-bottom: 8px; flex-shrink: 0;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 0.85em; font-weight: bold; letter-spacing: 1px;">VIEWPORT ARCHITECTURE:</span>
                    <button type="button" id="btn-mode-microfiche" style="background: ${!isRolo ? 'var(--phosphor)' : 'rgba(var(--phosphor-rgb), 0.1)'}; color: ${!isRolo ? '#000' : 'var(--phosphor)'}; border: 1px solid var(--phosphor); font-family: inherit; font-size: 0.8em; padding: 2px 8px; font-weight: bold; cursor: pointer;">
                        [ 1. MICROFICHE 35MM ]
                    </button>
                    <button type="button" id="btn-mode-rolodex" style="background: ${isRolo ? 'var(--phosphor)' : 'rgba(var(--phosphor-rgb), 0.1)'}; color: ${isRolo ? '#000' : 'var(--phosphor)'}; border: 1px solid var(--phosphor); font-family: inherit; font-size: 0.8em; padding: 2px 8px; font-weight: bold; cursor: pointer;">
                        [ 2. ROLODEX DECK ]
                    </button>
                </div>
                <button type="button" id="btn-toggle-backlink" style="background: rgba(var(--phosphor-rgb), 0.1); border: 1px dashed var(--phosphor); color: var(--phosphor); font-family: inherit; font-size: 0.8em; padding: 2px 8px; cursor: pointer;">
                    [ + LINK BACK TO CYBERVIXEN ]
                </button>
            </div>

            <!-- Collapsible CyberVixen Backlink & Badge Embed Tray -->
            <div id="backlink-tray" style="display: none; border: 1px solid var(--phosphor); background: rgba(0, 0, 0, 0.75); padding: 10px; border-radius: 3px; box-shadow: 0 0 10px rgba(var(--phosphor-rgb), 0.25); flex-shrink: 0;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 0.82em; font-weight: bold;">
                    <span>// CYBERVIXEN 88x31 NETWORK BADGE EMBED CODE //</span>
                    <button type="button" id="btn-close-backlink" style="background: transparent; border: none; color: var(--phosphor); font-family: inherit; font-weight: bold; cursor: pointer;">[X]</button>
                </div>
                <div style="display: flex; gap: 14px; align-items: center;">
                    <div style="border: 1px solid var(--phosphor); padding: 2px; background: #000; flex-shrink: 0;">
                        <img src="${MY_LINK_BADGE.imgSrc}" alt="${MY_LINK_BADGE.alt}" width="88" height="31" style="display: block;">
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <textarea id="my-badge-code" rows="2" readonly style="width: 100%; background: rgba(0, 0, 0, 0.8); border: 1px solid rgba(var(--phosphor-rgb), 0.5); color: var(--phosphor); font-family: inherit; font-size: 0.78em; padding: 4px; resize: none; box-sizing: border-box;">${MY_LINK_BADGE.htmlCode}</textarea>
                    </div>
                    <button type="button" id="btn-copy-badge-code" style="background: var(--phosphor); color: #000; border: none; font-family: inherit; font-size: 0.8em; font-weight: bold; padding: 6px 10px; cursor: pointer; border-radius: 2px;">
                        [ COPY CODE ]
                    </button>
                </div>
            </div>

            <!-- Dynamic Active Prototype Viewport -->
            <div id="links-active-viewport" style="flex: 1; min-height: 0; position: relative;">
                ${isRolo ? renderRolodexMode() : renderMicroficheMode()}
            </div>
        </div>
    `;
}

/**
 * Attaches event listeners for switching modes, stepping cards, and copying badge code
 */
function attachViewerEvents(win) {
    const container = win.querySelector("#links-container");
    if (!container) return;

    const total = NEIGHBOR_NODES.length;
    let spoolVirtualIndex = total * 25 + activeIndex; // Safely in middle of deep 60x reel
    let seekTimeout = null;

    const refreshViewport = (isSeeking = false) => {
        const vp = container.querySelector("#links-active-viewport");
        if (!vp) return;

        if (activeMode === "rolodex") {
            vp.innerHTML = renderRolodexMode();
            attachStepButtons();
        } else {
            const stage = container.querySelector("#microfiche-stage-container");
            const track = container.querySelector("#microfiche-film-track");

            if (stage && track) {
                const stageWidth = stage.getBoundingClientRect().width || stage.clientWidth || 700;
                const total = NEIGHBOR_NODES.length;
                const cellWidth = stageWidth;
                const dividerWidth = 70;
                const totalItemWidth = cellWidth + dividerWidth;

                // Adjust all frame cells to match exact stage width
                const frameCells = track.querySelectorAll(".microfiche-frame-cell");
                frameCells.forEach((c) => {
                    c.style.width = `${cellWidth}px`;
                    const realIdx = parseInt(c.dataset.realIdx, 10);
                    c.classList.toggle("frame-active", realIdx === activeIndex);
                });

                if (isSeeking) {
                    track.classList.add("seeking-slide");
                    clearTimeout(seekTimeout);
                    seekTimeout = setTimeout(() => {
                        track.classList.remove("seeking-slide");
                    }, 440);
                }

                // Compute exact offset: single-direction strictly monotonic translation
                const offset = -(spoolVirtualIndex * totalItemWidth);
                track.style.transform = `translateX(${offset}px)`;

                // Update header counter
                const counter = container.querySelector("#microfiche-frame-counter");
                if (counter) {
                    counter.textContent = `FRAME: ${String(activeIndex + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
                }
            } else {
                vp.innerHTML = renderMicroficheMode();
                attachStepButtons();
                requestAnimationFrame(() => {
                    refreshViewport(false);
                });
            }
        }
    };

    const attachStepButtons = () => {
        const btnPrev = container.querySelector("#btn-prev-card");
        const btnNext = container.querySelector("#btn-next-card");
        const total = NEIGHBOR_NODES.length;

        btnPrev?.addEventListener("click", () => {
            if (activeMode === "microfiche") {
                playMicroficheSlide();
                // Long Spool Seek: Whips past full reel cycle (total + 1) in reverse
                spoolVirtualIndex -= (total + 1);
                activeIndex = (activeIndex - 1 + total) % total;
                refreshViewport(true);
            } else {
                playRelayThump();
                activeIndex = (activeIndex - 1 + total) % total;
                refreshViewport(false);
            }
        });

        btnNext?.addEventListener("click", () => {
            if (activeMode === "microfiche") {
                playMicroficheSlide();
                // Long Spool Seek: Whips past full reel cycle (total + 1) in forward
                spoolVirtualIndex += (total + 1);
                activeIndex = (activeIndex + 1) % total;
                refreshViewport(true);
            } else {
                playRelayThump();
                activeIndex = (activeIndex + 1) % total;
                refreshViewport(false);
            }
        });

        // Clickable tabs in Rolodex Mode
        container.querySelectorAll(".rolodex-tab-item").forEach(tab => {
            tab.addEventListener("click", () => {
                playKeyClick();
                activeIndex = parseInt(tab.dataset.index, 10) || 0;
                refreshViewport(false);
            });
        });
    };

    // Mode Switchers
    const btnRolo = container.querySelector("#btn-mode-rolodex");
    const btnFiche = container.querySelector("#btn-mode-microfiche");

    btnRolo?.addEventListener("click", () => {
        playBell(880, 0.05);
        activeMode = "rolodex";
        win.querySelector(".window-body").innerHTML = buildFullViewerHTML();
        attachViewerEvents(win);
    });

    btnFiche?.addEventListener("click", () => {
        playMicroficheSlide();
        activeMode = "microfiche";
        win.querySelector(".window-body").innerHTML = buildFullViewerHTML();
        attachViewerEvents(win);
    });

    // Backlink Tray Toggle
    const tray = container.querySelector("#backlink-tray");
    const btnToggleBacklink = container.querySelector("#btn-toggle-backlink");
    const btnCloseBacklink = container.querySelector("#btn-close-backlink");
    const btnCopy = container.querySelector("#btn-copy-badge-code");
    const copyArea = container.querySelector("#my-badge-code");

    btnToggleBacklink?.addEventListener("click", () => {
        playKeyClick();
        tray.style.display = tray.style.display === "none" ? "block" : "none";
    });

    btnCloseBacklink?.addEventListener("click", () => {
        tray.style.display = "none";
    });

    btnCopy?.addEventListener("click", () => {
        if (copyArea) {
            copyArea.select();
            navigator.clipboard?.writeText(copyArea.value);
            playBell(1100, 0.08);
            btnCopy.textContent = "[ COPIED! ]";
            setTimeout(() => { btnCopy.textContent = "[ COPY CODE ]"; }, 1500);
        }
    });

    // Debounced Touchpad / Mousewheel Stepping
    let wheelCooldown = false;
    let accumulatedDelta = 0;

    container.addEventListener("wheel", (e) => {
        e.preventDefault();
        accumulatedDelta += e.deltaY;

        if (Math.abs(accumulatedDelta) < 35 || wheelCooldown) return;

        wheelCooldown = true;
        const total = NEIGHBOR_NODES.length;

        if (activeMode === "microfiche") {
            playMicroficheSlide();
            if (accumulatedDelta > 0) {
                spoolVirtualIndex += (total + 1);
                activeIndex = (activeIndex + 1) % total;
            } else {
                spoolVirtualIndex -= (total + 1);
                activeIndex = (activeIndex - 1 + total) % total;
            }
            refreshViewport(true);
        } else {
            playKeyClick();
            if (accumulatedDelta > 0) {
                activeIndex = (activeIndex + 1) % total;
            } else {
                activeIndex = (activeIndex - 1 + total) % total;
            }
            refreshViewport(false);
        }

        accumulatedDelta = 0;
        setTimeout(() => {
            wheelCooldown = false;
        }, 220);
    }, { passive: false });

    // Keyboard Arrow Left/Right Navigation when window is active
    const handleKeyNav = (e) => {
        if (!document.getElementById("win-links")?.classList.contains("active")) return;
        const total = NEIGHBOR_NODES.length;
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
            if (activeMode === "microfiche") {
                playMicroficheSlide();
                spoolVirtualIndex -= (total + 1);
                activeIndex = (activeIndex - 1 + total) % total;
                refreshViewport(true);
            } else {
                playKeyClick();
                activeIndex = (activeIndex - 1 + total) % total;
                refreshViewport(false);
            }
        } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
            if (activeMode === "microfiche") {
                playMicroficheSlide();
                spoolVirtualIndex += (total + 1);
                activeIndex = (activeIndex + 1) % total;
                refreshViewport(true);
            } else {
                playKeyClick();
                activeIndex = (activeIndex + 1) % total;
                refreshViewport(false);
            }
        }
    };

    // Live Resize Recalibration
    const handleResize = () => {
        if (activeMode === "microfiche") refreshViewport(false);
    };
    window.addEventListener("resize", handleResize);

    window.addEventListener("keydown", handleKeyNav);
    win._onCloseCallback = () => {
        window.removeEventListener("keydown", handleKeyNav);
        window.removeEventListener("resize", handleResize);
    };

    attachStepButtons();
    refreshViewport(false);
}

/**
 * Main Launch Entry Point for links command
 */
export function launchLinks(ctx) {
    unlockCipher("directory_scout");
    injectLinksCSS();

    const win = openWindow("links", {
        title: "SERENITY // NEIGHBORING NETWORK NODES",
        content: buildFullViewerHTML(),
        width: 0.72,  // 72% screen width by ratio
        height: 0.68  // 68% screen height by ratio
    });

    if (win) {
        attachViewerEvents(win);
    }

    if (ctx && ctx.print) {
        ctx.print("[SYSTEM] Mounted cartridge 'LINKS' in active workspace window.");
    }

    return win;
}

export default launchLinks;
