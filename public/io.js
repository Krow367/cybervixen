/* eslint "no-unused-expressions": "off" */
import pause from "./pause.js";
import { handleClick } from "./ui.mjs";

// Preload Pages
const files = [
    "./commands/blog/blog.html",
    "./commands/recipes/recipes.html",
    "./commands/about/about.html",
    "./commands/links/links.html"
];

for (const path of files) {
    const html = await fetch(path).then(r => r.text());
    document.body.insertAdjacentHTML("beforeend", html);
}

// Command history
let prev = getHistory();
let historyIndex = -1;
let tmp = "";

// Keep printed lines addressable so earlier characters can be replaced later
const typedBlocks = [];

/**
 * Typed block structure:
 * {
 *   typer: Element,
 *   lines: Array<{
 *     el: Element,
 *     chars: Array<Element>
 *   }>
 * }
 */

function getHistory() {
    let storage = localStorage.getItem("commandHistory");
    let prev;
    if (storage) {
        try {
            let json = JSON.parse(storage);
            prev = Array.isArray(json) ? json : [];
        } catch (e) {
            prev = [];
        }
    } else {
        prev = [];
    }
    return prev;
}

function addToHistory(cmd) {
    prev = [cmd, ...prev];
    historyIndex = -1;
    tmp = "";

    try {
        localStorage.setItem("commandHistory", JSON.stringify(prev));
    } catch (e) { }
}

/**
 * Convert a character that needs to be typed into something that can be shown on the screen.
 * Newlines become <br>
 * Tabs become three spaces.
 * Spaces become &nbsp;
 */
function getChar(char) {
    let result;
    if (typeof char === "string") {
        if (char === "\n") {
            result = document.createElement("br");
        } else if (char === "\t") {
            let tab = document.createElement("span");
            tab.classList.add("char");
            tab.dataset.char = "\t";
            tab.innerHTML = "&nbsp;&nbsp;&nbsp;";
            result = tab;
        } else if (char === " ") {
            let space = document.createElement("span");
            space.innerHTML = "&nbsp;";
            space.classList.add("char");
            space.dataset.char = " ";
            result = space;
        } else {
            let span = document.createElement("span");
            span.classList.add("char");
            span.dataset.char = char;
            span.textContent = char;
            result = span;
        }
    }
    return result;
}

function createTypedBlock(typer) {
    const block = {
        typer,
        lines: []
    };
    typedBlocks.push(block);
    return block;
}

function createTypedLine(block) {
    const line = document.createElement("div");
    line.classList.add("typed-line");

    const lineState = {
        el: line,
        chars: []
    };

    block.lines.push(lineState);
    block.typer.appendChild(line);
    return lineState;
}

function resolveBlock(blockRef = -1) {
    if (typeof blockRef !== "number") return blockRef || null;
    const index = blockRef < 0 ? typedBlocks.length + blockRef : blockRef;
    return typedBlocks[index] || null;
}

function resolveLine(block, lineRef = -1) {
    if (!block) return null;
    if (typeof lineRef !== "number") return lineRef || null;
    const index = lineRef < 0 ? block.lines.length + lineRef : lineRef;
    return block.lines[index] || null;
}

function appendCharToLine(lineState, char, processChars = true) {
    const node = processChars ? getChar(char) : char;
    if (!node) return null;

    lineState.el.appendChild(node);

    if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains("char")) {
        lineState.chars.push(node);
    }
    return node;
}

function replaceCharInLine(lineState, index, char) {
    if (!lineState) return null;
    const target = lineState.chars[index];
    if (!target) return null;

    const next = getChar(char);
    if (!next) return null;

    target.replaceWith(next);
    lineState.chars[index] = next;
    return next;
}

function normalizeWait(wait, payload) {
    return typeof wait === "function" ? wait(payload) : wait;
}

