window.isMobile = function () {
    return window.matchMedia("(any-hover:none)").matches;
};

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}

function shouldRunMobileCheck() {
    if (sessionStorage.getItem("mobileChecked")) return false;
    sessionStorage.setItem("mobileChecked", "true");
    return true;
}

function init() {
    if (shouldRunMobileCheck() && window.isMobile()) {
        mobileDetected();
        
    }
}

function mobileDetected() {
    // Inject styles
    const style = document.createElement("style");
    style.textContent = `
        #mobile-overlay {
            position: fixed;
            inset: 0;
            z-index: 99999;
            background: rgba(0, 0, 0, 0.85);
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: "Courier New", Courier, monospace;
        }

        #mobile-dialog {
            background: #0a0a0a;
            border: 2px solid #39ff14;
            color: #39ff14;
            padding: 2rem;
            max-width: 320px;
            width: 90%;
            text-align: center;
            box-shadow: 0 0 24px #39ff1466;
        }

        #mobile-dialog h2 {
            margin: 0 0 0.5rem;
            font-size: 1rem;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            color: #39ff14;
        }

        #mobile-dialog p {
            font-size: 0.75rem;
            color: #aaa;
            margin: 0 0 1.5rem;
            line-height: 1.5;
        }

        .mobile-btn {
            display: block;
            width: 100%;
            padding: 0.6rem;
            margin-bottom: 0.6rem;
            background: transparent;
            border: 1px solid #39ff14;
            color: #39ff14;
            font-family: "Courier New", Courier, monospace;
            font-size: 0.8rem;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            cursor: pointer;
            transition: background 0.15s, color 0.15s;
        }

        .mobile-btn:hover,
        .mobile-btn:active {
            background: #39ff14;
            color: #000;
        }

        .mobile-btn.secondary {
            border-color: #555;
            color: #555;
            margin-bottom: 0;
        }

        .mobile-btn.secondary:hover,
        .mobile-btn.secondary:active {
            background: #555;
            color: #000;
        }
    `;
    document.head.appendChild(style);

    // Inject overlay
    const overlay = document.createElement("div");
    overlay.id = "mobile-overlay";
    overlay.innerHTML = `
        <div id="mobile-dialog">
            <h2>// WARNING //</h2>
            <p>Mobile device detected. This site is designed for desktop.<br>
            Where would you like to go?</p>
            <button class="mobile-btn" id="btn-recipes">Recipes</button>
            <button class="mobile-btn" id="btn-links">Links</button>
            <button class="mobile-btn secondary" id="btn-continue">Continue Anyway</button>
        </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById("btn-recipes").addEventListener("click", () => {
        window.location.href = "/mobile-recipes.html";
    });

    document.getElementById("btn-links").addEventListener("click", () => {
        window.location.href = "/mobile-links.html";
    });

    document.getElementById("btn-continue").addEventListener("click", () => {
        overlay.remove();
    });
}
