/* eslint "no-unused-expressions": "off" */
import pause from "./pause.js";

import { handleClick } from "./ui.mjs"

// Command history
let prev = getHistory();
let historyIndex = -1;
let tmp = "";

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
 * Newlines becomes <br>
 * Tabs become three spaces.
 * Spaces become &nbsp;
 * */
function getChar(char) {
	let result;
	if (typeof char === "string") {
		if (char === "\n") {
			result = document.createElement("br");
		} else if (char === "\t") {
			let tab = document.createElement("span");
			tab.innerHTML = "&nbsp;&nbsp;&nbsp;";
			result = tab;
		} else if (char === " ") {
			let space = document.createElement("span");
			space.innerHTML = "&nbsp;";
			space.classList.add("char");
			result = space;
		} else {
			let span = document.createElement("span");
			span.classList.add("char");
			span.textContent = char;
			result = span;
		}
	}
	return result;
}

/**
 * Types the given text on the screen
 * @param {string|Array<string>} text Text to type
 * @param {Object} options Typer config
 * @param {number} options.wait Time (ms) to wait between characters.
 * @param {number} options.lineWait If text is an array of strings, it will wait this amount (ms) between lines
 * @param {number} options.finalWait Time (ms) to wait when finished.
 * @param {string} options.typerClass Class to add to the typing container, in order to style is with CSS
 * @param {boolean} options.useContainer If true, types text into the container element (3rd parameter). If false, creates a new div
 * @param {boolean} options.stopBlinking Stop blinking when typing is done
 * @param {boolean} options.processChars Whether to preprocess spaces, tabs and newlines to &nbsp; (3x&nbsp;) and <br>
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

	// If text is an array, e.g. type(['foo', 'bar'])
	if (processChars && Array.isArray(text)) {
		for (const t of text)
			await type(
				t,
				{
					...options,
					initialWait: lineWait,
					finalWait: lineWait
				},
				container
			);
		return;
	}

	let interval;
	return new Promise(async (resolve) => {
		if (interval) {
			clearInterval(interval);
			interval = null;
		}
		// Create a div where all the characters can be appended to (or use the given container)
		let typer = useContainer
			? container
			: document.createElement("div");
		typer.classList.add("typer", "active");
		if (fox) {
			typer.classList.add("no-cursor");
		}

		if (typerClass) {
			typer.classList.add(typerClass);
		}
		// Handy if reusing the same container
		if (clearContainer) {
			container.innerHTML = "&nbsp;";
		}

		if (!useContainer) {
			container.appendChild(typer);
		}

		if (initialWait) {
			await pause(initialWait / 1000);
		}

		let queue = text;
		if (processChars) {
			queue = text.split("");
		}

		let prev;

		// Use an interval to repeatedly pop a character from the queue and type it on screen
		interval = setInterval(async () => {
			if (queue.length) {
				let char = queue.shift();

				// This is an optimisation for typing a large number of characters on the screen.
				// It seems the performance degrades when trying to add 500+ DOM elements rapidly on the screen.
				// So the content of the previous element is moved to the typer container and removed, which
				// reduces the amount of DOM elements.
				// This may cause issues when the element is removed while the character is still animating (red screen)
				if (processChars && prev) {
					prev.remove();
					if (
						prev.firstChild &&
						prev.firstChild.nodeType ===
						Node.TEXT_NODE
					) {
						typer.innerText +=
							prev.innerText;
					} else {
						typer.appendChild(prev);
					}
				}
				let element = processChars
					? getChar(char)
					: char;
				if (element) {
					typer.appendChild(element);

					if (element.nodeName === "BR") {
						scroll(container);
					}
				}
				prev = element;
			} else {
				// When the queue is empty, clean up the interval
				clearInterval(interval);
				await pause();
				if (stopBlinking) {
					typer.classList.remove("active");
				}
				if (fox) {
					typer.classList.remove("no-cursor")

				}
				resolve();
			}
		}, wait);
	});
}

export function isPrintable(keycode) {
	return (
		(keycode > 47 && keycode < 58) || // number keys
		keycode === 32 || // spacebar & return key(s) (if you want to allow carriage returns)
		(keycode > 64 && keycode < 91) || // letter keys
		(keycode > 95 && keycode < 112) || // numpad keys
		(keycode > 185 && keycode < 193) || // ;=,-./` (in order)
		(keycode > 218 && keycode < 223)
	);
}

export function moveCaretToEnd(el) {
	var range, selection;
	if (document.createRange) {
		range = document.createRange(); //Create a range (a range is a like the selection but invisible)
		range.selectNodeContents(el); //Select the entire contents of the element with the range
		range.collapse(false); //collapse the range to the end point. false means collapse to end rather than the start
		selection = window.getSelection(); //get the selection object (allows you to change selection)
		selection.removeAllRanges(); //remove any selections already made
		selection.addRange(range); //make the range you have just created the visible selection
	}
}

/**
 * Shows an input field, returns a resolved promise with the typed text on <enter>
 * @param {boolean} pw whether input is a password
 **/