async function typeStringIntoBlock(text, block, options, container) {
    const {
        wait = 30,
        lineWait = 100,
        processChars = true
    } = options;

    let lineState = createTypedLine(block);

    const queue = processChars ? text.split("") : text;

    for (const char of queue) {
        if (char === "\n") {
            lineState.el.appendChild(document.createElement("br"));
            scroll(container);
            const newlineDelay = normalizeWait(wait, { char, line: lineState, block });
            if (newlineDelay) {
                await pause(newlineDelay / 1000);
            }
            if (lineWait) {
                await pause(lineWait / 1000);
            }
            lineState = createTypedLine(block);
            continue;
        }

        appendCharToLine(lineState, char, processChars);
        scroll(container);

        const charDelay = normalizeWait(wait, { char, line: lineState, block });
        if (charDelay) {
            await pause(charDelay / 1000);
        }
    }
}

async function runTypeOps(ops, block, options, container) {
    for (const op of ops) {
        if (!op) continue;

        if (typeof op === "string") {
            await typeStringIntoBlock(op, block, options, container);
            continue;
        }

        if (op.kind === "type") {
            await typeStringIntoBlock(
                op.text ?? "",
                block,
                {
                    ...options,
                    wait: op.wait ?? options.wait,
                    lineWait: op.lineWait ?? options.lineWait,
                    processChars: op.processChars ?? options.processChars
                },
                container
            );
            continue;
        }

        if (op.kind === "replace") {
            const targetBlock = resolveBlock(op.block ?? -1);
            const targetLine = resolveLine(targetBlock, op.line ?? -1);
            const targetIndex = op.index ?? 0;

            replaceCharInLine(targetLine, targetIndex, op.char ?? " ");
            scroll(container);

            const replaceDelay = normalizeWait(op.wait ?? options.wait ?? 0, {
                op,
                block: targetBlock,
                line: targetLine
            });
            if (replaceDelay) {
                await pause(replaceDelay / 1000);
            }
            continue;
        }

        if (op.kind === "replaceMany") {
            const targetBlock = resolveBlock(op.block ?? -1);
            const targetLine = resolveLine(targetBlock, op.line ?? -1);
            const chars = Array.isArray(op.chars) ? op.chars : [];

            for (const item of chars) {
                const idx = item.index ?? 0;
                const chr = item.char ?? " ";
                replaceCharInLine(targetLine, idx, chr);
                scroll(container);

                const stepDelay = normalizeWait(
                    item.wait ?? op.wait ?? options.wait ?? 0,
                    { op: item, block: targetBlock, line: targetLine }
                );
                if (stepDelay) {
                    await pause(stepDelay / 1000);
                }
            }
            continue;
        }

        if (op.kind === "pause") {
            const ms = op.wait ?? 0;
            if (ms) {
                await pause(ms / 1000);
            }
        }
    }
}

/**
 * Types the given text on the screen.
 *
 * Supports:
 * - string
 * - Array<string>
 * - Array<operation>
 *
 * Operation examples:
 * { kind: "type", text: "Hello", wait: 20 }
 * { kind: "pause", wait: 300 }
 * { kind: "replace", line: -1, index: 3, char: "█", wait: 50 }
 * { kind: "replaceMany", line: -1, chars: [{ index: 0, char: "█", wait: 30 }] }
 *
 * @param {string|Array<string>|Array<Object>} text Text or scripted typing ops
 * @param {Object} options Typer config
 * @param {number|Function} options.wait Time (ms) between chars, or function(payload) => ms
 * @param {number} options.initialWait Time (ms) to wait before starting
 * @param {number} options.lineWait Time (ms) between lines
 * @param {number} options.finalWait Time (ms) to wait when finished
 * @param {string} options.typerClass Class to add to the typing container
 * @param {boolean} options.useContainer If true, types text into the container element
 * @param {boolean} options.stopBlinking Stop blinking when typing is done
 * @param {boolean} options.processChars Whether to preprocess spaces, tabs and newlines
 * @param {boolean} options.clearContainer Clear container before typing
 * @param {Element} container DOM element where text will be typed
 * @param {boolean} options.fox For when the fox ascii is printing, hide the cursor
 */
