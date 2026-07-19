import { openWindow } from "../../io.js";
import { type } from "../../io.js";
import { ensureWindowCreated } from "../../windows.js";

// Persist agreement state in module scope across chat openings
let hasAgreed = false;

function playDialUpSound() {
    if (localStorage.getItem("chat_mute") === "true") return;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    let time = ctx.currentTime;

    function playDualTone(f1, f2, start, duration, volume = 0.05) {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.frequency.setValueAtTime(f1, start);
        osc2.frequency.setValueAtTime(f2, start);
        osc1.type = "sine";
        osc2.type = "sine";

        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(volume, start + 0.01);
        gain.gain.setValueAtTime(volume, start + duration - 0.01);
        gain.gain.linearRampToValueAtTime(0, start + duration);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(start);
        osc2.start(start);
        osc1.stop(start + duration);
        osc2.stop(start + duration);
    }

    // 1. Dial tone (350 & 440 Hz) - 0.8s
    playDualTone(350, 440, time, 0.8, 0.04);
    time += 0.9;

    // 2. DTMF dialing "7093" - slowed down to match OG cadences
    const dtmf = {
        "7": [852, 1209],
        "0": [941, 1336],
        "9": [852, 1477],
        "3": [697, 1477]
    };
    const digits = ["7", "0", "9", "3"];
    digits.forEach((d) => {
        const [f1, f2] = dtmf[d];
        playDualTone(f1, f2, time, 0.15, 0.04);
        time += 0.22;
    });
    time += 0.1;

    // 3. Ringback tone (440 + 480 Hz) - 0.8s
    playDualTone(440, 480, time, 0.8, 0.04);
    time += 0.9;

    // 4. Answer Carrier Tone (2100 Hz) - 0.6s
    const carrier = ctx.createOscillator();
    const carrierGain = ctx.createGain();
    carrier.frequency.setValueAtTime(2100, time);
    carrier.type = "sine";
    carrierGain.gain.setValueAtTime(0, time);
    carrierGain.gain.linearRampToValueAtTime(0.04, time + 0.05);
    carrierGain.gain.setValueAtTime(0.04, time + 0.55);
    carrierGain.gain.linearRampToValueAtTime(0, time + 0.6);
    carrier.connect(carrierGain);
    carrierGain.connect(ctx.destination);
    carrier.start(time);
    carrier.stop(time + 0.6);
    time += 0.65;

    // 5. Modem Handshake Screech (Sawtooth Sweep + LFO modulation) - 0.8s
    const screech = ctx.createOscillator();
    const screechGain = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();

    screech.type = "sawtooth";
    screech.frequency.setValueAtTime(1000, time);
    screech.frequency.linearRampToValueAtTime(600, time + 0.8);

    lfo.frequency.value = 15; // 15 Hz
    lfoGain.gain.value = 150;
    lfo.connect(lfoGain);
    lfoGain.connect(screech.frequency);

    const screechFilter = ctx.createBiquadFilter();
    screechFilter.type = "bandpass";
    screechFilter.frequency.setValueAtTime(800, time);
    screechFilter.Q.setValueAtTime(1.0, time);

    screechGain.gain.setValueAtTime(0, time);
    screechGain.gain.linearRampToValueAtTime(0.015, time + 0.05);
    screechGain.gain.setValueAtTime(0.015, time + 0.75);
    screechGain.gain.linearRampToValueAtTime(0, time + 0.8);

    screech.connect(screechFilter);
    screechFilter.connect(screechGain);
    screechGain.connect(ctx.destination);

    lfo.start(time);
    screech.start(time);
    lfo.stop(time + 0.8);
    screech.stop(time + 0.8);

    // 6. Modem Static Hiss (Filtered White Noise) - 1.2s (overlapping slightly)
    const hissTime = time - 0.2;
    const hissDuration = 1.2;
    const bufferSize = ctx.sampleRate * hissDuration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const bufferData = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        bufferData[i] = Math.random() * 2 - 1;
    }

    const hissSource = ctx.createBufferSource();
    hissSource.buffer = buffer;

    const hissFilter = ctx.createBiquadFilter();
    hissFilter.type = "bandpass";
    hissFilter.frequency.setValueAtTime(1200, hissTime);
    hissFilter.Q.setValueAtTime(0.6, hissTime);

    const hissGain = ctx.createGain();
    hissGain.gain.setValueAtTime(0, hissTime);
    hissGain.gain.linearRampToValueAtTime(0.05, hissTime + 0.1);
    hissGain.gain.setValueAtTime(0.05, hissTime + hissDuration - 0.1);
    hissGain.gain.linearRampToValueAtTime(0, hissTime + hissDuration);

    hissSource.connect(hissFilter);
    hissFilter.connect(hissGain);
    hissGain.connect(ctx.destination);

    hissSource.start(hissTime);
    hissSource.stop(hissTime + hissDuration);
}

