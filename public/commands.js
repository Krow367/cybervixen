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

const base = (name = {}) => ({
    module: `./commands/${name}/index.mjs`,
});

export const commands = new Map([
    ["help", base("help")],
    ["clear", base("clear")],
    ["repair", base("repair")],
    ["blog", base("blog")],
    ["recipes", base("recipes")],
    ["about", base("about")],
    ["links", base("links")],
    ["balls", base("balls")],
    ["hard reset", base("hard reset")],
    ["atabook", base("atabook")],
    ["follow", base("follow")],
    ["theme green", { ...base("theme"), theme: "green" }],
    ["theme amber", { ...base("theme"), theme: "amber" }],
    ["foxhound", { module: "./commands/underconstruction.js" }],
    ["betatest", base("foxhound")],

    // Aliases
    ["guestbook", { alias: "atabook" }],
    ["load foxhound", { alias: "foxhound" }],
]);
