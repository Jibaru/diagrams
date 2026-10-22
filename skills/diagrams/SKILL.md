---
name: diagrams
description: Generate or update an architecture diagram (SVG, committed next to its diagrams-js script) from infrastructure source. Use when asked for an architecture or infra diagram of an SST v3 app, a Terraform root, or a system the user describes, or to refresh docs/architecture after infra changed.
---

# Architecture diagrams from source

You read the infrastructure code, decide what matters, and hand-write a `diagrams-js` script. No parser: your judgment about what belongs in the picture is the product. The skill directory is the base directory shown when this skill loaded; `<skill>` below means that path. Its scripts run under Bun and own their dependencies, so the target project gets no new packages.

Setup once per machine: if `<skill>/node_modules` is missing, run `bun install --cwd <skill>`.

## Steps

1. **Find the roots.** SST: every `sst.config.ts`. Terraform: every directory with `.tf` files holding a `terraform {}` or `provider {}` block that no other root calls as a module. Neither: the user's description is the root. One diagram per root, named after it. Done when you can list each root with its entry file and the user has not narrowed it to one.

2. **Build the inventory.** Load [`references/sst.md`](references/sst.md) or [`references/terraform.md`](references/terraform.md) for the root's kind and read every file the entry point reaches. Write the inventory down before any code: nodes (label, source construct), clusters (and what sits inside), edges (from, to, label), hidden items. Done when every resource in the root is either in the inventory or in the hidden list with the reason.

3. **Resolve icons.** Take the node id from the mapping table ([`data/sst.json`](data/sst.json), [`data/terraform.json`](data/terraform.json)); for anything else, search:
   ```
   bun <skill>/scripts/find-node.ts <keyword...> [--provider aws]
   ```
   It prints the import line to paste. Done when every node has an import line printed by `find-node`, none written from memory.

4. **Write the script** at `docs/architecture/<root>.diagram.ts` in the target project (or the path the user gave). Read [`references/api.md`](references/api.md) first; follow the house style below. Done when the file ends with `export default diagram;` and every inventory node, cluster and edge appears in it.

5. **Render.**
   ```
   bun <skill>/scripts/render.ts docs/architecture/<root>.diagram.ts --png
   ```
   It writes `<root>.svg` and `<root>.png` beside the script and prints node/edge/cluster counts. Done when the counts match the inventory and the command exits 0.

6. **Look at the PNG** with the Read tool and check, in order: flow runs left to right from the entry point; no node sits outside the cluster it belongs to; no orphan node unless it is intentionally standalone; no edge labels overlap nodes or each other; nothing from the hidden list leaked in; labels are readable at a glance. Fix the script and re-render for each failure, at most three rounds, then report what still looks off. Done when the checklist passes or three rounds are spent.

7. **Finish.** Delete the PNG unless the user asked for one (the SVG is the committed artifact). Report the written paths, the hidden items, and every assumption you made (collapsed routes, unexpanded modules, guessed engines).

## Updating an existing diagram

When `docs/architecture/<root>.diagram.ts` already exists: rebuild the inventory from the current source (step 2), diff it against the script, and edit the script in place so hand-made tweaks (labels, colors, ordering) survive. Then render and check (steps 5 to 7). Report what was added, removed and relabelled.

## House style

- `direction: "LR"`, `theme: "neutral"`, `curvestyle: "ortho"`. Users or the entry point on the left, data stores on the right. Switch to `curvestyle: "spline"` when more than five edges leave one cluster: ortho merges them into one trunk nobody can trace.
- Clusters for VPCs, ECS clusters, Terraform modules, Kubernetes namespaces, and SST `Cluster`s. A cluster with one node collapses into that node.
- Edge labels only for protocols, ports, event kinds, or a flow a reader would not guess. Dashed edges for async or optional paths, dead-letter queues, and external SaaS.
- Hidden by default: IAM, security groups, log groups, certificates, KMS, parameters, secrets, subnet groups, route tables. The user's request overrides any default.
- One overview per root. When the inventory exceeds about 15 nodes, keep the overview at subsystem granularity and add `docs/architecture/<root>-<subsystem>.diagram.ts` detail diagrams.
- External services (Stripe, OpenAI, Cloudflare, ...) sit on the far right with a `saas/*` icon or `Custom(label, url)`.
