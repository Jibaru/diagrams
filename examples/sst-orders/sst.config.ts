/// <reference path="./.sst/platform/config.d.ts" />
// Example SST v3 app used to exercise the diagrams skill. Not deployable as-is.

export default $config({
  app(input) {
    return { name: "orders", removal: input?.stage === "production" ? "retain" : "remove", home: "aws" };
  },
  async run() {
    const stripeKey = new sst.Secret("StripeSecretKey");

    const vpc = new sst.aws.Vpc("Vpc", { nat: "ec2" });

    const bucket = new sst.aws.Bucket("Invoices");
    const table = new sst.aws.Dynamo("Orders", {
      fields: { pk: "string", sk: "string" },
      primaryIndex: { hashKey: "pk", rangeKey: "sk" },
      stream: "new-and-old-images",
    });
    const db = new sst.aws.Postgres("Catalog", { vpc });
    const cache = new sst.aws.Redis("Cache", { vpc });

    const queue = new sst.aws.Queue("InvoiceJobs");
    const dlq = new sst.aws.Queue("InvoiceJobsDlq");
    const bus = new sst.aws.Bus("Events");

    const api = new sst.aws.ApiGatewayV2("Api", { vpc, link: [table, db, cache, queue, bus] });
    api.route("GET /orders", "packages/functions/src/orders.list");
    api.route("POST /orders", "packages/functions/src/orders.create");
    api.route("GET /orders/{id}", "packages/functions/src/orders.get");
    api.route("POST /webhooks/stripe", { handler: "packages/functions/src/stripe.webhook", link: [stripeKey] });

    queue.subscribe({ handler: "packages/functions/src/invoices.render", link: [bucket, table], vpc });
    bus.subscribe("OrderPlaced", { handler: "packages/functions/src/notify.email", link: [email] }, { pattern: { detailType: ["order.placed"] } });
    table.subscribe("OrdersStream", "packages/functions/src/search.index");

    const email = new sst.aws.Email("Email", { sender: "orders@example.com" });

    new sst.aws.Cron("NightlyReport", {
      schedule: "cron(0 2 * * ? *)",
      job: { handler: "packages/functions/src/reports.nightly", link: [db, bucket], vpc },
    });

    const web = new sst.aws.Nextjs("Web", { path: "packages/web", link: [api, bucket] });

    const cluster = new sst.aws.Cluster("Cluster", { vpc });
    new sst.aws.Service("Worker", {
      cluster,
      link: [db, cache, queue],
      image: { dockerfile: "packages/worker/Dockerfile" },
    });

    return { web: web.url, api: api.url };
  },
});
