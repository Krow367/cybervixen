/**
 * mobilecheck.js — Mobile Device Warning & Navigation Intercept Modal
 *
 * Checks if the visitor is browsing on a touchscreen / mobile viewport.
 * Displays a retro phosphor warning overlay with direct buttons to:
 * - foxNet Chat
 * - Blog (log.exe)
 * - Recipes (cookbook.exe)
 * - Links (web.exe)
 * - [ Continue Anyway ] (dimmed secondary button to proceed into desktop terminal)
 */

export function isMobileDevice() {
    // Check coarse touch pointer or narrow mobile screen dimensions
    const isTouch = window.matchMedia("(any-hover: none)").matches || window.matchMedia("(pointer: coarse)").matches;
    const isNarrow = window.innerWidth <= 768;
    const isMobileAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    return (isTouch && isNarrow) || isMobileAgent;
}

export function checkMobileModal() {
    if (sessionStorage.getItem("foxos_mobile_dismissed")) {
        return;
    }

    if (isMobileDevice()) {
        showMobileModal();
    }
}

function showMobileModal() {
    // Prevent duplicate overlays
    if (document.getElementById("mobile-modal-overlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "mobile-modal-overlay";
    overlay.innerHTML = `
        <div id="mobile-modal-dialog">
            <div class="mobile-modal-header">
                <span>// HARDWARE COMPATIBILITY NOTICE //</span>
            </div>
            
            <p class="mobile-modal-text">
                Mobile / Touchscreen device detected.<br>
                <strong>foxOS</strong> is designed to emulate the experience of using an old terminal-style computer like the DEC VT100. I do not test nor support mobile use on this site and your experience may be negative. </p>
                <p>The links below are the only mobile-friendly parts of this site. Continue at your own risk.
            </p>

            <div class="mobile-modal-prompt">QUICK MOBILE DESTINATIONS:</div>

            <div class="mobile-modal-actions">
                <a href="/mobile-chat.html" class="mobile-btn">
                    <span class="btn-label">foxNet Chat</span>
                    <span class="btn-sub">[ chat.exe ]</span>
                </a>
                <a href="/mobile-blog.html" class="mobile-btn">
                    <span class="btn-label">Blog / Log</span>
                    <span class="btn-sub">[ log.exe ]</span>
                </a>
                <a href="/mobile-recipes.html" class="mobile-btn">
                    <span class="btn-label">Recipes Compendium</span>
                    <span class="btn-sub">[ cookbook.exe ]</span>
                </a>
                <a href="/mobile-links.html" class="mobile-btn">
                    <span class="btn-label">Webrings &amp; Links</span>
                    <span class="btn-sub">[ web.exe ]</span>
                </a>
                <button type="button" id="mobile-btn-continue" class="mobile-btn secondary">
                    <span class="btn-label">Continue to Desktop Terminal Anyway</span>
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const continueBtn = overlay.querySelector("#mobile-btn-continue");
    continueBtn.addEventListener("click", () => {
        sessionStorage.setItem("foxos_mobile_dismissed", "true");
        overlay.classList.add("fade-out");
        setTimeout(() => overlay.remove(), 200);
    });
}
