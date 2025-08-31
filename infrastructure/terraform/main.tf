# ETERNYX Platform - Multi-Cloud Infrastructure
# Terraform configuration for hyper-scalable deployment

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    google = {
      source  = "hashicorp/google"
      version = "~> 4.0"
    }
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.0"
    }
  }
  
  backend "s3" {
    bucket         = "eternyx-terraform-state"
    key            = "platform/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "eternyx-terraform-locks"
  }
}

# Variables
variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}

variable "project_name" {
  description = "Project name"
  type        = string
  default     = "eternyx-platform"
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "gcp_region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "azure_location" {
  description = "Azure location"
  type        = string
  default     = "East US"
}

# AWS Provider Configuration
provider "aws" {
  region = var.aws_region
  
  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# Google Cloud Provider Configuration
provider "google" {
  project = "eternyx-platform"
  region  = var.gcp_region
}

# Azure Provider Configuration
provider "azurerm" {
  features {}
}

# AWS EKS Cluster
module "aws_eks" {
  source = "./modules/aws-eks"
  
  cluster_name    = "${var.project_name}-aws"
  cluster_version = "1.28"
  
  vpc_cidr = "10.0.0.0/16"
  
  node_groups = {
    general = {
      desired_capacity = 3
      max_capacity     = 20
      min_capacity     = 3
      instance_types   = ["m5.large", "m5.xlarge"]
      
      k8s_labels = {
        role = "general"
      }
    }
    
    gpu = {
      desired_capacity = 1
      max_capacity     = 10
      min_capacity     = 1
      instance_types   = ["p3.2xlarge", "p3.8xlarge"]
      
      k8s_labels = {
        role        = "gpu"
        accelerator = "nvidia-tesla-v100"
      }
      
      taints = {
        dedicated = {
          key    = "nvidia.com/gpu"
          value  = "true"
          effect = "NO_SCHEDULE"
        }
      }
    }
    
    memory_optimized = {
      desired_capacity = 2
      max_capacity     = 15
      min_capacity     = 2
      instance_types   = ["r5.large", "r5.xlarge"]
      
      k8s_labels = {
        role = "memory-optimized"
      }
    }
  }
  
  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

# Google GKE Cluster
module "gcp_gke" {
  source = "./modules/gcp-gke"
  
  cluster_name = "${var.project_name}-gcp"
  location     = var.gcp_region
  
  network_name    = "eternyx-vpc"
  subnet_name     = "eternyx-subnet"
  subnet_cidr     = "10.1.0.0/16"
  
  node_pools = {
    general = {
      node_count       = 3
      min_node_count   = 3
      max_node_count   = 20
      machine_type     = "e2-standard-4"
      disk_size_gb     = 100
      disk_type        = "pd-ssd"
      preemptible      = false
      
      labels = {
        role = "general"
      }
    }
    
    gpu = {
      node_count       = 1
      min_node_count   = 1
      max_node_count   = 10
      machine_type     = "n1-standard-4"
      disk_size_gb     = 200
      disk_type        = "pd-ssd"
      preemptible      = false
      
      guest_accelerator = {
        type  = "nvidia-tesla-v100"
        count = 1
      }
      
      labels = {
        role        = "gpu"
        accelerator = "nvidia-tesla-v100"
      }
      
      taints = [
        {
          key    = "nvidia.com/gpu"
          value  = "true"
          effect = "NO_SCHEDULE"
        }
      ]
    }
  }
}

# Azure AKS Cluster
module "azure_aks" {
  source = "./modules/azure-aks"
  
  cluster_name        = "${var.project_name}-azure"
  location            = var.azure_location
  resource_group_name = "${var.project_name}-rg"
  
  kubernetes_version = "1.28"
  
  default_node_pool = {
    name                = "general"
    node_count          = 3
    min_count           = 3
    max_count           = 20
    vm_size             = "Standard_D4s_v3"
    os_disk_size_gb     = 100
    os_disk_type        = "Premium_LRS"
    enable_auto_scaling = true
    
    node_labels = {
      role = "general"
    }
  }
  
  additional_node_pools = {
    gpu = {
      name                = "gpu"
      node_count          = 1
      min_count           = 1
      max_count           = 10
      vm_size             = "Standard_NC6s_v3"
      os_disk_size_gb     = 200
      os_disk_type        = "Premium_LRS"
      enable_auto_scaling = true
      
      node_labels = {
        role        = "gpu"
        accelerator = "nvidia-tesla-v100"
      }
      
      node_taints = [
        "nvidia.com/gpu=true:NoSchedule"
      ]
    }
  }
}

# Global Load Balancer (AWS CloudFront + Route 53)
resource "aws_cloudfront_distribution" "eternyx_cdn" {
  origin {
    domain_name = aws_lb.main.dns_name
    origin_id   = "eternyx-origin"
    
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }
  
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  
  aliases = ["eternyx.io", "www.eternyx.io", "app.eternyx.io"]
  
  default_cache_behavior {
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "eternyx-origin"
    compress               = true
    viewer_protocol_policy = "redirect-to-https"
    
    forwarded_values {
      query_string = true
      headers      = ["Authorization", "CloudFront-Forwarded-Proto"]
      
      cookies {
        forward = "all"
      }
    }
    
    min_ttl     = 0
    default_ttl = 3600
    max_ttl     = 86400
  }
  
  # API cache behavior
  ordered_cache_behavior {
    path_pattern           = "/api/*"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "eternyx-origin"
    compress               = true
    viewer_protocol_policy = "https-only"
    
    forwarded_values {
      query_string = true
      headers      = ["*"]
      
      cookies {
        forward = "all"
      }
    }
    
    min_ttl     = 0
    default_ttl = 0
    max_ttl     = 0
  }
  
  # Static assets cache behavior
  ordered_cache_behavior {
    path_pattern           = "/static/*"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "eternyx-origin"
    compress               = true
    viewer_protocol_policy = "https-only"
    
    forwarded_values {
      query_string = false
      
      cookies {
        forward = "none"
      }
    }
    
    min_ttl     = 86400
    default_ttl = 86400
    max_ttl     = 31536000
  }
  
  price_class = "PriceClass_All"
  
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
  
  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate.eternyx_cert.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
  
  web_acl_id = aws_wafv2_web_acl.eternyx_waf.arn
  
  tags = {
    Name        = "eternyx-cdn"
    Environment = var.environment
  }
}

# SSL Certificate
resource "aws_acm_certificate" "eternyx_cert" {
  domain_name               = "eternyx.io"
  subject_alternative_names = ["*.eternyx.io", "www.eternyx.io"]
  validation_method         = "DNS"
  
  lifecycle {
    create_before_destroy = true
  }
  
  tags = {
    Name = "eternyx-cert"
  }
}

# Route 53 DNS
resource "aws_route53_zone" "eternyx" {
  name = "eternyx.io"
  
  tags = {
    Name = "eternyx-zone"
  }
}

resource "aws_route53_record" "eternyx_a" {
  zone_id = aws_route53_zone.eternyx.zone_id
  name    = "eternyx.io"
  type    = "A"
  
  alias {
    name                   = aws_cloudfront_distribution.eternyx_cdn.domain_name
    zone_id                = aws_cloudfront_distribution.eternyx_cdn.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "eternyx_www" {
  zone_id = aws_route53_zone.eternyx.zone_id
  name    = "www.eternyx.io"
  type    = "A"
  
  alias {
    name                   = aws_cloudfront_distribution.eternyx_cdn.domain_name
    zone_id                = aws_cloudfront_distribution.eternyx_cdn.hosted_zone_id
    evaluate_target_health = false
  }
}

# WAF for DDoS protection and security
resource "aws_wafv2_web_acl" "eternyx_waf" {
  name  = "eternyx-waf"
  scope = "CLOUDFRONT"
  
  default_action {
    allow {}
  }
  
  # Rate limiting rule
  rule {
    name     = "RateLimitRule"
    priority = 1
    
    action {
      block {}
    }
    
    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }
    
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                 = "RateLimitRule"
      sampled_requests_enabled    = true
    }
  }
  
  # AWS Managed Rules
  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 2
    
    override_action {
      none {}
    }
    
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }
    
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                 = "CommonRuleSetMetric"
      sampled_requests_enabled    = true
    }
  }
  
  # SQL Injection protection
  rule {
    name     = "AWSManagedRulesSQLiRuleSet"
    priority = 3
    
    override_action {
      none {}
    }
    
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesSQLiRuleSet"
        vendor_name = "AWS"
      }
    }
    
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                 = "SQLiRuleSetMetric"
      sampled_requests_enabled    = true
    }
  }
  
  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                 = "eternyxWAF"
    sampled_requests_enabled    = true
  }
  
  tags = {
    Name = "eternyx-waf"
  }
}

