# Example Terraform root used to exercise the diagrams skill. Not applyable as-is.
terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
  backend "s3" {}
}

provider "aws" {
  region = var.region
}

variable "region" { default = "us-east-1" }

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  name    = "shop"
  cidr    = "10.0.0.0/16"
  azs     = ["us-east-1a", "us-east-1b"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24"]
}

resource "aws_security_group" "web" {
  vpc_id = module.vpc.vpc_id
}

resource "aws_lb" "web" {
  name               = "shop-web"
  load_balancer_type = "application"
  subnets            = module.vpc.public_subnets
  security_groups    = [aws_security_group.web.id]
}

resource "aws_lb_target_group" "web" {
  port     = 3000
  protocol = "HTTP"
  vpc_id   = module.vpc.vpc_id
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.web.arn
  port              = 443
  protocol          = "HTTPS"
  certificate_arn   = aws_acm_certificate.web.arn
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }
}

resource "aws_acm_certificate" "web" {
  domain_name = "shop.example.com"
}

resource "aws_ecs_cluster" "main" {
  name = "shop"
}

resource "aws_ecs_task_definition" "web" {
  family                   = "web"
  requires_compatibilities = ["FARGATE"]
  execution_role_arn       = aws_iam_role.task_exec.arn
  container_definitions = jsonencode([{
    name  = "web"
    image = "${aws_ecr_repository.web.repository_url}:latest"
    environment = [
      { name = "DATABASE_URL", value = "postgres://${aws_db_instance.main.address}:5432/shop" },
      { name = "REDIS_URL", value = aws_elasticache_replication_group.cache.primary_endpoint_address },
      { name = "ORDERS_QUEUE_URL", value = aws_sqs_queue.orders.url },
      { name = "ASSETS_BUCKET", value = aws_s3_bucket.assets.bucket },
    ]
    logConfiguration = { logDriver = "awslogs", options = { "awslogs-group" = aws_cloudwatch_log_group.web.name } }
  }])
}

resource "aws_ecs_service" "web" {
  name            = "web"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.web.arn
  launch_type     = "FARGATE"
  desired_count   = 2
  network_configuration {
    subnets = module.vpc.private_subnets
  }
  load_balancer {
    target_group_arn = aws_lb_target_group.web.arn
    container_name   = "web"
    container_port   = 3000
  }
}

resource "aws_ecr_repository" "web" {
  name = "shop/web"
}

resource "aws_iam_role" "task_exec" {
  name               = "shop-task-exec"
  assume_role_policy = "{}"
}

resource "aws_cloudwatch_log_group" "web" {
  name = "/ecs/shop/web"
}

resource "aws_db_subnet_group" "main" {
  subnet_ids = module.vpc.private_subnets
}

resource "aws_db_instance" "main" {
  identifier           = "shop"
  engine               = "postgres"
  instance_class       = "db.t4g.medium"
  db_subnet_group_name = aws_db_subnet_group.main.name
}

resource "aws_elasticache_replication_group" "cache" {
  replication_group_id = "shop-cache"
  engine               = "redis"
  subnet_group_name    = module.vpc.elasticache_subnet_group_name
}

resource "aws_sqs_queue" "orders_dlq" {
  name = "shop-orders-dlq"
}

resource "aws_sqs_queue" "orders" {
  name = "shop-orders"
  redrive_policy = jsonencode({ deadLetterTargetArn = aws_sqs_queue.orders_dlq.arn, maxReceiveCount = 5 })
}

resource "aws_lambda_function" "fulfil" {
  function_name = "shop-fulfil"
  role          = aws_iam_role.task_exec.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  environment {
    variables = { TABLE = aws_dynamodb_table.shipments.name }
  }
}

resource "aws_lambda_event_source_mapping" "orders" {
  event_source_arn = aws_sqs_queue.orders.arn
  function_name    = aws_lambda_function.fulfil.arn
}

resource "aws_dynamodb_table" "shipments" {
  name         = "shop-shipments"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"
  attribute { name = "id", type = "S" }
}

resource "aws_s3_bucket" "assets" {
  bucket = "shop-assets"
}

resource "aws_cloudfront_distribution" "cdn" {
  enabled = true
  origin {
    domain_name = aws_s3_bucket.assets.bucket_regional_domain_name
    origin_id   = "assets"
  }
  origin {
    domain_name = aws_lb.web.dns_name
    origin_id   = "web"
  }
}

resource "aws_route53_zone" "main" {
  name = "example.com"
}

resource "aws_route53_record" "shop" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "shop.example.com"
  type    = "A"
  alias {
    name    = aws_cloudfront_distribution.cdn.domain_name
    zone_id = aws_cloudfront_distribution.cdn.hosted_zone_id
  }
}
