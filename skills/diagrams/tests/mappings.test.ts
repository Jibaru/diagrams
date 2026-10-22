import { describe, expect, test } from "bun:test";
import { catalog, has } from "../scripts/catalog";
import sst from "../data/sst.json";
import terraform from "../data/terraform.json";

type Table = { nodes: Record<string, { node: string; note?: string }> };

const NODE_ID = /\b([a-z0-9]+\/[a-z0-9]+\/[A-Za-z0-9_]+)\b/g;

function check(name: string, table: Table) {
  describe(name, () => {
    for (const [key, row] of Object.entries(table.nodes)) {
      test(`${key} -> ${row.node}`, () => {
        expect(has(row.node)).toBe(true);
        // node ids mentioned inside notes must exist too
        for (const m of (row.note ?? "").matchAll(NODE_ID)) expect(has(m[1])).toBe(true);
      });
    }
  });
}

test("catalog reads the installed diagrams-js and includes aliases", () => {
  const all = catalog();
  expect(all.length).toBeGreaterThan(2500);
  expect(all.some((e) => e.id === "aws/storage/S3" && e.alias)).toBe(true);
  expect(all.some((e) => e.id === "aws/compute/Lambda" && !e.alias)).toBe(true);
});

check("sst.json", sst as Table);
check("terraform.json", terraform as Table);