# Application Load Balancer
resource "aws_lb" "main" {
  name               = "eternyx-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = module.aws_eks.public_subnet_ids
  
  enable_deletion_protection = true
  enable_http2               = true
  
  access_logs {
    bucket  = aws_s3_bucket.alb_logs.bucket
    prefix  = "alb-logs"
    enabled = true
  }
  
  tags = {
    Name = "eternyx-alb"
  }
}

# Redis Cluster for Caching
resource "aws_elasticache_replication_group" "eternyx_redis" {
  replication_group_id         = "eternyx-redis"
  description                  = "Redis cluster for ETERNYX platform"
  
  node_type                    = "cache.r6g.large"
  port                         = 6379
  parameter_group_name         = "default.redis7"
  
  num_cache_clusters           = 3
  automatic_failover_enabled   = true
  multi_az_enabled            = true
  
  subnet_group_name           = aws_elasticache_subnet_group.eternyx.name
  security_group_ids          = [aws_security_group.redis.id]
  
  at_rest_encryption_enabled  = true
  transit_encryption_enabled  = true
  auth_token                  = random_password.redis_auth.result
  
  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis.name
    destination_type = "cloudwatch-logs"
    log_format       = "text"
    log_type         = "slow-log"
  }
  
  tags = {
    Name = "eternyx-redis"
  }
}

