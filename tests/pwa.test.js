import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const root = new URL("../", import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), "utf8");

test("el service worker solo lista archivos que existen", () => {
  const worker = read("sw.js");
  const core = JSON.parse(`[${/const CORE = \[([\s\S]*?)\];/.exec(worker)[1].replace(/,\s*$/, "")}]`);
  const missing = core.filter((path) => path !== "./" && !fs.existsSync(new URL(path, root)));
  assert.deepEqual(missing, []);
});

test("todos los módulos JS están en el service worker", () => {
  const worker = read("sw.js");
  const modules = fs.readdirSync(new URL("js/", root), { recursive: true })
    .filter((file) => file.endsWith(".js") && !file.startsWith("diagnostico"))
    .map((file) => `./js/${file}`);
  assert.deepEqual(modules.filter((file) => !worker.includes(`"${file}"`)), []);
});

test("el manifiesto es instalable", () => {
  const manifest = JSON.parse(read("manifest.webmanifest"));
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"));
  assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable"));
  for (const icon of manifest.icons) assert.ok(fs.existsSync(new URL(icon.src, root)), icon.src);
  assert.match(read("index.html"), /rel="manifest"/);
});
