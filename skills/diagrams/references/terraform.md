# Reading a Terraform root

Mapping table: [`../data/terraform.json`](../data/terraform.json) (resource type → node id, clusters, relationship-only resources, hidden prefixes). Resolve the node id to an import line with `find-node`.

## Where the architecture lives

1. A root is a directory containing `.tf` files with a `terraform {}` or `provider {}` block and no parent root calling it as a module. `environments/prod`, `envs/staging`, `stacks/*` style layouts have one root each; diagram each root (or the one the user names).
2. Follow every `module "x" { source = "..." }` into local sources (`./modules/...`). Registry or git modules (`terraform-aws-modules/vpc/aws`, `git::...`) are not expanded: render them as one node or cluster from their name (`module "vpc"` → VPC cluster, `module "rds"` → RDS node, `module "eks"` → EKS node) and say so in the notes.
3. `for_each` / `count` resources are one node labelled with the collection (`workers ×3`, `queues (each env)`), never one node per instance.
4. `locals`, `variables`, `outputs`, `data` sources, `backend` and `provider` blocks are plumbing: read them to resolve names and engines, never draw them. A `data` source that points at a resource managed elsewhere (`data "aws_vpc" "shared"`) becomes a cluster or node only when the diagram would be misleading without it.

## Nodes

- Every `resource "<type>" "<name>"` whose type is in the `nodes` table is a node. Label with the `name` tag or the `name` argument when readable, else the resource name. Humanize (`orders_api` → `orders api`).
- Engine-specific icons: read `engine` on `aws_db_instance`, `aws_elasticache_cluster`; `load_balancer_type` on `aws_lb`; `launch_type` / `capacity_provider_strategy` on `aws_ecs_service`; `protocol_type` on `aws_apigatewayv2_api`; `schedule_expression` on `aws_cloudwatch_event_rule`.
- Types matching a `hidden` prefix are omitted. Omit also any type absent from the table unless it clearly carries traffic or data, in which case pick an icon with `find-node` and add the row to the table.

## Clusters

- `aws_vpc` → cluster. Resources with `vpc_id`, `subnet_ids`, `vpc_config`, `network_configuration` or `db_subnet_group_name` resolving to it go inside.
- `aws_subnet` → sub-cluster only when public and private tiers separate things the reader cares about (ALB public, services and databases private). Skip subnet clusters when every resource would land in the same one.
- `aws_ecs_cluster`, `kubernetes_namespace` → cluster.
- Each `module "x"` block → cluster named after the module, nested inside the VPC cluster when its resources live there. Collapse a module cluster that would contain a single node into that node.

## Edges

Walk each resource's arguments for references:

- `<type>.<name>.<attr>` or `module.<x>.<output>` inside an argument is a candidate edge from the referencing resource to the referenced one. Keep it when the argument carries traffic or data: `function_name`, `target_arn`, `destination_arn`, `queue_url`, `topic_arn`, `event_source_arn`, `endpoint`, `uri`, `integration_uri`, `origin`, `domain_name`, `bucket`, `environment` variables holding an endpoint. Drop it when it is IAM (`role`, `policy_arn`), networking plumbing (`security_group_ids`, `subnet_id`), logging, tags or encryption (`kms_key_id`).
- Relationship-only resources (table `edges`) become edges, not nodes: `aws_lambda_event_source_mapping`, `aws_sns_topic_subscription`, `aws_s3_bucket_notification`, `aws_cloudwatch_event_target`, listener + target group + attachment chains, alias `aws_route53_record`, API Gateway integrations.
- Direction follows the flow of a request or event: caller → callee, producer → queue → consumer, bucket → notified function. A Lambda that reads a table: lambda → table.
- `depends_on` becomes an edge only when it expresses a runtime dependency that no attribute reference already covers.
- Label an edge only for a protocol, port, event kind, or non-obvious path (`poll`, `object created`, `:5432`). A cluster of unlabeled arrows beats a cluster of overlapping labels.

## Entry point

Add a `Users` node (`onprem/client/Users`) on the left with an edge to each internet-facing thing: CloudFront, ALB/NLB, API Gateway, public EC2, App Runner, Amplify. A `aws_route53_zone` goes between users and those targets only when custom domains are part of the story.
