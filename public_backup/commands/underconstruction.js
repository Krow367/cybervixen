import { type } from "../io.js";

export default async function () {
    if (localStorage.getItem("foxhoundstate")) {
        await type("Sorry! Foxclaw is under construction! It will appear in the list of help commands when it's ready!")
    } else {
        await type("Foxclaw access denied. Insufficient clearance.")
    }
}