export async function input(pw) {
	return new Promise((resolve) => {
		// This handles all user input
		const onKeyDown = (event) => {
			// ENTER
			if (event.keyCode === 13) {
				event.preventDefault();
				event.target.setAttribute(
					"contenteditable",
					false
				);
				let result = cleanInput(
					event.target.textContent
				);

				// history
				addToHistory(result);
				resolve(result);
			}
			// UP
			else if (event.keyCode === 38) {
				if (historyIndex === -1)
					tmp = event.target.textContent;
				historyIndex = Math.min(
					prev.length - 1,
					historyIndex + 1
				);
				let text = prev[historyIndex];
				event.target.textContent = text;
			}
			// DOWN
			else if (event.keyCode === 40) {
				historyIndex = Math.max(-1, historyIndex - 1);
				let text = prev[historyIndex] || tmp;
				event.target.textContent = text;
			}
			// BACKSPACE
			else if (event.keyCode === 8) {
				// Prevent inserting a <br> when removing the last character
				if (event.target.textContent.length === 1) {
					event.preventDefault();
					event.target.innerHTML = "";
				}
			}
			// Check if character can be shown as output (skip if CTRL is pressed)
			else if (isPrintable(event.keyCode) && !event.ctrlKey) {
				event.preventDefault();
				// Wrap the character in a span
				let span = document.createElement("span");

				let keyCode = event.keyCode;
				let chrCode =
					keyCode - 48 * Math.floor(keyCode / 48);
				let chr = String.fromCharCode(
					96 <= keyCode ? chrCode : keyCode
				);
				// Add span to the input
				span.classList.add("char");
				span.textContent = chr;
				event.target.appendChild(span);

				// For password field, fill the data-pw attr with asterisks
				// which will be shown using CSS
				if (pw) {
					let length =
						event.target.textContent.length;
					event.target.setAttribute(
						"data-pw",
						Array(length).fill("*").join("")
					);
				}
				moveCaretToEnd(event.target);
			}
		};

		// Add input to terminal
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
	// Only allow words, separated by space
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

	// Catch any commands that need to open an external link so browsers don't get pissy
	let pissy = ["atabook", "guestbook"]
	if (pissy.some((word) => command.includes(word))) {
		await type("Signed in blood...");
		await pause(1)
		window.open("https://cybervixen.atabook.org/", "_blank");
		return;
	}
	// Try to import the command function
	try {
		module = await import(`./commands/${command}/index.mjs`);
	} catch (e) {
		console.error(e);
		// Kinda abusing TypeError to check if the import failed
		if (e instanceof TypeError) {
			e.message = `Unknown command: ${command}`;
		}
		// E.g. syntax error
		else {
			e.message = "Error while executing command";
		}
		throw e;
	}

	module.stylesheets?.forEach((name) => {
		addStylesheet(`commands/${command}/${name}.css`);
	});

	// Try to import and parse any HTML templates that the command module exports
	module.templates?.forEach(async (name) => {
		await loadTemplates(`commands/${command}/${name}.html`);
	});

	// Show any output if the command exports any
	await type(module.output);
	await pause();

	// Execute the command (default export)
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

	// Create new link Element
	let link = document.createElement("link");

	// set the attributes for link element
	link.rel = "stylesheet";
	link.type = "text/css";
	link.href = href;

	// Append link element to HTML head
	head.appendChild(link);
}

export function openWindow(id) {
	document.getElementById(id).classList.remove("hidden");
	document.getElementById(id).style.display = "";
	document.getElementById(id).querySelectorAll("[data-scrollbox]").forEach(setupFakeScrollbar);
}

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

function setupContentLoader(windowEl, attr = "recipe") {
	const content = windowEl.querySelector("[data-content]");
	const sidebar = windowEl.querySelector("[data-sidebar-content");

	sidebar.addEventListener("click", async (e) => {
		const link = e.target.closest(`a[data-${attr}]`);
		if (!link) return;
		e.preventDefault();
		content.innerHTML = await fetch(link.dataset[attr]).then(r => r.text());
		document.getElementById("recipes").querySelectorAll("[data-scrollbox]").forEach(setupFakeScrollbar);
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

			return `
			<p><a href="#" data-recipe="/recipes/${name}">${label}</a></p>`;
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

		viewport.scrollTop += clickY < thumbMid ? -viewport.clientHeight * 0.9 : viewport.clientHeight * 0.9;
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
