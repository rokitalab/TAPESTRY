# TAPESTRY AWS CLI Workflow

This workflow creates public networking, an internet-facing ALB, HTTPS listeners with ACM, and ECS service attachment.

## 0) Set variables

Create a local config from the safe example, then fill in the real environment values locally. Do not commit the local JSON file.

```bash
cp docs/aws_setup.example.json docs/aws_setup.local.json
```

Load the config into shell variables.

```bash
export AWS_SETUP_CONFIG=docs/aws_setup.local.json

export AWS_PROFILE=$(jq -r '.awsProfile' "$AWS_SETUP_CONFIG")
export AWS_REGION=$(jq -r '.awsRegion' "$AWS_SETUP_CONFIG")
export AWS_PAGER=""
export VPC_ID=$(jq -r '.vpcId' "$AWS_SETUP_CONFIG")
export IGW_ID=$(jq -r '.internetGatewayId' "$AWS_SETUP_CONFIG")

export APP_NAME=$(jq -r '.appName' "$AWS_SETUP_CONFIG")
export ALB_NAME=$(jq -r '.albName' "$AWS_SETUP_CONFIG")
export FRONTEND_TG_NAME=$(jq -r '.frontendTargetGroupName' "$AWS_SETUP_CONFIG")
export API_TG_NAME=$(jq -r '.apiTargetGroupName' "$AWS_SETUP_CONFIG")

# ECS cluster and service names for TAPESTRY
export ECS_CLUSTER_NAME=$(jq -r '.ecsClusterName' "$AWS_SETUP_CONFIG")
export ECS_FRONTEND_SERVICE_NAME=$(jq -r '.ecsFrontendServiceName' "$AWS_SETUP_CONFIG")
export ECS_API_SERVICE_NAME=$(jq -r '.ecsApiServiceName' "$AWS_SETUP_CONFIG")

# ACM certificate ARN for the public domain
export ACM_CERT_ARN=$(jq -r '.acmCertArn' "$AWS_SETUP_CONFIG")
export CUSTOM_DOMAIN=$(jq -r '.customDomain' "$AWS_SETUP_CONFIG")
export DNS_RECORD_NAME=$(jq -r '.dnsRecordName' "$AWS_SETUP_CONFIG")

# ECS task/container ports
export CONTAINER_NAME=$(jq -r '.containerName' "$AWS_SETUP_CONFIG")
export CONTAINER_PORT=$(jq -r '.containerPort' "$AWS_SETUP_CONFIG")
export API_CONTAINER_NAME=$(jq -r '.apiContainerName' "$AWS_SETUP_CONFIG")
export API_CONTAINER_PORT=$(jq -r '.apiContainerPort' "$AWS_SETUP_CONFIG")

# Existing private subnets for ECS services
export PRIVATE_SUBNET_A_ID=$(jq -r '.privateSubnetAId' "$AWS_SETUP_CONFIG")
export PRIVATE_SUBNET_B_ID=$(jq -r '.privateSubnetBId' "$AWS_SETUP_CONFIG")

# Existing or previously created ALB, target group, and security group outputs
export ALB_SG_ID=$(jq -r '.albSecurityGroupId' "$AWS_SETUP_CONFIG")
export FRONTEND_TG_ARN=$(jq -r '.frontendTargetGroupArn' "$AWS_SETUP_CONFIG")
export API_TG_ARN=$(jq -r '.apiTargetGroupArn' "$AWS_SETUP_CONFIG")
export ALB_ARN=$(jq -r '.albArn' "$AWS_SETUP_CONFIG")
export ALB_DNS=$(jq -r '.albDns' "$AWS_SETUP_CONFIG")
export HTTPS_LISTENER_ARN=$(jq -r '.httpsListenerArn' "$AWS_SETUP_CONFIG")
export HTTP_LISTENER_ARN=$(jq -r '.httpListenerArn' "$AWS_SETUP_CONFIG")

# Security group IDs for ECS services and database access
export FRONTEND_TASK_SG_ID=$(jq -r '.frontendTaskSecurityGroupId' "$AWS_SETUP_CONFIG")
export API_TASK_SG_ID=$(jq -r '.apiTaskSecurityGroupId' "$AWS_SETUP_CONFIG")
export RDS_SG_ID=$(jq -r '.rdsSecurityGroupId' "$AWS_SETUP_CONFIG")
export VPCE_SG_ID=$(jq -r '.vpcEndpointSecurityGroupId' "$AWS_SETUP_CONFIG")
export BUILD_HOST_SG_ID=$(jq -r '.buildHostSecurityGroupId' "$AWS_SETUP_CONFIG")

# Resource names used by reusable create-or-lookup steps
export VPCE_SG_NAME=$(jq -r '.vpcEndpointSecurityGroupName' "$AWS_SETUP_CONFIG")
export ALB_SG_NAME=$(jq -r '.albSecurityGroupName' "$AWS_SETUP_CONFIG")
export FRONTEND_TASK_SG_NAME=$(jq -r '.frontendTaskSecurityGroupName' "$AWS_SETUP_CONFIG")
export API_TASK_SG_NAME=$(jq -r '.apiTaskSecurityGroupName' "$AWS_SETUP_CONFIG")

# Task definition names and ECR images
export FRONTEND_TASK_DEF_FAMILY=$(jq -r '.frontendTaskDefFamily' "$AWS_SETUP_CONFIG")
export API_TASK_DEF_FAMILY=$(jq -r '.apiTaskDefFamily' "$AWS_SETUP_CONFIG")
export FRONTEND_IMAGE_URI=$(jq -r '.frontendImageUri' "$AWS_SETUP_CONFIG")
export API_IMAGE_URI=$(jq -r '.apiImageUri' "$AWS_SETUP_CONFIG")
export ECR_REPO_FRONTEND=$(jq -r '.frontendEcrRepo' "$AWS_SETUP_CONFIG")
export FRONTEND_IMAGE_TAG=$(jq -r '.frontendImageTag' "$AWS_SETUP_CONFIG")
export ECR_REPO_API=$(jq -r '.apiEcrRepo' "$AWS_SETUP_CONFIG")
export API_IMAGE_TAG=$(jq -r '.apiImageTag' "$AWS_SETUP_CONFIG")

# IAM roles for ECS task execution
export ECS_EXECUTION_ROLE_ARN=$(jq -r '.ecsExecutionRoleArn' "$AWS_SETUP_CONFIG")

# Fargate sizing
export FRONTEND_CPU=$(jq -r '.frontendCpu' "$AWS_SETUP_CONFIG")
export FRONTEND_MEMORY=$(jq -r '.frontendMemory' "$AWS_SETUP_CONFIG")
export API_CPU=$(jq -r '.apiCpu' "$AWS_SETUP_CONFIG")
export API_MEMORY=$(jq -r '.apiMemory' "$AWS_SETUP_CONFIG")

# Public subnet setup
export PUBLIC_VPC_CIDR_BLOCK=$(jq -r '.publicVpcCidrBlock' "$AWS_SETUP_CONFIG")
export PUBLIC_SUBNET_A_CIDR_BLOCK=$(jq -r '.publicSubnetACidrBlock' "$AWS_SETUP_CONFIG")
export PUBLIC_SUBNET_B_CIDR_BLOCK=$(jq -r '.publicSubnetBCidrBlock' "$AWS_SETUP_CONFIG")
export PUBLIC_SUBNET_A_NAME=$(jq -r '.publicSubnetAName' "$AWS_SETUP_CONFIG")
export PUBLIC_SUBNET_B_NAME=$(jq -r '.publicSubnetBName' "$AWS_SETUP_CONFIG")
export PUBLIC_ROUTE_TABLE_NAME=$(jq -r '.publicRouteTableName' "$AWS_SETUP_CONFIG")
```

