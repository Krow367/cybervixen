import { type } from "../../io.js";

export default async function () {
	if (!localStorage.getItem("helpRepaired")) {
		await type("THE MACHINE OFFERS WHAT LITTLE HELP IT CAN... \nAvailable commands:\nhelp, clear, blog, recipes, about, atabook, links, balls:;X:^!$_\*~!>@#',~▒:|7(^*29-_&-&<\=;M(;░`.)J%!+▓{[QR%^=~,?$-=]/}+\nERROR: FILE CORRUPTED. UNABLE TO DISPLAY ALL COMMANDS\nPlease run 'repair' to fix corrupted file.");
	}
	else {
		await type("Available commands:\nhelp, clear, blog, recipes, about, atabook, links, balls",);
		await type("hard reset")
		await type(" ", { wait: 0, initialWait: 0, finalWait: 0 });
		await type("Thank you for playing! Unfortunately this is the end of the line for now.\ndon't worry, there'll be more in the near future!\nCheck back soon and enjoy exploring the rest of the site!\nUnless you run 'Hard Reset' all new commands and functions will appear here as I add them!")
	}
}