/**
 * games.js — Game Controller Registry
 *
 * Tracks AbortControllers for active games so any module can cleanly
 * tear down a game's event listeners with a single call.
 *
 * Usage:
 *   import { registerGame, abortGame } from "./games.js";
 *
 *   // In your game's init():
 *   const controller = new AbortController();
 *   registerGame("repair", controller);
 *   element.addEventListener("keydown", handler, { signal: controller.signal });
 *
 *   // To stop the game from anywhere:
 *   abortGame("repair");
 */

const registry = new Map();

/**
 * Registers an AbortController for a named game.
 * If a controller is already registered under that name, it is aborted first.
 *
 * @param {string}          name        Unique game identifier (e.g. "repair")
 * @param {AbortController} controller
 */
export function registerGame(name, controller) {
    registry.get(name)?.abort();
    registry.set(name, controller);
}

/**
 * Aborts and removes the controller for a named game.
 * Safe to call even if no game is registered under that name.
 *
 * @param {string} name
 */
export function abortGame(name) {
    registry.get(name)?.abort();
    registry.delete(name);
}
