
import { parse, type, prompt, input } from "./io.js";
import pause from "./pause.js";



/** Boot screen */


async function on() {
    await power();
    boot();
}

async function power() {
    await pause(0.5);
    document.getElementById("monitor").classList.toggle("turn-on");
    document.getElementById("monitor").classList.toggle("on");
    return;

}

export async function boot() {
    clear();
    let Debug = false;

    if (!Debug) {
        await type(`Cyber Industries(TM) CV-2077 terminal interface`, {
            initialWait: 2000
        });
        await type(`Loading.....`, {
            initialWait: 500
        });
    }

    if (!Debug) {
        await type(`

⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣾⠙⠻⢶⣄⡀⠀⠀⠀⢀⣤⠶⠛⠛⡇⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢹⣇⠀⠀⣙⣿⣦⣤⣴⣿⣁⠀⠀⣸⠇⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠙⣡⣾⣿⣿⣿⣿⣿⣿⣿⣷⣌⠋⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣴⣿⣷⣄⡈⢻⣿⡟⢁⣠⣾⣿⣦⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢹⣿⣿⣿⣿⠘⣿⠃⣿⣿⣿⣿⡏⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⠀⠈⠛⣰⠿⣆⠛⠁⠀⡀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣼⣿⣦⠀⠘⠛⠋⠀⣴⣿⠁⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣤⣶⣾⣿⣿⣿⣿⡇⠀⠀⠀⢸⣿⣏⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⣠⣶⣿⣿⣿⣿⣿⣿⣿⣿⠿⠿⠀⠀⠀⠾⢿⣿⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⣠⣿⣿⣿⣿⣿⣿⡿⠟⠋⣁⣠⣤⣤⡶⠶⠶⣤⣄⠈⠀⠀⠀⠀⠀⠀
⠀⠀⠀⢰⣿⣿⣮⣉⣉⣉⣤⣴⣶⣿⣿⣋⡥⠄⠀⠀⠀⠀⠉⢻⣄⠀⠀⠀⠀⠀
⠀⠀⠀⠸⣿⣿⣿⣿⣿⣿⣿⣿⣿⣟⣋⣁⣤⣀⣀⣤⣤⣤⣤⣄⣿⡄⠀⠀⠀⠀
⠀⠀⠀⠀⠙⠿⣿⣿⣿⣿⣿⣿⣿⡿⠿⠛⠋⠉⠁⠀⠀⠀⠀⠈⠛⠃⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠉⠉⠉⠉⠉⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀`, {
            initialWait: 0,
            wait: 5,
            fox: true,
        });
        await type(`Welcome to FoxOS ver. 1.33.7`, {
            initialWait: 100,
        });
        await type(`"Harmony engineered."`, {
            initialWait: 100,
        });
    }
    await type(`Try 'HELP' for commands.`, {
        initialWait: 100,
    });

    await pause();
    return main();
}



/** Main input terminal, recursively calls itself */
export async function main() {
    let command = await input();
    try {
        await parse(command);
    } catch (e) {
        if (e.message) await type(e.message);
    }
    main();
}

export function addClasses(el, ...cls) {
    let list = [...cls].filter(Boolean);
    el.classList.add(...list);
}

export function getScreen(...cls) {
    let div = document.createElement("div");
    addClasses(div, "fullscreen", ...cls);
    document.querySelector("#crt").appendChild(div);
    return div;
}

export function toggleFullscreen(isFullscreen) {
    document.body.classList.toggle("fullscreen", isFullscreen);
}

/** Attempts to load template HTML from the given path and includes them in the <head>. */
export async function loadTemplates(path) {
    let txt = await fetch(path).then((res) => res.text());
    let html = new DOMParser().parseFromString(txt, "text/html");
    let templates = html.querySelectorAll("template");

    templates.forEach((template) => {
        document.head.appendChild(template);
    });
}

/** Clones the template and adds it to the container. */
export async function addTemplate(id, container, options = {}) {
    let template = document.querySelector(`template#${id}`);
    if (!template) {
        throw Error("Template not found");
    }
    // Clone is the document fragment of the template
    let clone = document.importNode(template.content, true);

    if (template.dataset.type) {
        await type(clone.textContent, options, container);
    } else {
        container.appendChild(clone);
    }

    // We cannot return clone here
    // https://stackoverflow.com/questions/27945721/how-to-clone-and-modify-from-html5-template-tag
    return container.childNodes;
}

/** Creates a new screen and loads the given template into it. */
export async function showTemplateScreen(id) {
    let screen = getScreen(id);
    await addTemplate(id, screen);
    return screen;
}

/**
 * Creates an element and adds it to the given container (or terminal screen if undefined).
 * @param {String} type The type of element to create.
 * @param {Element} container The container to add the created element to.
 * @param {String} cls The class to apply to the created element.
 * @param {Object} attrs Extra attributes to set on the element.
 */
export function el(
    type,
    container = document.querySelector(".terminal"),
    cls = "",
    attrs
) {
    let el = document.createElement(type);
    addClasses(el, cls);

    container.appendChild(el);

    if (attrs) {
        Object.entries(attrs).forEach(([key, value]) => {
            el.setAttribute(key, value);
        });
    }
    return el;
}

/**
 * Creates a <div> and adds it to the screen.
 * @param {Element} container The container to add the created element to.
 * @param {String} cls The class to apply to the created element.
 */
export function div(...args) {
    return el("div", ...args);
}

export function clear(screen = document.querySelector(".terminal")) {
    screen.innerHTML = "";
}



export function setupWindow(root) {
    if (!root) return;

    const titlebar = root.querySelector(".titlebar");
    const minimizeBtn = root.querySelector(".minimize");
    const closeBtn = root.querySelector(".close");
    const focusInput = () => document.querySelector('[contenteditable="true"]')?.focus();

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    const onMouseDown = (e) => {
        if (e.target.closest("button")) return;
        dragging = true;

        const rect = root.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
        startLeft = rect.left;
        startTop = rect.top;

        document.body.style.userSelect = "none";
    };

    const onMouseMove = (e) => {
        if (!dragging) return;
        root.style.left = `${startLeft + (e.clientX - startX)}px`;
        root.style.top = `${startTop + (e.clientY - startY)}px`;
    };

    const onMouseUp = () => {
        if (!dragging) return;
        dragging = false;
        document.body.style.userSelect = "";
        focusInput();
    };

    const onMinimize = () => {
        root.classList.toggle("minimized");
        focusInput();
    };

    const onClose = () => {
        root.classList.add("hidden");
        focusInput();
    };

    titlebar?.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    minimizeBtn?.addEventListener("click", onMinimize);
    closeBtn?.addEventListener("click", onClose);

    return () => {
        titlebar?.removeEventListener("mousedown", onMouseDown);
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        minimizeBtn?.removeEventListener("click", onMinimize);
        closeBtn?.removeEventListener("click", onClose);
    };
}

// Setup pages so we can drag, etc
setupWindow(document.getElementById("blog"));
setupWindow(document.getElementById("recipes"));
setupWindow(document.getElementById("about"));
setupWindow(document.getElementById("links"));

const crt = document.getElementById("crt");

crt.addEventListener("click", () => {
    document.querySelector('[contenteditable = "true"]').focus();
});

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
} else {
    on();
}


