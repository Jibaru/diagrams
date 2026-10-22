# Reading an SST v3 app

Mapping table: [`../data/sst.json`](../data/sst.json) (component → node id, clusters, hidden components). Resolve the node id to an import line with `find-node`.

## Where the architecture lives

1. `sst.config.ts` at the root: `app()` gives the app name and home provider; `run()` is the entry point. Many apps split into `infra/*.ts` files imported from `run()`; read every file `run()` reaches.
2. A root is one `sst.config.ts`. A monorepo with several configs has several roots.
3. The stage (`$app.stage`) is not a cluster: one diagram covers any stage unless branches on `$app.stage` create different resources.

## Nodes

- Every `new sst.<provider>.<Component>("Name", props)` is a node (or cluster) per the table. The label is the first argument, humanized (`OrdersApi` → `orders api`), with the component kind added only when the icon is ambiguous (`API (HTTP)`, `Worker: cron`).
- Frameworks (`Nextjs`, `Remix`, `Astro`, ...) are one node each. Their CloudFront, Lambda and S3 internals stay hidden.
- `handler: "packages/functions/src/x.handler"` and route handlers (`api.route("GET /orders", "src/orders.handler")`) each create a Lambda. Collapse many tiny routes into one Lambda node labelled with the service (`orders handlers`) when more than 6 routes point at the same package; keep them separate when they fan out to different data stores.
- `sst.Linkable` and `sst.Secret` are hidden, except a Linkable or secret that stands for an external SaaS (Stripe, OpenAI, Resend, Twilio): show it with a `saas/*` icon or `Custom`, on the right edge, with a dashed edge from whatever links it.

## Edges

- `link: [a, b]` on a Function/Site/Service: edge from that component to each linked resource. Label the edge only when the direction is surprising.
- Subscriptions: `queue.subscribe(fn)`, `topic.subscribe(fn)`, `bus.subscribe(fn, { pattern })`, `bucket.notify({ notifications: [...] })`, `table.subscribe(fn)`, `stream.subscribe(fn)`, `realtime.subscribe(fn)`: edge from the source to the subscriber, label with the event kind (`object created`, `stream`).
- `Cron({ job: fn })`: edge cron → fn, label the schedule.
- `Router` / `ApiGatewayV2` / `ApiGatewayWebSocket` routes: edge from the router or API to each target, label with the path prefix (`/api/*`) when there are several targets.
- `Service` with `loadBalancer`: ALB node in front; `link` and `environment` references behave as above.
- `Auth`/`CognitoUserPool`: edge from each site or API that references it, label `auth`.
- `Vpc` membership (`vpc` prop on Function, Service, Postgres, Redis, Efs, Cluster): places the node inside the VPC cluster. No edge.
- `dns` / `domain` props: hidden unless the request is about DNS.

## Entry point

Add a `Users` node (`onprem/client/Users`) on the left with an edge to each public-facing site, Router, API or ALB. Only one such node unless different audiences (admins, mobile app, partner webhooks) hit different entry points.