## 0a) Shell safety and preflight checks

Run once per shell before executing the workflow:

If you open a new terminal tab/session, rerun section 0 exports first.

```bash
set -euo pipefail

require_vars() {
  for var_name in "$@"; do
    if [[ -z "${!var_name:-}" ]]; then
      echo "Missing required variable: $var_name" >&2
      return 1
    fi
  done
}

# Base networking + ALB prereqs
require_vars AWS_PROFILE AWS_REGION VPC_ID IGW_ID ACM_CERT_ARN

# Rerun before section 4 and later (after section 2 sets SUBNET_A_ID/SUBNET_B_ID)
# require_vars SUBNET_A_ID SUBNET_B_ID

# ECS prereqs (fill these later, then rerun this line before section 6/6a)
# require_vars PRIVATE_SUBNET_A_ID PRIVATE_SUBNET_B_ID FRONTEND_TASK_SG_ID API_TASK_SG_ID RDS_SG_ID FRONTEND_IMAGE_URI API_IMAGE_URI ECS_EXECUTION_ROLE_ARN
```

## 0b) Idempotent lookup helpers

Use these helpers if you want to rerun the workflow without recreating resources:

```bash
get_sg_id_by_name() {
  local group_name="$1"
  aws ec2 describe-security-groups \
    --region "$AWS_REGION" \
    --filters "Name=vpc-id,Values=$VPC_ID" "Name=group-name,Values=$group_name" \
    --query 'SecurityGroups[0].GroupId' --output text
}

get_tg_arn_by_name() {
  aws elbv2 describe-target-groups \
    --region "$AWS_REGION" \
    --names "$1" \
    --query 'TargetGroups[0].TargetGroupArn' --output text
}

get_alb_arn_by_name() {
  aws elbv2 describe-load-balancers \
    --region "$AWS_REGION" \
    --names "$1" \
    --query 'LoadBalancers[0].LoadBalancerArn' --output text
}

get_listener_arn_by_port() {
  local lb_arn="$1"
  local port="$2"
  aws elbv2 describe-listeners \
    --region "$AWS_REGION" \
    --load-balancer-arn "$lb_arn" \
    --query "Listeners[?Port==\`$port\`].ListenerArn | [0]" \
    --output text
}

ensure_ecs_cluster() {
  if aws ecs describe-clusters --region "$AWS_REGION" --clusters "$ECS_CLUSTER_NAME" --query 'clusters[0].status' --output text 2>/dev/null | grep -q ACTIVE; then
    echo "Using existing ECS cluster: $ECS_CLUSTER_NAME"
    aws ecs update-cluster-settings \
      --region "$AWS_REGION" \
      --cluster "$ECS_CLUSTER_NAME" \
      --settings name=containerInsights,value=enabled >/dev/null
  else
    aws ecs create-cluster \
      --region "$AWS_REGION" \
      --cluster-name "$ECS_CLUSTER_NAME" \
      --settings name=containerInsights,value=enabled >/dev/null
    echo "Created ECS cluster: $ECS_CLUSTER_NAME"
  fi
}

ecs_service_exists() {
  local service_name="$1"
  aws ecs describe-services \
    --region "$AWS_REGION" \
    --cluster "$ECS_CLUSTER_NAME" \
    --services "$service_name" \
    --query 'services[0].status' \
    --output text 2>/dev/null | grep -q ACTIVE
}
```