export async function type(
    text,
    options = {},
    container = document.querySelector(".terminal")
) {
    if (!text) return Promise.resolve();

    let {
        wait = 30,
        initialWait = 1000,
        finalWait = 500,
        lineWait = 100,
        typerClass = "",
        useContainer = false,
        stopBlinking = true,
        processChars = true,
        clearContainer = false,
        fox = false,
    } = options;

    let typer = useContainer ? container : document.createElement("div");
    typer.classList.add("typer", "active");

    if (fox) {
        typer.classList.add("no-cursor");
    }

    if (typerClass) {
        typer.classList.add(typerClass);
    }

    if (clearContainer) {
        container.innerHTML = "&nbsp;";
        typedBlocks.length = 0;
    }

    if (!useContainer) {
        container.appendChild(typer);
    }

    const block = createTypedBlock(typer);

    if (initialWait) {
        await pause(initialWait / 1000);
    }

    if (Array.isArray(text) && text.every(item => typeof item === "string")) {
        for (const t of text) {
            await typeStringIntoBlock(
                t,
                block,
                { ...options, wait, lineWait, processChars },
                container
            );
            if (lineWait) {
                await pause(lineWait / 1000);
            }
        }
    } else if (Array.isArray(text)) {
        await runTypeOps(
            text,
            block,
            { ...options, wait, lineWait, processChars },
            container
        );
    } else {
        await typeStringIntoBlock(
            text,
            block,
            { ...options, wait, lineWait, processChars },
            container
        );
    }

    await pause(finalWait / 1000);

    if (stopBlinking) {
        typer.classList.remove("active");
    }
    if (fox) {
        typer.classList.remove("no-cursor");
    }
}

export function isPrintable(keycode) {
    return (
        (keycode > 47 && keycode < 58) ||
        keycode === 32 ||
        (keycode > 64 && keycode < 91) ||
        (keycode > 95 && keycode < 112) ||
        (keycode > 185 && keycode < 193) ||
        (keycode > 218 && keycode < 223)
    );
}

export function moveCaretToEnd(el) {
    var range, selection;
    if (document.createRange) {
        range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    }
}

/**
 * Shows an input field, returns a resolved promise with the typed text on <enter>
 * @param {boolean} pw whether input is a password
 **/
export async function input(pw) {
    return new Promise((resolve) => {
        const onKeyDown = (event) => {
            // ENTER
            if (event.keyCode === 13) {
                event.preventDefault();
                event.target.setAttribute("contenteditable", false);
                let result = cleanInput(event.target.textContent);

                addToHistory(result);
                resolve(result);
            }
            // UP
            else if (event.keyCode === 38) {
                if (historyIndex === -1) {
                    tmp = event.target.textContent;
                }
                historyIndex = Math.min(prev.length - 1, historyIndex + 1);
                let text = prev[historyIndex];
                event.target.textContent = text;

                if (pw) {
                    let length = event.target.textContent.length;
                    event.target.setAttribute(
                        "data-pw",
                        Array(length).fill("*").join("")
                    );
                }

                moveCaretToEnd(event.target);
            }
            // DOWN
            else if (event.keyCode === 40) {
                historyIndex = Math.max(-1, historyIndex - 1);
                let text = prev[historyIndex] || tmp;
                event.target.textContent = text;

                if (pw) {
                    let length = event.target.textContent.length;
                    event.target.setAttribute(
                        "data-pw",
                        Array(length).fill("*").join("")
                    );
                }

                moveCaretToEnd(event.target);
            }
            // BACKSPACE
            else if (event.keyCode === 8) {
                if (event.target.textContent.length === 1) {
                    event.preventDefault();
                    event.target.innerHTML = "";
                }

                if (pw) {
                    requestAnimationFrame(() => {
                        let length = event.target.textContent.length;
                        event.target.setAttribute(
                            "data-pw",
                            Array(length).fill("*").join("")
                        );
                    });
                }
            }
            // Check if character can be shown as output (skip if CTRL is pressed)
            else if (isPrintable(event.keyCode) && !event.ctrlKey && !event.metaKey && !event.altKey) {
                event.preventDefault();

                let span = document.createElement("span");

                let keyCode = event.keyCode;
                let chrCode = keyCode - 48 * Math.floor(keyCode / 48);
                let chr = String.fromCharCode(96 <= keyCode ? chrCode : keyCode);

                span.classList.add("char");
                span.textContent = chr;

                event.target.appendChild(span);

                if (pw) {
                    let length = event.target.textContent.length;
                    event.target.setAttribute(
                        "data-pw",
                        Array(length).fill("*").join("")
                    );
                }

                moveCaretToEnd(event.target);
            }
        };

        let terminal = document.querySelector(".terminal");
        let input = document.createElement("span");
        input.setAttribute("id", "input");
        if (pw) {
            input.classList.add("password");
        }
        input.setAttribute("contenteditable", true);
        input.addEventListener("keydown", onKeyDown);
        terminal.appendChild(input);
        input.focus();
    });
}

