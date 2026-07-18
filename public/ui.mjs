//You know, I don't even remember what this was supposed to be used for. Leaving it in anyway, because fuck it.
function fly(event) {
	event.target.classList.toggle("fly");
}

export function handleClick(event) {
	if (event) {
		event.preventDefault();
	}
	let input = document.querySelector("[contenteditable='true']");
	if (input) {
		input.focus();
	}
}