## 1) Add secondary VPC CIDR block for public subnets

```bash
aws ec2 associate-vpc-cidr-block \
  --region "$AWS_REGION" \
  --vpc-id "$VPC_ID" \
  --cidr-block "$PUBLIC_VPC_CIDR_BLOCK"
```

Check association state:

```bash
aws ec2 describe-vpcs \
  --region "$AWS_REGION" \
  --vpc-ids "$VPC_ID" \
  --query 'Vpcs[0].CidrBlockAssociationSet[*].[CidrBlock,State.State]' \
  --output table
```

## 2) Create two public subnets in different AZs

```bash
SUBNET_A_ID=$(aws ec2 create-subnet \
  --region "$AWS_REGION" \
  --vpc-id "$VPC_ID" \
  --cidr-block "$PUBLIC_SUBNET_A_CIDR_BLOCK" \
  --availability-zone ${AWS_REGION}a \
  --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=$PUBLIC_SUBNET_A_NAME}]" \
  --query 'Subnet.SubnetId' --output text)

echo "$SUBNET_A_ID"

SUBNET_B_ID=$(aws ec2 create-subnet \
  --region "$AWS_REGION" \
  --vpc-id "$VPC_ID" \
  --cidr-block "$PUBLIC_SUBNET_B_CIDR_BLOCK" \
  --availability-zone ${AWS_REGION}b \
  --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=$PUBLIC_SUBNET_B_NAME}]" \
  --query 'Subnet.SubnetId' --output text)

echo "$SUBNET_B_ID"
```

Before section 4, confirm subnet IDs are available:

```bash
require_vars SUBNET_A_ID SUBNET_B_ID
```

## 3) Create public route table and associate both subnets

```bash
PUBLIC_RTB_ID=$(aws ec2 create-route-table \
  --region "$AWS_REGION" \
  --vpc-id "$VPC_ID" \
  --tag-specifications "ResourceType=route-table,Tags=[{Key=Name,Value=$PUBLIC_ROUTE_TABLE_NAME}]" \
  --query 'RouteTable.RouteTableId' --output text)

echo "$PUBLIC_RTB_ID"

aws ec2 create-route \
  --region "$AWS_REGION" \
  --route-table-id "$PUBLIC_RTB_ID" \
  --destination-cidr-block 0.0.0.0/0 \
  --gateway-id "$IGW_ID"

aws ec2 associate-route-table --region "$AWS_REGION" --route-table-id "$PUBLIC_RTB_ID" --subnet-id "$SUBNET_A_ID"
aws ec2 associate-route-table --region "$AWS_REGION" --route-table-id "$PUBLIC_RTB_ID" --subnet-id "$SUBNET_B_ID"
```

Verify route target is IGW (not TGW):

```bash
aws ec2 describe-route-tables \
  --region "$AWS_REGION" \
  --route-table-ids "$PUBLIC_RTB_ID" \
  --query 'RouteTables[0].Routes[*].[DestinationCidrBlock,GatewayId,TransitGatewayId]' \
  --output table
```

## 3a) Create VPC endpoints for private ECS tasks

These endpoints let the private ECS tasks pull images, publish logs, and read Secrets Manager values without a NAT gateway.

