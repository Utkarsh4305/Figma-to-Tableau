// Builds the Figma plugin UI as a SINGLE self-contained dist/index.html with a
// classic (non-module) inline <script> at the end of <body>. This is the only
// shape that reliably runs in Figma desktop, whose dev plugin UI iframe is a
// `file:` origin: inline ES modules are blocked there, and the script must run
// after #root exists. esbuild emits a classic IIFE (no import/export, no
// import.meta), which we inline directly — no module rewriting, no fragile
// string surgery.
import { build } from "esbuild";
import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const result = await build({
  entryPoints: [resolve(root, "src/ui/main.tsx")],
  bundle: true,
  format: "iife",
  target: "es2017",
  jsx: "automatic",
  minify: true,
  write: false,
  define: {
    "process.env.NODE_ENV": '"production"',
    "import.meta.env.DEV": "false",
    "import.meta.env.PROD": "true",
  },
  loader: { ".css": "css", ".svg": "dataurl", ".png": "dataurl" },
  outdir: resolve(root, "dist"),
  logLevel: "info",
});

let js = "";
let css = "";
for (const f of result.outputFiles) {
  if (f.path.endsWith(".js")) js = f.text;
  else if (f.path.endsWith(".css")) css = f.text;
}

// Safe to inline: `</script>` only ever appears inside JS string/regex literals,
// and `<\/script>` is the identical value — this just stops the HTML parser from
// closing the tag early.
js = js.replace(/<\/script>/g, "<\\/script>");
css = css.replace(/<\/style>/g, "<\\/style>");

const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Figma to Tableau</title>
    <style>${css}</style>
  </head>
  <body>
    <div id="root"><div style="padding:16px;font:12px/1.5 system-ui;color:#6b6b6b">Loading Figma to Tableau…</div></div>
    <script>${js}</script>
  </body>
</html>
`;

mkdirSync(resolve(root, "dist"), { recursive: true });
writeFileSync(resolve(root, "dist/index.html"), html, "utf8");
console.log(`dist/index.html written (${html.length} bytes; js ${js.length}, css ${css.length})`);
