/**
 * Catalog of every node factory exported by the installed diagrams-js,
 * read from its type declarations so aliases (S3, SQS, ELB, PostgreSQL, ...)
 * are included. diagrams-js's own `allResources` omits the 215 aliases.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export type Entry = { provider: string; category: string; name: string; alias: boolean; id: string };

const PROVIDERS_DIR = resolve(import.meta.dir, "..", "node_modules", "diagrams-js", "dist", "providers");

let cache: Entry[] | undefined;

export function catalog(): Entry[] {
  if (cache) return cache;
  const entries: Entry[] = [];
  for (const provider of readdirSync(PROVIDERS_DIR, { withFileTypes: true })) {
    if (!provider.isDirectory()) continue;
    const dir = join(PROVIDERS_DIR, provider.name);
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".d.ts") || file === "index.d.ts") continue;
      const category = file.slice(0, -".d.ts".length);
      const src = readFileSync(join(dir, file), "utf8");
      for (const m of src.matchAll(/export declare (function|const) ([A-Za-z0-9_]+)/g)) {
        entries.push({ provider: provider.name, category, name: m[2], alias: m[1] === "const", id: `${provider.name}/${category}/${m[2]}` });
      }
    }
  }
  cache = entries;
  return entries;
}

export function has(id: string): boolean {
  return catalog().some((e) => e.id === id);
}

export function importLine(e: Entry): string {
  return `import { ${e.name} } from "diagrams-js/${e.provider}/${e.category}";`;
}