Create or reuse a security group for the interface endpoints:
```bash
VPCE_SG_ID=$(get_sg_id_by_name "$VPCE_SG_NAME")
if [[ "$VPCE_SG_ID" == "None" || -z "$VPCE_SG_ID" ]]; then
  VPCE_SG_ID=$(aws ec2 create-security-group \
    --region "$AWS_REGION" \
    --group-name "$VPCE_SG_NAME" \
    --description 'VPC endpoints for TAPESTRY private ECS tasks' \
    --vpc-id "$VPC_ID" \
    --query 'GroupId' --output text)
fi

echo "$VPCE_SG_ID"

# Allow HTTPS from the ECS task security groups into the interface endpoints.
aws ec2 authorize-security-group-ingress \
  --region "$AWS_REGION" \
  --group-id "$VPCE_SG_ID" \
  --protocol tcp \
  --port 443 \
  --source-group "$FRONTEND_TASK_SG_ID" || true
aws ec2 authorize-security-group-ingress \
  --region "$AWS_REGION" \
  --group-id "$VPCE_SG_ID" \
  --protocol tcp \
  --port 443 \
  --source-group "$API_TASK_SG_ID" || true

# Required if you build/push Docker images from a private EC2 host (no NAT):
# allow that instance security group to reach the interface endpoints on 443.
aws ec2 authorize-security-group-ingress \
  --region "$AWS_REGION" \
  --group-id "$VPCE_SG_ID" \
  --protocol tcp \
  --port 443 \
  --source-group "$BUILD_HOST_SG_ID" || true

create_interface_endpoint() {
  local service_name="$1"
  local existing
  existing=$(aws ec2 describe-vpc-endpoints \
    --region "$AWS_REGION" \
    --filters Name=vpc-id,Values="$VPC_ID" Name=service-name,Values="$service_name" \
    --query 'length(VpcEndpoints)' --output text)
  if [[ "$existing" != "0" ]]; then
    echo "PRESENT $service_name"
    return 0
  fi

  echo "CREATING $service_name"
  aws ec2 create-vpc-endpoint \
    --region "$AWS_REGION" \
    --vpc-id "$VPC_ID" \
    --vpc-endpoint-type Interface \
    --service-name "$service_name" \
    --subnet-ids "$PRIVATE_SUBNET_A_ID" "$PRIVATE_SUBNET_B_ID" \
    --security-group-ids "$VPCE_SG_ID" \
    --private-dns-enabled \
    --query 'VpcEndpoint.{Id:VpcEndpointId,State:State,Service:ServiceName}' \
    --output table
}

create_interface_endpoint "com.amazonaws.${AWS_REGION}.secretsmanager"
create_interface_endpoint "com.amazonaws.${AWS_REGION}.ecr.api"
create_interface_endpoint "com.amazonaws.${AWS_REGION}.ecr.dkr"
create_interface_endpoint "com.amazonaws.${AWS_REGION}.logs"

PRIVATE_RTB_ID=$(aws ec2 describe-route-tables \
  --region "$AWS_REGION" \
  --filters Name=association.subnet-id,Values="$PRIVATE_SUBNET_A_ID" \
  --query 'RouteTables[0].RouteTableId' --output text)
if [[ "$PRIVATE_RTB_ID" == "None" || -z "$PRIVATE_RTB_ID" ]]; then
  PRIVATE_RTB_ID=$(aws ec2 describe-route-tables \
    --region "$AWS_REGION" \
    --filters Name=vpc-id,Values="$VPC_ID" Name=association.main,Values=true \
    --query 'RouteTables[0].RouteTableId' --output text)
fi

S3_EXISTS=$(aws ec2 describe-vpc-endpoints \
  --region "$AWS_REGION" \
  --filters Name=vpc-id,Values="$VPC_ID" Name=service-name,Values="com.amazonaws.${AWS_REGION}.s3" \
  --query 'length(VpcEndpoints)' --output text)
if [[ "$S3_EXISTS" == "0" ]]; then
  aws ec2 create-vpc-endpoint \
    --region "$AWS_REGION" \
    --vpc-id "$VPC_ID" \
    --vpc-endpoint-type Gateway \
    --service-name "com.amazonaws.${AWS_REGION}.s3" \
    --route-table-ids "$PRIVATE_RTB_ID" \
    --query 'VpcEndpoint.{Id:VpcEndpointId,State:State,Service:ServiceName,RouteTables:RouteTableIds}' \
    --output table
else
  echo "PRESENT com.amazonaws.${AWS_REGION}.s3"
fi

aws ec2 describe-vpc-endpoints \
  --region "$AWS_REGION" \
  --filters Name=vpc-id,Values="$VPC_ID" \
            Name=service-name,Values="com.amazonaws.${AWS_REGION}.secretsmanager","com.amazonaws.${AWS_REGION}.ecr.api","com.amazonaws.${AWS_REGION}.ecr.dkr","com.amazonaws.${AWS_REGION}.logs","com.amazonaws.${AWS_REGION}.s3" \
  --query 'VpcEndpoints[*].[ServiceName,VpcEndpointType,VpcEndpointId,State]' \
  --output table
```

## 4) Create ALB, security groups, and target groups

This section is written to be rerunnable and to set up both frontend and API routing behind one ALB.

### 4a) Create ALB and ECS task security groups (RDS security group already exists: rds-postgres-analyst-sg)

Create or reuse ALB security group:
```bash
ALB_SG_ID=$(get_sg_id_by_name "$ALB_SG_NAME")
if [[ "$ALB_SG_ID" == "None" || -z "$ALB_SG_ID" ]]; then
  ALB_SG_ID=$(aws ec2 create-security-group \
    --region "$AWS_REGION" \
    --group-name "$ALB_SG_NAME" \
    --description 'ALB SG for TAPESTRY' \
    --vpc-id "$VPC_ID" \
    --query 'GroupId' --output text)
fi

echo "$ALB_SG_ID"

aws ec2 authorize-security-group-ingress --region "$AWS_REGION" --group-id "$ALB_SG_ID" --protocol tcp --port 80 --cidr 0.0.0.0/0 || true
aws ec2 authorize-security-group-ingress --region "$AWS_REGION" --group-id "$ALB_SG_ID" --protocol tcp --port 443 --cidr 0.0.0.0/0 || true
```

Create frontend and API task security groups:

```bash
FRONTEND_TASK_SG_ID=$(get_sg_id_by_name "$FRONTEND_TASK_SG_NAME")
if [[ "$FRONTEND_TASK_SG_ID" == "None" || -z "$FRONTEND_TASK_SG_ID" ]]; then
  FRONTEND_TASK_SG_ID=$(aws ec2 create-security-group \
    --region "$AWS_REGION" \
    --group-name "$FRONTEND_TASK_SG_NAME" \
    --description 'Frontend ECS task SG for TAPESTRY' \
    --vpc-id "$VPC_ID" \
    --query 'GroupId' --output text)
fi

echo "$FRONTEND_TASK_SG_ID"

API_TASK_SG_ID=$(get_sg_id_by_name "$API_TASK_SG_NAME")
if [[ "$API_TASK_SG_ID" == "None" || -z "$API_TASK_SG_ID" ]]; then
  API_TASK_SG_ID=$(aws ec2 create-security-group \
    --region "$AWS_REGION" \
    --group-name "$API_TASK_SG_NAME" \
    --description 'API ECS task SG for TAPESTRY' \
    --vpc-id "$VPC_ID" \
    --query 'GroupId' --output text)
fi

echo "$API_TASK_SG_ID"
```

