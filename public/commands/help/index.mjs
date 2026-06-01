import { type } from "../../io.js";

export default async function () {
	if (!localStorage.getItem("helpRepaired")) {
		await type("THE MACHINE OFFERS WHAT LITTLE HELP IT CAN... \nAvailable commands:\nhelp, clear, blog, recipes, about, atabook, links, balls:;X:^!$_\*~!>@#',~▒:|7(^*29-_&-&<\=;M(;░`.)J%!+▓{[QR%^=~,?$-=]/}+\nERROR: FILE CORRUPTED. UNABLE TO DISPLAY ALL COMMANDS\nPlease run 'repair' to fix corrupted file.");
	}
	else {
		const artText = document.getElementById("art-source").textContent.trim();
		await type("Available commands:\nhelp, clear, blog, recipes, about, atabook, links, hard reset, balls",);
		await type(" ", { wait: 0, initialWait: 0, finalWait: 0 });
		const typers = document.querySelectorAll(".typer");
		const lastTyper = typers[typers.length - 1];
		const artPre = document.createElement("pre");
		artPre.textContent = artText;
		artPre.style.fontFamily = '"Hack", monospace';
		artPre.style.fontSize = '1rem';
		artPre.style.lineHeight = '1.2';
		artPre.style.textTransform = 'none';
		artPre.style.margin = '0';
		artPre.style.whiteSpace = 'pre';
		lastTyper.appendChild(artPre);
		await type("Thank you for playing! Unfortunately this is the end of the line for now.\ndon't worry, there'll be more in the ner future!\nCheck back soon and enjoy exploring the rest of the site!\nUnless you run 'Hard Reset' all new commands and functions will appear here as I add them!")
	}
}