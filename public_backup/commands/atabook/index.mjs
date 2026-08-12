let quotes = [
  "Signed in blood....",
];

let selection = Math.floor(Math.random() * quotes.length);
let output = quotes[selection];

export { output };

export default function () {
  window.open("https://cybervixen.atabook.org", "_blank");
}