Add least-privilege SG rules:

```bash
# ALB -> Frontend
aws ec2 authorize-security-group-ingress \
  --region "$AWS_REGION" \
  --group-id "$FRONTEND_TASK_SG_ID" \
  --protocol tcp \
  --port "$CONTAINER_PORT" \
  --source-group "$ALB_SG_ID" || true

# ALB -> API (required for /tapestry-api/* routing and API target health checks)
aws ec2 authorize-security-group-ingress \
  --region "$AWS_REGION" \
  --group-id "$API_TASK_SG_ID" \
  --protocol tcp \
  --port "$API_CONTAINER_PORT" \
  --source-group "$ALB_SG_ID" || true

# API -> RDS (optional, only if API connects to DB)
aws ec2 authorize-security-group-ingress \
  --region "$AWS_REGION" \
  --group-id "$RDS_SG_ID" \
  --protocol tcp \
  --port 5432 \
  --source-group "$API_TASK_SG_ID" || true
```

### 4b) Create frontend and API target groups

Create or reuse frontend target group:

```bash
FRONTEND_TG_ARN=$(get_tg_arn_by_name "$FRONTEND_TG_NAME")
if [[ "$FRONTEND_TG_ARN" == "None" || -z "$FRONTEND_TG_ARN" ]]; then
  FRONTEND_TG_ARN=$(aws elbv2 create-target-group \
    --region "$AWS_REGION" \
    --name "$FRONTEND_TG_NAME" \
    --protocol HTTP \
    --port 80 \
    --target-type ip \
    --vpc-id "$VPC_ID" \
    --health-check-protocol HTTP \
    --health-check-path / \
    --query 'TargetGroups[0].TargetGroupArn' --output text)
fi

echo "$FRONTEND_TG_ARN"
```

