import { type } from "../../io.js";

async function printAsciiArt(path) {
    const html = await fetch(path).then(r => r.text());

    const tmp = document.createElement("div");
    tmp.innerHTML = html;

    const source = tmp.querySelector("#art-source");
    const art = source ? source.textContent : html;

    const terminal = document.querySelector(".terminal");
    const pre = document.createElement("pre");
    pre.className = "ascii-art";
    pre.textContent = art;

    terminal.appendChild(pre);
    terminal.scrollTop = terminal.scrollHeight;
}

export default async function () {
    if (!localStorage.getItem("helpRepaired")) {
        await type("THE MACHINE OFFERS WHAT LITTLE HELP IT CAN... \nAvailable commands:\nhelp, clear, blog, recipes, about, atabook, links, follow, chat, balls:;̷͓͆X̴͓͒:̷̲̋^̶̱̒!̶̛͉$̶͎̈_̵̪͑\̷̻͝*̴̠̓~̴̝̚!̵̢̐>̷̗̈́@̶͖̉#̶̫̈́'̶̣̐,̴̱̔~̵̀ͅ▒̷̬̅:̶̢̽|̵͉̈́7̵̡̚(̶͎̿^̵̳̿*̵̢̅2̶̤̈́9̸͓͐-̷̘͛_̴̯̈&̷̥̿-̸̣̓&̷̧̿<̴̗͆\nERROR: FILE CORRUPTED. UNABLE TO DISPLAY ALL COMMANDS\nPlease run 'repair' to fix corrupted file.");
    } else if (!localStorage.getItem("foxhoundState")) {
        await type("Available commands:\nhelp, clear, blog, recipes, about, atabook, links, chat, balls");
        await type("hard reset, theme [amber/green], follow, load [program]");

        await printAsciiArt("./commands/repair/repair.html");
    } else {
                await type("Available commands:\nhelp, clear, blog, recipes, about, atabook, links, chat, balls");
        await type("hard reset, theme [amber/green], follow, load [program]");

        await printAsciiArt("./commands/repair/repair.html");

        await type("Thanks for playing! You've reached the end of my current live content. Please check back later for the release of foxclaw!\nIt'll appear in the help command here when it's live.");
    }
}