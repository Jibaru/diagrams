#!/usr/bin/env bun
/**
 * Search the diagrams-js icon catalog and print ready-to-paste import lines.
 *
 *   bun scripts/find-node.ts <keyword...> [--provider aws] [--limit 20]
 *   bun scripts/find-node.ts --providers            # list providers with counts
 *   bun scripts/find-node.ts --categories aws       # list categories of one provider
 *
 * Every keyword must match (case-insensitive) somewhere in "provider/category/Name".
 * Exact name matches rank first, then prefix matches, then substring matches.
 * Aliases (S3, SQS, PostgreSQL, ...) are included and marked.
 */
import { catalog, importLine, type Entry } from "./catalog";

const args = process.argv.slice(2);
const keywords: string[] = [];
let provider: string | undefined;
let limit = 20;
let listProviders = false;
let listCategories: string | undefined;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--provider" || a === "-p") provider = args[++i]?.toLowerCase();
  else if (a === "--limit" || a === "-n") limit = Number(args[++i]) || limit;
  else if (a === "--providers") listProviders = true;
  else if (a === "--categories") listCategories = args[++i]?.toLowerCase();
  else if (a === "--help" || a === "-h") {
    console.log(usage());
    process.exit(0);
  } else keywords.push(a.toLowerCase());
}

const all = catalog();

if (listProviders) {
  const counts = new Map<string, number>();
  for (const r of all) counts.set(r.provider, (counts.get(r.provider) ?? 0) + 1);
  for (const [p, n] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`${p.padEnd(14)} ${n}`);
  process.exit(0);
}

if (listCategories) {
  const counts = new Map<string, number>();
  for (const r of all) if (r.provider === listCategories) counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
  if (counts.size === 0) fail(`unknown provider "${listCategories}" (run --providers)`);
  for (const [t, n] of [...counts].sort()) console.log(`${listCategories}/${t.padEnd(16)} ${n}`);
  process.exit(0);
}

if (keywords.length === 0) fail(usage());

const scored = all
  .filter((r) => !provider || r.provider === provider)
  .map((r) => ({ r, score: score(r) }))
  .filter((x) => x.score > 0)
  .sort((a, b) => b.score - a.score || a.r.provider.localeCompare(b.r.provider) || a.r.name.localeCompare(b.r.name));

if (scored.length === 0) {
  console.log(`no match for "${keywords.join(" ")}"${provider ? ` in ${provider}` : ""}. Try fewer or shorter keywords, or --providers.`);
  process.exit(0);
}

for (const { r } of scored.slice(0, limit)) {
  console.log(`${(r.id + (r.alias ? " (alias)" : "")).padEnd(56)} ${importLine(r)}`);
}
if (scored.length > limit) console.log(`… ${scored.length - limit} more (raise --limit)`);

function score(r: Entry): number {
  const name = r.name.toLowerCase();
  const path = r.id.toLowerCase();
  const joined = keywords.join("");
  let total = 0;
  for (const k of keywords) {
    if (!path.includes(k)) return 0;
    if (name === k) total += 100;
    else if (name.startsWith(k)) total += 40;
    else if (name.includes(k)) total += 20;
    else total += 5; // matched provider/category only
  }
  if (name === joined) total += 100;
  else if (name.startsWith(joined)) total += 30;
  total -= name.length / 100; // shorter names first on ties
  return total;
}

function usage(): string {
  return `usage: find-node <keyword...> [--provider <p>] [--limit <n>] | --providers | --categories <p>`;
}

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}