Create or reuse API target group (for /tapestry-api/*):

```bash
API_TG_ARN=$(get_tg_arn_by_name "$API_TG_NAME")
if [[ "$API_TG_ARN" == "None" || -z "$API_TG_ARN" ]]; then
  API_TG_ARN=$(aws elbv2 create-target-group \
    --region "$AWS_REGION" \
    --name "$API_TG_NAME" \
    --protocol HTTP \
    --port "$API_CONTAINER_PORT" \
    --target-type ip \
    --vpc-id "$VPC_ID" \
    --health-check-protocol HTTP \
    --health-check-path /tapestry-api/status/ \
    --query 'TargetGroups[0].TargetGroupArn' --output text)
fi

echo "$API_TG_ARN"
```

### 4c) Create or reuse a public ALB

```bash
ALB_ARN=$(get_alb_arn_by_name "$ALB_NAME")
if [[ "$ALB_ARN" == "None" || -z "$ALB_ARN" ]]; then
  ALB_ARN=$(aws elbv2 create-load-balancer \
    --region "$AWS_REGION" \
    --name "$ALB_NAME" \
    --type application \
    --scheme internet-facing \
    --security-groups "$ALB_SG_ID" \
    --subnets "$SUBNET_A_ID" "$SUBNET_B_ID" \
    --query 'LoadBalancers[0].LoadBalancerArn' --output text)
fi

echo "$ALB_ARN"

ALB_DNS=$(aws elbv2 describe-load-balancers \
  --region "$AWS_REGION" \
  --load-balancer-arns "$ALB_ARN" \
  --query 'LoadBalancers[0].DNSName' --output text)

echo "$ALB_DNS"

# Wait until ALB is active before creating listeners
aws elbv2 wait load-balancer-available \
  --region "$AWS_REGION" \
  --load-balancer-arns "$ALB_ARN"
```

**Section 4 completed successfully:**
```
ALB_SG_ID=$ALB_SG_ID
FRONTEND_TG_ARN=$FRONTEND_TG_ARN
API_TG_ARN=$API_TG_ARN
ALB_ARN=$ALB_ARN
ALB_DNS=$ALB_DNS
```

## 5) Configure listeners and API path rule

**Section 5 completed successfully:**
```
HTTPS_LISTENER_ARN=$HTTPS_LISTENER_ARN
HTTP_LISTENER_ARN=$HTTP_LISTENER_ARN
```

### 5a) Ensure HTTPS listener exists (default -> frontend target group)

```bash
HTTPS_LISTENER_ARN=$(get_listener_arn_by_port "$ALB_ARN" 443)
if [[ "$HTTPS_LISTENER_ARN" == "None" || -z "$HTTPS_LISTENER_ARN" ]]; then
  HTTPS_LISTENER_ARN=$(aws elbv2 create-listener \
    --region "$AWS_REGION" \
    --load-balancer-arn "$ALB_ARN" \
    --protocol HTTPS \
    --port 443 \
    --certificates CertificateArn="$ACM_CERT_ARN" \
    --ssl-policy ELBSecurityPolicy-TLS13-1-2-Res-2021-06 \
    --default-actions Type=forward,TargetGroupArn="$FRONTEND_TG_ARN" \
    --query 'Listeners[0].ListenerArn' --output text)
fi

echo "$HTTPS_LISTENER_ARN"
```

### 5b) Ensure HTTP listener exists (redirect 80 -> 443)

```bash
HTTP_LISTENER_ARN=$(get_listener_arn_by_port "$ALB_ARN" 80)
if [[ "$HTTP_LISTENER_ARN" == "None" || -z "$HTTP_LISTENER_ARN" ]]; then
  HTTP_LISTENER_ARN=$(aws elbv2 create-listener \
    --region "$AWS_REGION" \
    --load-balancer-arn "$ALB_ARN" \
    --protocol HTTP \
    --port 80 \
    --default-actions Type=redirect,RedirectConfig='{Protocol=HTTPS,Port="443",StatusCode=HTTP_301}' \
    --query 'Listeners[0].ListenerArn' --output text)
fi

echo "$HTTP_LISTENER_ARN"
```

### 5c) Add HTTPS path-based rule for API

Keep frontend as default action, and send API paths to the API target group.

```bash
EXISTING_API_RULE_ARN=$(aws elbv2 describe-rules \
  --region "$AWS_REGION" \
  --listener-arn "$HTTPS_LISTENER_ARN" \
  --query "Rules[?contains(join(',', Conditions[].Values), '/tapestry-api/*')].RuleArn | [0]" \
  --output text)

if [[ "$EXISTING_API_RULE_ARN" == "None" || -z "$EXISTING_API_RULE_ARN" ]]; then
  aws elbv2 create-rule \
    --region "$AWS_REGION" \
    --listener-arn "$HTTPS_LISTENER_ARN" \
    --priority 100 \
    --conditions Field=path-pattern,Values='/tapestry-api/*' \
    --actions Type=forward,TargetGroupArn="$API_TG_ARN"
fi
```

Validate listener behavior:

```bash
aws elbv2 describe-rules \
  --region "$AWS_REGION" \
  --listener-arn "$HTTPS_LISTENER_ARN" \
  --query 'Rules[*].{Priority:Priority,Conditions:Conditions,TargetGroupArn:Actions[0].TargetGroupArn}' \
  --output table
```

## 6) Create ECS cluster, build and push images to ECR, register task definitions, and create or update services

### 6a) Create ECS cluster

```bash
# Create the ECS cluster for TAPESTRY
ensure_ecs_cluster
```

### 6b) Build and push images to ECR

#### 6b.1) Build and push frontend image to ECR

Create or reuse the frontend ECR repository, then build and push with a short tag:

```bash
# ECR_REPO_FRONTEND and FRONTEND_IMAGE_TAG are loaded in section 0.
ACCOUNT_ID=$(aws sts get-caller-identity --query 'Account' --output text)
ECR_REGISTRY=${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com

aws ecr describe-repositories \
  --region "$AWS_REGION" \
  --repository-names "$ECR_REPO_FRONTEND" >/dev/null 2>&1 || \
aws ecr create-repository \
  --region "$AWS_REGION" \
  --repository-name "$ECR_REPO_FRONTEND"

aws ecr get-login-password --region "$AWS_REGION" | \
docker login --username AWS --password-stdin "$ECR_REGISTRY"

cd /home/ubuntu/TAPESTRY
docker build -t ${ECR_REPO_FRONTEND}:${FRONTEND_IMAGE_TAG} .
docker tag ${ECR_REPO_FRONTEND}:${FRONTEND_IMAGE_TAG} ${ECR_REGISTRY}/${ECR_REPO_FRONTEND}:${FRONTEND_IMAGE_TAG}
docker push ${ECR_REGISTRY}/${ECR_REPO_FRONTEND}:${FRONTEND_IMAGE_TAG}

export FRONTEND_IMAGE_URI=${ECR_REGISTRY}/${ECR_REPO_FRONTEND}:${FRONTEND_IMAGE_TAG}
echo "$FRONTEND_IMAGE_URI"
```

#### 6b.2) Build and push API image to ECR

Create or reuse the API ECR repository, then build and push with a short tag:

```bash
# ECR_REPO_API and API_IMAGE_TAG are loaded in section 0.
ACCOUNT_ID=$(aws sts get-caller-identity --query 'Account' --output text)
ECR_REGISTRY=${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com

aws ecr describe-repositories \
  --region "$AWS_REGION" \
  --repository-names "$ECR_REPO_API" >/dev/null 2>&1 || \
aws ecr create-repository \
  --region "$AWS_REGION" \
  --repository-name "$ECR_REPO_API"

aws ecr get-login-password --region "$AWS_REGION" | \
docker login --username AWS --password-stdin "$ECR_REGISTRY"

cd /home/ubuntu/TAPESTRY-API
docker build -t ${ECR_REPO_API}:${API_IMAGE_TAG} .
docker tag ${ECR_REPO_API}:${API_IMAGE_TAG} ${ECR_REGISTRY}/${ECR_REPO_API}:${API_IMAGE_TAG}
docker push ${ECR_REGISTRY}/${ECR_REPO_API}:${API_IMAGE_TAG}

export API_IMAGE_URI=${ECR_REGISTRY}/${ECR_REPO_API}:${API_IMAGE_TAG}
echo "$API_IMAGE_URI"
```

### 6c) Register ECS task definition (frontend)

```bash
aws ecs register-task-definition \
  --region "$AWS_REGION" \
  --family "$FRONTEND_TASK_DEF_FAMILY" \
  --requires-compatibilities FARGATE \
  --network-mode awsvpc \
  --cpu "$FRONTEND_CPU" \
  --memory "$FRONTEND_MEMORY" \
  --execution-role-arn "$ECS_EXECUTION_ROLE_ARN" \
  --container-definitions "[{\"name\":\"$CONTAINER_NAME\",\"image\":\"$FRONTEND_IMAGE_URI\",\"essential\":true,\"portMappings\":[{\"containerPort\":$CONTAINER_PORT,\"protocol\":\"tcp\"}],\"logConfiguration\":{\"logDriver\":\"awslogs\",\"options\":{\"awslogs-group\":\"/ecs/$FRONTEND_TASK_DEF_FAMILY\",\"awslogs-region\":\"$AWS_REGION\",\"awslogs-stream-prefix\":\"ecs\"}}}]"
```

Create CloudWatch log groups (one-time):

```bash
aws logs create-log-group --region "$AWS_REGION" --log-group-name "/ecs/$FRONTEND_TASK_DEF_FAMILY" || true
aws logs create-log-group --region "$AWS_REGION" --log-group-name "/ecs/$API_TASK_DEF_FAMILY" || true
```

### 6d) Register API task definition with DB env + secret mappings

Use this as the primary API task-definition creation process when `AWS-ECSTaskExecutionRole` already has permission to read the RDS-managed secret.

```bash
set +H

export DB_HOST=$(jq -r '.dbHost' "$AWS_SETUP_CONFIG")
export DB_PORT=$(jq -r '.dbPort' "$AWS_SETUP_CONFIG")
export DB_NAME=$(jq -r '.dbName' "$AWS_SETUP_CONFIG")
export SECRET_ARN=$(jq -r '.secretArn' "$AWS_SETUP_CONFIG")

API_TASK_DEF_ARN=$(aws --no-cli-pager ecs register-task-definition \
  --region "$AWS_REGION" \
  --family "$API_TASK_DEF_FAMILY" \
  --requires-compatibilities FARGATE \
  --network-mode awsvpc \
  --cpu "$API_CPU" \
  --memory "$API_MEMORY" \
  --execution-role-arn "$ECS_EXECUTION_ROLE_ARN" \
  --container-definitions "[{\"name\":\"$API_CONTAINER_NAME\",\"image\":\"$API_IMAGE_URI\",\"essential\":true,\"portMappings\":[{\"containerPort\":$API_CONTAINER_PORT,\"protocol\":\"tcp\"}],\"environment\":[{\"name\":\"DB_HOST\",\"value\":\"$DB_HOST\"},{\"name\":\"DB_PORT\",\"value\":\"$DB_PORT\"},{\"name\":\"DB_NAME\",\"value\":\"$DB_NAME\"}],\"secrets\":[{\"name\":\"DB_USER\",\"valueFrom\":\"$SECRET_ARN:username::\"},{\"name\":\"DB_PASSWORD\",\"valueFrom\":\"$SECRET_ARN:password::\"}],\"logConfiguration\":{\"logDriver\":\"awslogs\",\"options\":{\"awslogs-group\":\"/ecs/$API_TASK_DEF_FAMILY\",\"awslogs-region\":\"$AWS_REGION\",\"awslogs-stream-prefix\":\"ecs\"}}}]" \
  --query 'taskDefinition.taskDefinitionArn' \
  --output text)

echo "Registered: $API_TASK_DEF_ARN"
```

**Important:** Keep `DB_HOST`, `DB_PORT`, and `DB_NAME` aligned with your target database instance.

### 6e) Create or update ECS services

```bash
# After you push images to ECR and register task definitions,
# create the frontend service in existing private subnets and attach ALB.
if ecs_service_exists "$ECS_FRONTEND_SERVICE_NAME"; then
  aws ecs update-service \
    --region "$AWS_REGION" \
    --cluster "$ECS_CLUSTER_NAME" \
    --service "$ECS_FRONTEND_SERVICE_NAME" \
    --task-definition "$FRONTEND_TASK_DEF_FAMILY" \
    --force-new-deployment
else
  aws ecs create-service \
    --region "$AWS_REGION" \
    --cluster "$ECS_CLUSTER_NAME" \
    --service-name "$ECS_FRONTEND_SERVICE_NAME" \
    --task-definition "$FRONTEND_TASK_DEF_FAMILY" \
    --launch-type FARGATE \
    --desired-count 2 \
    --network-configuration "awsvpcConfiguration={subnets=[$PRIVATE_SUBNET_A_ID,$PRIVATE_SUBNET_B_ID],securityGroups=[$FRONTEND_TASK_SG_ID],assignPublicIp=DISABLED}" \
    --load-balancers targetGroupArn="$FRONTEND_TG_ARN",containerName="$CONTAINER_NAME",containerPort="$CONTAINER_PORT" \
    --health-check-grace-period-seconds 60
fi

# Create API service in the same private subnets and attach API target group.
if ecs_service_exists "$ECS_API_SERVICE_NAME"; then
  aws ecs update-service \
    --region "$AWS_REGION" \
    --cluster "$ECS_CLUSTER_NAME" \
    --service "$ECS_API_SERVICE_NAME" \
    --task-definition "$API_TASK_DEF_FAMILY" \
    --load-balancers targetGroupArn="$API_TG_ARN",containerName="$API_CONTAINER_NAME",containerPort="$API_CONTAINER_PORT" \
    --force-new-deployment
else
  aws ecs create-service \
    --region "$AWS_REGION" \
    --cluster "$ECS_CLUSTER_NAME" \
    --service-name "$ECS_API_SERVICE_NAME" \
    --task-definition "$API_TASK_DEF_FAMILY" \
    --launch-type FARGATE \
    --desired-count 2 \
    --network-configuration "awsvpcConfiguration={subnets=[$PRIVATE_SUBNET_A_ID,$PRIVATE_SUBNET_B_ID],securityGroups=[$API_TASK_SG_ID],assignPublicIp=DISABLED}" \
    --load-balancers targetGroupArn="$API_TG_ARN",containerName="$API_CONTAINER_NAME",containerPort="$API_CONTAINER_PORT"
fi

# Wait for services to stabilize before health checks
aws ecs wait services-stable \
  --region "$AWS_REGION" \
  --cluster "$ECS_CLUSTER_NAME" \
  --services "$ECS_FRONTEND_SERVICE_NAME" "$ECS_API_SERVICE_NAME"
```

Check ECS service events and target health:

```bash
aws ecs describe-services \
  --region "$AWS_REGION" \
  --cluster "$ECS_CLUSTER_NAME" \
  --services "$ECS_FRONTEND_SERVICE_NAME" "$ECS_API_SERVICE_NAME" \
  --query 'services[*].[serviceName,status,desiredCount,runningCount,pendingCount,events[0].message]' \
  --output table

aws elbv2 describe-target-health \
  --region "$AWS_REGION" \
  --target-group-arn "$FRONTEND_TG_ARN" \
  --query 'TargetHealthDescriptions[*].[Target.Id,Target.Port,TargetHealth.State,TargetHealth.Reason]' \
  --output table
```


### 6f) Production ECS service autoscaling

Production ECS Service Auto Scaling is configured through Application Auto Scaling after service creation. Keep at least two production tasks per service for basic availability, then allow autoscaling to raise task count during CPU pressure.

Register scalable targets.

```bash
aws application-autoscaling register-scalable-target \
  --region "$AWS_REGION" \
  --service-namespace ecs \
  --resource-id "service/$ECS_CLUSTER_NAME/$ECS_FRONTEND_SERVICE_NAME" \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 2 \
  --max-capacity 4

aws application-autoscaling register-scalable-target \
  --region "$AWS_REGION" \
  --service-namespace ecs \
  --resource-id "service/$ECS_CLUSTER_NAME/$ECS_API_SERVICE_NAME" \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 2 \
  --max-capacity 6
```

Create CPU target-tracking policies.

```bash
aws application-autoscaling put-scaling-policy \
  --region "$AWS_REGION" \
  --service-namespace ecs \
  --resource-id "service/$ECS_CLUSTER_NAME/$ECS_FRONTEND_SERVICE_NAME" \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-name tapestry-frontend-cpu-target \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{"TargetValue":65.0,"PredefinedMetricSpecification":{"PredefinedMetricType":"ECSServiceAverageCPUUtilization"},"ScaleOutCooldown":60,"ScaleInCooldown":300}'

aws application-autoscaling put-scaling-policy \
  --region "$AWS_REGION" \
  --service-namespace ecs \
  --resource-id "service/$ECS_CLUSTER_NAME/$ECS_API_SERVICE_NAME" \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-name tapestry-api-cpu-target \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{"TargetValue":60.0,"PredefinedMetricSpecification":{"PredefinedMetricType":"ECSServiceAverageCPUUtilization"},"ScaleOutCooldown":60,"ScaleInCooldown":300}'
```

Current public production baseline:

- Frontend service: minimum 2 tasks, maximum 4 tasks, target tracking on ECS average CPU at 65%.
- API service: minimum 2 tasks, maximum 6 tasks, target tracking on ECS average CPU at 60%.
- Scale-out cooldown: 60 seconds.
- Scale-in cooldown: 300 seconds.

Verify the live autoscaling targets and policies.

```bash
aws application-autoscaling describe-scalable-targets \
  --region "$AWS_REGION" \
  --service-namespace ecs \
  --resource-ids "service/$ECS_CLUSTER_NAME/$ECS_FRONTEND_SERVICE_NAME" "service/$ECS_CLUSTER_NAME/$ECS_API_SERVICE_NAME" \
  --query 'ScalableTargets[*].[ResourceId,MinCapacity,MaxCapacity]' \
  --output table

aws application-autoscaling describe-scaling-policies \
  --region "$AWS_REGION" \
  --service-namespace ecs \
  --resource-id "service/$ECS_CLUSTER_NAME/$ECS_FRONTEND_SERVICE_NAME" \
  --query 'ScalingPolicies[*].[PolicyName,PolicyType,TargetTrackingScalingPolicyConfiguration.TargetValue]' \
  --output table

aws application-autoscaling describe-scaling-policies \
  --region "$AWS_REGION" \
  --service-namespace ecs \
  --resource-id "service/$ECS_CLUSTER_NAME/$ECS_API_SERVICE_NAME" \
  --query 'ScalingPolicies[*].[PolicyName,PolicyType,TargetTrackingScalingPolicyConfiguration.TargetValue]' \
  --output table
```

## 7) DNS records in Squarespace

Create two CNAME records:

1) Certificate validation CNAME (ACM has verified the domain in `$CUSTOM_DOMAIN`)
- Name: provided by ACM (underscore token)
- Alias/Value: provided by ACM (*.acm-validations.aws)

2) Traffic CNAME
- Name: `$DNS_RECORD_NAME`
- Alias/Value: ALB DNS name from `$ALB_DNS`

## 8) Final checks

```bash
# Your custom domain should answer after DNS propagates and matches the ACM certificate
curl -I "https://$CUSTOM_DOMAIN"
```