function renderUserList(win, users = []) {
    const container = win.querySelector("#chat-user-list");
    if (!container) return;

    container.innerHTML = "";

    const list = Array.isArray(users) ? users : Object.values(users);
    const localName = window.chattable?.user?.name;
    const localFlair = window.chattable?.user?.flair || localStorage.getItem("flair");
    
    list.forEach(user => {
        const userName = typeof user === "string" ? user : (user?.name || "Anonymous");
        const item = document.createElement("div");
        item.className = "user-item";
        item.style.padding = "6px 8px";
        item.style.borderBottom = "1px solid rgba(var(--phosphor-rgb, 91, 248, 112), 0.15)";
        item.style.fontSize = "1.1rem";
        item.style.color = "var(--phosphor)";
        item.style.display = "flex";
        item.style.alignItems = "center";
        item.style.gap = "8px";

        const nameSpan = document.createElement("span");
        nameSpan.textContent = userName;
        item.appendChild(nameSpan);

        // Determine user flair dynamically based on context
        let userFlair = null;
        if (user && typeof user === "object" && user.flair) {
            userFlair = user.flair;
        } else {
            const userNameLower = userName.toLowerCase();
            if (userNameLower === "cybervixen") {
                userFlair = "owner";
            } else if (localName && userNameLower === localName.toLowerCase()) {
                userFlair = localFlair;
            }
        }

        // Render user flair badge if present
        if (userFlair) {
            const flairSpan = document.createElement("span");
            flairSpan.style.fontSize = "0.75em";
            flairSpan.style.fontWeight = "bold";
            flairSpan.style.textTransform = "uppercase";
            flairSpan.style.padding = "0 4px";
            
            const flair = userFlair.toLowerCase();
            if (flair === "owner") {
                flairSpan.textContent = "[OWNER]";
                flairSpan.style.color = "#FF3333";
                flairSpan.style.textShadow = "0 0 3px #FF3333";
            } else if (flair === "mod" || flair === "moderator") {
                flairSpan.textContent = "[MOD]";
                flairSpan.style.color = "var(--phosphor, #5bf870)";
                flairSpan.style.textShadow = "0 0 3px var(--phosphor, #5bf870)";
            } else if (flair === "tester" || flair === "beta") {
                flairSpan.textContent = "[TESTER]";
                flairSpan.style.color = "var(--phosphor, #5bf870)";
                flairSpan.style.textShadow = "0 0 3px var(--phosphor, #5bf870)";
            } else {
                flairSpan.textContent = `[${userFlair.toUpperCase()}]`;
                flairSpan.style.color = "var(--phosphor, #5bf870)";
            }
            item.appendChild(flairSpan);
        }

        container.appendChild(item);
    });
}

