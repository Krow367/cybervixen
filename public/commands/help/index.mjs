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
        await type("THE MACHINE OFFERS WHAT LITTLE HELP IT CAN... \nAvailable commands:\nhelp, clear, blog, recipes, about, atabook, links, follow, balls:;̷͓͆X̴͓͒:̷̲̋^̶̱̒!̶̛͉$̶͎̈_̵̪͑\̷̻͝*̴̠̓~̴̝̚!̵̢̐>̷̗̈́@̶͖̉#̶̫̈́'̶̣̐,̴̱̔~̵̀ͅ▒̷̬̅:̶̢̽|̵͉̈́7̵̡̚(̶͎̿^̵̳̿*̵̢̅2̶̤̈́9̸͓͐-̷̘͛_̴̯̈&̷̥̿-̸̣̓&̷̧̿<̴̗͆\nERROR: FILE CORRUPTED. UNABLE TO DISPLAY ALL COMMANDS\nPlease run 'repair' to fix corrupted file.");
    } else {
        await type("Available commands:\nhelp, clear, blog, recipes, about, atabook, links, balls");
        await type("hard reset, theme [amber/green], follow");

        await printAsciiArt("./commands/repair/repair.html");

        await type(
            "Thank you for playing! Unfortunately this is the end of the line for now.\ndon't worry, there'll be more in the near future!\nCheck back soon and enjoy exploring the rest of the site!\nUnless you run 'Hard Reset' all new commands and functions will appear here as I add them!"
        );
    }
}