/**
 * Processes the user input and executes a command
 * @param {string} input
 */
export async function parse(input) {
    input = cleanInput(input);

    if (!input) {
        return;
    }

    let matches = String(input).match(/^(\w+(?:(?:\s|-)\w+)*)$/);

    if (!matches) {
        throw new Error("Invalid command");
    }

    let command = matches[1];
    let args = matches[2];

    let naughty = ["fuck", "shit", "die", "ass", "cunt"];
    if (naughty.some((word) => command.includes(word))) {
        throw new Error("Please don't use that language");
    }

    let module;

    let pissy = ["atabook", "guestbook"];
    if (pissy.some((word) => command.includes(word))) {
        await type("Signed in blood...");
        await pause(1);
        window.open("https://cybervixen.atabook.org/", "_blank");
        return;
    }

    try {
        module = await import(`./commands/${command}/index.mjs`);
    } catch (e) {
        console.error(e);
        if (e instanceof TypeError) {
            e.message = `Unknown command: ${command}`;
        } else {
            e.message = "Error while executing command";
        }
        throw e;
    }

    module.stylesheets?.forEach((name) => {
        addStylesheet(`commands/${command}/${name}.css`);
    });

    module.templates?.forEach(async (name) => {
        await loadTemplates(`commands/${command}/${name}.html`);
    });

    await type(module.output);
    await pause();

    await module.default?.(args);

    return;
}

/**
 * Lowercase and trim input
 * @param {string} input
 */
export function cleanInput(input) {
    return input.toLowerCase().trim();
}

/**
 * Scrolls to bottom of element
 * @param {Element} el element to scroll
 */
export function scroll(el = document.querySelector(".terminal")) {
    el.scrollTop = el.scrollHeight;
}

/** Types the given text and asks input */
export async function prompt(text, pw = false) {
    await type(text);
    return input(pw);
}

/** Sets a global event listeners and returns when a key is hit */
export async function waitForKey() {
    return new Promise((resolve) => {
        const handle = () => {
            document.removeEventListener("keyup", handle);
            document.removeEventListener("click", handle);
            resolve();
        };
        document.addEventListener("keyup", handle);
        document.addEventListener("click", handle);
    });
}

function addStylesheet(href) {
    let head = document.getElementsByTagName("HEAD")[0];

    let link = document.createElement("link");
    link.rel = "stylesheet";
    link.type = "text/css";
    link.href = href;

    head.appendChild(link);
}

export function openWindow(id) {
    document.getElementById(id).classList.remove("hidden");
    document.getElementById(id).style.display = "";
    document.getElementById(id).querySelectorAll("[data-scrollbox]").forEach(setupFakeScrollbar);
}

function setupContentLoader(windowEl, attr = "recipe") {
    const content = windowEl.querySelector("[data-content]");
    const sidebar = windowEl.querySelector("[data-sidebar-content]");

    sidebar.addEventListener("click", async (e) => {
        const link = e.target.closest(`a[data-${attr}]`);
        if (!link) return;
        e.preventDefault();
        content.innerHTML = await fetch(link.dataset[attr]).then(r => r.text());
        document.getElementById("recipes")
            .querySelectorAll("[data-scrollbox]")
            .forEach(setupFakeScrollbar);
    });
}

