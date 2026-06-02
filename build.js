import * as esbuild from "esbuild";
import { copyFileSync, mkdirSync } from "fs";

await esbuild.build({
    entryPoints: ["public/screen.js"],
    bundle: false,
    minify: true,
    outdir: "build/",
});