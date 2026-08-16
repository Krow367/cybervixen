/**
 * scrollbar.js — foxOS Authentic Vintage Hardware Scrollbar Engine
 * 
 * Implements:
 * - Pixel-perfect custom scrollbars with tactile Clicky Step Buttons (▲ / ▼)
 * - Draggable physical thumb slider
 * - Click & hold continuous paging
 * - Native touch/wheel synchronization
 */

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

/**
 * Initializes custom vintage scrollbars inside a scrollbox container.
 * 
 * @param {HTMLElement} root - The element with [data-scrollbox]
 */
export function setupScrollbar(root) {
    const viewport = root.querySelector("[data-viewport]");
    const track = root.querySelector("[data-track]");
    const thumb = root.querySelector("[data-thumb]");
    const buttons = root.querySelectorAll("[data-dir]");

    if (!viewport || !track || !thumb) return;

    let dragging = false;
    let startY = 0;
    let startTop = 0;
    let holdTimer = null;
    let holdInterval = null;
    let paintScheduled = false;

    function metrics() {
        const trackH = track.clientHeight;
        const viewH = viewport.clientHeight;
        const scrollH = viewport.scrollHeight;
        const maxScroll = Math.max(0, scrollH - viewH);
        const thumbH = maxScroll ? Math.max(20, (viewH / scrollH) * trackH) : trackH;
        const maxThumbTop = Math.max(0, trackH - thumbH);
        return { trackH, viewH, scrollH, maxScroll, thumbH, maxThumbTop };
    }

    function paint() {
        paintScheduled = false;
        const { trackH, viewH, scrollH, maxScroll, thumbH, maxThumbTop } = metrics();

        if (!trackH || !viewH || scrollH <= viewH || !maxScroll) {
            thumb.style.display = "none";
            return;
        }

        thumb.style.display = "block";
        thumb.style.height = `${thumbH}px`;
        const top = (viewport.scrollTop / maxScroll) * maxThumbTop;
        thumb.style.top = `${top}px`;
    }

    function paintSoon() {
        if (!paintScheduled) {
            paintScheduled = true;
            requestAnimationFrame(paint);
        }
    }

    function scrollByStep(dir) {
        const step = 48; // Smooth 48px scroll step
        viewport.scrollTop += step * dir;
        paintSoon();
    }

    function startHold(dir) {
        scrollByStep(dir);
        holdTimer = setTimeout(() => {
            holdInterval = setInterval(() => scrollByStep(dir), 40);
        }, 250);
    }

    function stopHold() {
        clearTimeout(holdTimer);
        clearInterval(holdInterval);
        holdTimer = null;
        holdInterval = null;
    }

    // ─── Button Click & Hold Listeners ────────────────────────────────────────
    buttons.forEach((btn) => {
        const dir = Number(btn.getAttribute("data-dir")) || 1;
        btn.addEventListener("mousedown", (e) => {
            e.preventDefault();
            startHold(dir);
        });
        btn.addEventListener("mouseup", stopHold);
        btn.addEventListener("mouseleave", stopHold);
    });

    // ─── Thumb Dragging Listeners ─────────────────────────────────────────────
    thumb.addEventListener("mousedown", (e) => {
        e.preventDefault();
        dragging = true;
        startY = e.clientY;
        startTop = thumb.getBoundingClientRect().top - track.getBoundingClientRect().top;
        thumb.classList.add("dragging");
    });

    const onMouseMove = (e) => {
        if (!dragging) return;
        const { maxScroll, maxThumbTop } = metrics();
        const nextTop = clamp(startTop + (e.clientY - startY), 0, maxThumbTop);
        thumb.style.top = `${nextTop}px`;
        viewport.scrollTop = maxThumbTop ? (nextTop / maxThumbTop) * maxScroll : 0;
    };

    const onMouseUp = () => {
        if (dragging) {
            dragging = false;
            thumb.classList.remove("dragging");
        }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    // ─── Native Wheel / Scroll Sync ───────────────────────────────────────────
    viewport.addEventListener("scroll", paintSoon, { passive: true });

    // ─── Resize Observer to Repaint on Window Resize ───────────────────────────
    const ro = new ResizeObserver(paintSoon);
    ro.observe(viewport);
    if (viewport.firstElementChild) ro.observe(viewport.firstElementChild);

    // Initial Paint
    setTimeout(paintSoon, 50);
}
