/**
 * ui.mjs — UI utilities (Streamlined)
 */

export function handleClick(event) {
    if (event) event.preventDefault();
    document.querySelector("[contenteditable='true']")?.focus();
}