setupContentLoader(document.getElementById("recipes"));

const recipesWindow = document.getElementById("recipes");
const sidebar = recipesWindow.querySelector("[data-sidebar-content]");

export async function loadRecipeList() {
    const files = await fetch("/recipes/index.json").then(r => r.json());

    sidebar.innerHTML = files
        .map(name => {
            const label = name
                .replace(".html", "")
                .replaceAll("-", " ")
                .replace(/\b\w/g, c => c.toUpperCase());

            return `<p><a href="#" data-recipe="/recipes/${name}">${label}</a></p>`;
        })
        .join("");
}

function setupFakeScrollbar(root) {
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

    const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

    function metrics() {
        const trackH = track.clientHeight;
        const viewH = viewport.clientHeight;
        const scrollH = viewport.scrollHeight;
        const maxScroll = Math.max(0, scrollH - viewH);
        const thumbH = maxScroll ? Math.max(24, (viewH / scrollH) * trackH) : trackH;
        const maxThumbTop = Math.max(0, trackH - thumbH);
        return { trackH, viewH, scrollH, maxScroll, thumbH, maxThumbTop };
    }

    function paint() {
        const { maxScroll, thumbH, maxThumbTop } = metrics();

        thumb.style.height = `${thumbH}px`;

        if (!maxScroll) {
            thumb.style.top = "0px";
            thumb.style.display = "none";
            return;
        }

        thumb.style.display = "block";
        const top = (viewport.scrollTop / maxScroll) * maxThumbTop;
        thumb.style.top = `${top}px`;
    }

    function scrollByStep(dir) {
        const step = Number(getComputedStyle(root).getPropertyValue("--sb-step")) || 32;
        viewport.scrollTop += step * dir;
    }

    function startHold(dir) {
        scrollByStep(dir);
        holdTimer = setTimeout(() => {
            holdInterval = setInterval(() => scrollByStep(dir), 40);
        }, 300);
    }

    function stopHold() {
        clearTimeout(holdTimer);
        clearInterval(holdInterval);
        holdTimer = null;
        holdInterval = null;
    }

    thumb.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const thumbRect = thumb.getBoundingClientRect();
        dragging = true;
        startY = e.clientY;
        startTop = thumbRect.top - track.getBoundingClientRect().top;
        thumb.classList.add("dragging");
    });

    document.addEventListener("mousemove", (e) => {
        if (!dragging) return;

        const { maxScroll, maxThumbTop } = metrics();
        const nextTop = clamp(startTop + (e.clientY - startY), 0, maxThumbTop);
        thumb.style.top = `${nextTop}px`;

        viewport.scrollTop = maxThumbTop
            ? (nextTop / maxThumbTop) * maxScroll
            : 0;
    });

    document.addEventListener("mouseup", () => {
        dragging = false;
        thumb.classList.remove("dragging");
        stopHold();
    });

    track.addEventListener("mousedown", (e) => {
        if (e.target === thumb) return;

        const rect = track.getBoundingClientRect();
        const clickY = e.clientY - rect.top;
        const thumbTop = thumb.offsetTop;
        const thumbMid = thumbTop + thumb.offsetHeight / 2;

        viewport.scrollTop += clickY < thumbMid
            ? -viewport.clientHeight * 0.9
            : viewport.clientHeight * 0.9;
    });

    buttons.forEach(btn => {
        const dir = Number(btn.dataset.dir);

        btn.addEventListener("mousedown", () => startHold(dir));
        btn.addEventListener("mouseleave", stopHold);
        btn.addEventListener("mouseup", stopHold);
        btn.addEventListener("click", e => e.preventDefault());
    });

    viewport.addEventListener("scroll", paint);
    window.addEventListener("resize", paint);

    paint();
}