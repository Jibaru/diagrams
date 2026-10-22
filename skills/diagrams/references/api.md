# diagrams-js 0.8.0 cheat-sheet

Verified against the pinned version. Everything is a factory function (no `new`).

```ts
import { Diagram, Edge, Node, Custom } from "diagrams-js";
import { Lambda, Fargate } from "diagrams-js/aws/compute";      // one subpath per provider/category
import { Dynamodb } from "diagrams-js/aws/database";
import { S3 } from "diagrams-js/aws/storage";                   // aliases (S3, SQS, SNS, ALB, ELB, PostgreSQL, ...) are exports too
import { Users } from "diagrams-js/onprem/client";

const diagram = Diagram("Orders service", {
  direction: "LR",          // TB | BT | LR | RL
  theme: "neutral",         // neutral | pastel | blues | greens | orange   (library default is pastel)
  curvestyle: "ortho",      // ortho | curved | spline | polyline            (library default is ortho)
  graphAttr: { fontsize: "18" },   // any Graphviz graph/node/edge attrs, values as strings
});

// nodes: register with diagram.add() or cluster.add() BEFORE connecting them
const users = diagram.add(Users("Users"));
const vpc = diagram.cluster("VPC prod");                 // clusters nest: vpc.cluster("private")
const api = vpc.add(Lambda("orders-api"));
const table = vpc.add(Dynamodb("orders"));
const bucket = diagram.add(S3("invoices"));

// edges: edge options go FIRST, target second; arrays fan out / fan in
users.to(api);                                           // forward arrow, chainable: a.to(b).to(c)
api.to(Edge({ label: "put" }), table);                   // labelled
api.to(Edge({ style: "dashed", color: "#888" }), bucket);
bucket.from(api);                                        // arrow drawn api -> bucket (dir=back)
api.with(table);                                         // undirected line
api.to([table, bucket]);                                 // fan-out; [a, b] fan-in via target.from([a, b])
api.to(Edge({ forward: true, reverse: true, label: "sync" }), bucket);  // bidirectional

// plain or custom nodes when no icon fits
const ext = diagram.add(Node("Partner API", { shape: "box", style: "rounded,filled", fillcolor: "#eee" }));
const stripe = diagram.add(Custom("Stripe", "https://api.iconify.design/logos/stripe.svg")); // URL, local path or data: URL

export default diagram;   // required by the render helper
```

Labels accept `\n` for a second line (`Lambda("orders-api\nnode 20")`). Pass `{ nodeId: "orders" }` as the second argument of any factory for a stable id.

## Pitfalls

- `Error: Node is not registered with a diagram` means a node was connected before `add()`.
- `Iconify(...)` returns broken images (the icon CDN URL format changed). Use `Custom(label, url)` with a full URL instead.
- `autolabel: true` labels every provider node "Node". Leave it off.
- Resource names follow the Python library: `Dynamodb`, `SimpleQueueServiceSqs` (alias `SQS`), `ElasticContainerService` (alias `ECS`), `APIGateway`. Resolve names with `find-node`, never from memory.
- Same name exists in several providers (`APIGateway` in aws/network, aws/mobile, gcp/api, oci/devops). Always import from the provider you mean.
- Edge labels sit on the edge midpoint; on dense diagrams prefer fewer labels over `xlabel`.
- Two clusters may share a label; nodes may not share a `nodeId`.