# Elasticsearch for Threat Intelligence
resource "aws_elasticsearch_domain" "eternyx_es" {
  domain_name           = "eternyx-threat-intel"
  elasticsearch_version = "7.10"
  
  cluster_config {
    instance_type            = "r6g.large.elasticsearch"
    instance_count           = 3
    dedicated_master_enabled = true
    master_instance_type     = "r6g.medium.elasticsearch"
    master_instance_count    = 3
    zone_awareness_enabled   = true
    
    zone_awareness_config {
      availability_zone_count = 3
    }
  }
  
  ebs_options {
    ebs_enabled = true
    volume_type = "gp3"
    volume_size = 100
    throughput  = 250
    iops        = 3000
  }
  
  encrypt_at_rest {
    enabled = true
  }
  
  node_to_node_encryption {
    enabled = true
  }
  
  domain_endpoint_options {
    enforce_https       = true
    tls_security_policy = "Policy-Min-TLS-1-2-2019-07"
  }
  
  vpc_options {
    subnet_ids         = module.aws_eks.private_subnet_ids
    security_group_ids = [aws_security_group.elasticsearch.id]
  }
  
  access_policies = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "es:*"
        Principal = "*"
        Effect = "Allow"
        Resource = "arn:aws:es:${var.aws_region}:*:domain/eternyx-threat-intel/*"
      }
    ]
  })
  
  tags = {
    Name = "eternyx-elasticsearch"
  }
}

# Monitoring and Observability
resource "aws_cloudwatch_log_group" "eternyx_logs" {
  name              = "/aws/eternyx/platform"
  retention_in_days = 30
  
  tags = {
    Name = "eternyx-logs"
  }
}

# S3 Buckets for Storage
resource "aws_s3_bucket" "eternyx_storage" {
  bucket = "eternyx-platform-storage-${random_id.bucket_suffix.hex}"
  
  tags = {
    Name = "eternyx-storage"
  }
}

resource "aws_s3_bucket_versioning" "eternyx_storage" {
  bucket = aws_s3_bucket.eternyx_storage.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_encryption" "eternyx_storage" {
  bucket = aws_s3_bucket.eternyx_storage.id
  
  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        sse_algorithm = "AES256"
      }
    }
  }
}

# Random resources
resource "random_id" "bucket_suffix" {
  byte_length = 4
}

resource "random_password" "redis_auth" {
  length  = 32
  special = true
}

# Outputs
output "aws_eks_cluster_endpoint" {
  value = module.aws_eks.cluster_endpoint
}

output "gcp_gke_cluster_endpoint" {
  value = module.gcp_gke.cluster_endpoint
}

output "azure_aks_cluster_endpoint" {
  value = module.azure_aks.cluster_endpoint
}

output "cloudfront_distribution_domain" {
  value = aws_cloudfront_distribution.eternyx_cdn.domain_name
}

output "redis_endpoint" {
  value = aws_elasticache_replication_group.eternyx_redis.primary_endpoint_address
}

output "elasticsearch_endpoint" {
  value = aws_elasticsearch_domain.eternyx_es.endpoint
}

