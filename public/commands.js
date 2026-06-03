/**
 * commands.js — Command Registry
 *
 * The single source of truth for every command the terminal accepts.
 * To add a command: add an entry to the Map below.
 * To add an alias: add an entry with { alias: "target-command" }.
 *
 * Each entry can have:
 *   module   {string}   Path to the command's index.mjs (required unless alias)
 *   alias    {string}   Name of the command this entry redirects to
 *   window   {string}   HTML file to fetch and inject for this command's window (optional)
 *   onOpen   {Function} Called each time the command's window is opened (optional)
 */

export const commands = new Map([
    ["help",        { module: "./commands/help/index.mjs" }],
    ["clear",       { module: "./commands/clear/index.mjs" }],
    ["repair",      { module: "./commands/repair/index.mjs" }],
    ["blog",        { module: "./commands/blog/index.mjs" }],
    ["recipes",     { module: "./commands/recipes/index.mjs" }],
    ["about",       { module: "./commands/about/index.mjs" }],
    ["links",       { module: "./commands/links/index.mjs" }],
    ["balls",       { module: "./commands/balls/index.mjs" }],
    ["nethack",     { module: "./commands/nethack/index.mjs" }],
    ["scan",        { module: "./commands/scan/index.mjs" }],
    ["hard reset",  { module: "./commands/hard reset/index.mjs" }],
    ["atabook",     { module: "./commands/atabook/index.mjs" }],

    // Aliases
    ["guestbook",   { alias: "atabook" }],
]);