export default async function () {
    // Ensure chat window frame is loaded and appended to DOM immediately
    await ensureWindowCreated("chat");
    const win = document.getElementById("chat");
    if (!win) return {};

    const iframe = win.querySelector("#chattable");
    const splash = win.querySelector("#chat-splash");
    const agreeBtn = win.querySelector("#agree-btn");

    let escapeConfirmPending = false;
    let escapeConfirmTimer = null;
    let agreeKeyHandler = null;

    const showConfirm = () => {
        let bar = win.querySelector("#chat-escape-confirm");
        if (!bar) {
            bar = document.createElement("div");
            bar.id = "chat-escape-confirm";
            bar.style.cssText = `
                position: absolute;
                bottom: 0;
                left: 0;
                right: 0;
                background: rgba(0, 0, 0, 0.95);
                border-top: 1px solid var(--phosphor, #5bf870);
                color: var(--phosphor, #5bf870);
                font-family: inherit;
                font-size: 0.9rem;
                text-align: center;
                padding: 8px;
                z-index: 1000;
                pointer-events: auto;
            `;
            bar.textContent = "[ PRESS ESCAPE AGAIN TO CLOSE - CLICK ANYWHERE ELSE TO REMAIN ]";
            win.appendChild(bar);
        }
        bar.style.display = "block";
    };

    const hideConfirm = () => {
        const bar = win.querySelector("#chat-escape-confirm");
        if (bar) bar.style.display = "none";
    };

    const handleKeyDown = (e) => {
        if (e.key !== "Escape") return;
        if (win.classList.contains("hidden") || !win.classList.contains("active-window")) return;

        e.stopImmediatePropagation();

        if (escapeConfirmPending) {
            clearTimeout(escapeConfirmTimer);
            escapeConfirmPending = false;
            hideConfirm();
            
            const closeBtn = win.querySelector(".close");
            if (closeBtn) closeBtn.click();
        } else {
            escapeConfirmPending = true;
            showConfirm();
            escapeConfirmTimer = setTimeout(() => {
                escapeConfirmPending = false;
                hideConfirm();
            }, 4000);
        }
    };

    const handleOutsideClick = (e) => {
        if (escapeConfirmPending) {
            if (e.target.closest("#chat-escape-confirm")) return;
            escapeConfirmPending = false;
            clearTimeout(escapeConfirmTimer);
            hideConfirm();
        }
    };

    const handleAgree = () => {
        hasAgreed = true;
        if (splash) splash.style.display = "none";
        
        if (agreeKeyHandler) {
            document.removeEventListener("keydown", agreeKeyHandler, true);
            agreeKeyHandler = null;
        }

        setTimeout(() => {
            if (iframe) iframe.focus();
        }, 100);
    };

    const onUsersUpdate = (list) => {
        renderUserList(win, list);
    };

    win._onClose = () => {
        if (iframe) iframe.src = "about:blank";
        document.removeEventListener("keydown", handleKeyDown, true);
        document.removeEventListener("mousedown", handleOutsideClick, true);
        if (agreeKeyHandler) {
            document.removeEventListener("keydown", agreeKeyHandler, true);
            agreeKeyHandler = null;
        }
        if (window.chattable) {
            window.chattable.off("connection", onUsersUpdate);
        }
        clearTimeout(escapeConfirmTimer);
        hideConfirm();
    };

    const loadAndInit = () => {
        if (window.chattable && typeof window.chattable.initialize === "function") {
            window.chattable.loaded = false;
            window.chattable.settings.initialized = false;
            if (window.chattableLoadingLoop) {
                clearInterval(window.chattableLoadingLoop);
            }

            if (iframe && (iframe.src === "about:blank" || !iframe.src)) {
                iframe.src = "https://iframe.chat/embed?chat=39818112";
            }

            window.chattable.off("connection", onUsersUpdate);
            window.chattable.on("connection", onUsersUpdate);

            window.chattable.initialize({ stylesheet: "/commands/chat/chattable.css" });
        }
    };

    const isLibraryLoaded = window.chattable && typeof window.chattable.initialize === "function";
    if (!isLibraryLoaded) {
        const script = document.createElement("script");
        script.src = "https://iframe.chat/scripts/main.min.js";
        script.onload = loadAndInit;
        document.head.appendChild(script);
    } else {
        loadAndInit();
    }

    // Bind agreement logic based on session state
    if (hasAgreed) {
        if (splash) splash.style.display = "none";
    } else {
        if (splash) splash.style.display = "flex";
        if (agreeBtn) {
            agreeBtn.onclick = handleAgree;
        }
        agreeKeyHandler = (e) => {
            if (e.key === "Enter") {
                if (win.classList.contains("hidden") || !win.classList.contains("active-window")) return;
                e.preventDefault();
                e.stopImmediatePropagation();
                handleAgree();
            }
        };
        document.addEventListener("keydown", agreeKeyHandler, true);
    }

    // Attach listeners
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("mousedown", handleOutsideClick, true);

    // 1. Print first line first
    await type("CONNECTING TO SERENITY GATEWAY...", { wait: 20, finalWait: 100 });

    // 2. NOW play the dialup sound
    playDialUpSound();

    // 3. Print the rest of the lines in sync with sound cadences
    await type("DIALING 7093...", { wait: 20, finalWait: 500 });
    await type("CARRIER DETECTED. CONNECTING AT 56kbps...", { wait: 20, finalWait: 600 });
    await type("ESTABLISHING IRC PROTOCOL SESSION...\n", { wait: 20, finalWait: 500 });

    // 4. Open window now that loading and theme rendering is complete
    openWindow("chat");

    // 5. Focus the input (either the splash agreeBtn or the chat iframe if already agreed)
    setTimeout(() => {
        if (hasAgreed) {
            if (iframe) iframe.focus();
        } else {
            if (agreeBtn) agreeBtn.focus();
        }
    }, 200);

    return {};
}
