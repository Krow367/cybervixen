let quotes = [
  "Somebody has to start. Somebody has to step forward and do what is right, because it is right. If nobody starts, then others cannot follow.",
  "People ought to think for themselves. The problem is, people only think for themselves if you tell them to.",
  "The one thing that you have that nobody else has is you. Your voice, your mind, your story, your vision.",
  "One must live by her own moral code, not follow like a sheep, blindly.",
];

let selection = Math.floor(Math.random() * quotes.length);
let output = quotes[selection];

export { output };

export default function () {
  window.open("https://neocities.org/site/cybervixen", "_blank");
}