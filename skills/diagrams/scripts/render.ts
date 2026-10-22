#!/usr/bin/env bun
/**
 * Render a diagrams-js diagram file to SVG (and optionally PNG) without
 * installing diagrams-js into the target project.
 *
 *   bun scripts/render.ts <diagram.ts|diagram.js|diagram.json> [--out <file.svg>] [--png] [--scale 2]
 *
 * Contract for .ts/.js files: `export default diagram` (a named export of a
 * Diagram also works). JSON files use the diagrams-js DiagramJSON shape.
 * Prints a one-line summary (nodes/edges/clusters) and the written paths.
 *
 * How the diagram file finds "diagrams-js": a Bun onLoad plugin rewrites every
 * `from "diagrams-js..."` specifier in files outside node_modules to the absolute
 * path of this skill's installed copy, so the target project needs nothing.
 */
import { plugin } from "bun";
import { basename, dirname, extname, join, resolve } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const SKILL_DIR = resolve(import.meta.dir, "..");

plugin({
  name: "resolve-diagrams-js-from-skill",
  setup(build) {
    build.onLoad({ filter: /^(?!.*\/node_modules\/).*\.(ts|mts|js|mjs)$/ }, async (args) => {
      const contents = await Bun.file(args.path).text();
      const rewritten = contents.replace(/(from\s*|import\s*\(\s*)(["'])(diagrams-js(?:\/[^"']*)?)\2/g, (_m, pre, q, spec) => `${pre}${q}${Bun.resolveSync(spec, SKILL_DIR)}${q}`);
      return { contents: rewritten, loader: args.path.endsWith("ts") ? "ts" : "js" };
    });
  },
});
const USAGE = "usage: render <diagram.ts|.js|.json> [--out <file.svg>] [--png] [--scale <n>]";

const args = process.argv.slice(2);
let input: string | undefined;
let out: string | undefined;
let png = false;
let scale = 2;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--out" || a === "-o") out = args[++i];
  else if (a === "--png") png = true;
  else if (a === "--scale") scale = Number(args[++i]) || scale;
  else if (a === "--help" || a === "-h") {
    console.log(USAGE);
    process.exit(0);
  } else if (!input) input = a;
  else fail(`unexpected argument: ${a}`);
}
if (!input) fail(USAGE);

const inputPath = resolve(input);
const ext = extname(inputPath).toLowerCase();
const svgPath = resolve(out ?? join(dirname(inputPath), `${basename(inputPath, ext).replace(/\.diagram$/, "")}.svg`));
const pngPath = `${svgPath.replace(/\.svg$/i, "")}.png`;

if (png) await import("sharp"); // preload so its native binding resolves from this directory
const { Diagram } = await import("diagrams-js");
const diagram = ext === ".json" ? await Diagram.fromJSON(JSON.parse(await readFile(inputPath, "utf8"))) : await loadModule(inputPath);

const json = diagram.toJSON() as { nodes?: unknown[]; edges?: unknown[]; clusters?: unknown[] };
await mkdir(dirname(svgPath), { recursive: true });
await writeFile(svgPath, (await diagram.render({ format: "svg" })) as string);
console.log(`nodes=${json.nodes?.length ?? 0} edges=${json.edges?.length ?? 0} clusters=${countClusters(json.clusters ?? [])}`);
console.log(`svg: ${svgPath}`);
if (png) {
  await writeFile(pngPath, (await diagram.render({ format: "png", scale })) as Uint8Array);
  console.log(`png: ${pngPath}`);
}

async function loadModule(path: string) {
  const mod = (await import(path)) as Record<string, unknown>;
  const candidates = [mod.default, ...Object.values(mod)];
  const found = candidates.find(
    (v) => v && typeof (v as { render?: unknown }).render === "function" && typeof (v as { toJSON?: unknown }).toJSON === "function",
  );
  if (!found) fail(`${path} exports no Diagram. End the file with: export default diagram;`);
  return found as InstanceType<typeof Diagram>;
}

function countClusters(list: unknown[]): number {
  let n = 0;
  for (const c of list as { clusters?: unknown[] }[]) n += 1 + countClusters(c.clusters ?? []);
  return n;
}

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}
