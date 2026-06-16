# TAPESTRY Internal Dev ALB Workflow

This workflow creates a separate internal dev URL for TAPESTRY using the existing VPC, ECS cluster, private subnets, and ECR images.

It does not change the existing public production ALB or public domain.

The result is an AWS-generated internal ALB URL such as:

```text
http://internal-<load-balancer-name>-<id>.<region>.elb.amazonaws.com
```

That URL is only reachable from clients that can reach the VPC, such as a VPN, internal portal, bastion host, peered VPC, or connected internal network.

## 0) Set Variables

Create a local config from the safe example, then fill in the real environment values locally. Do not commit the local JSON file.

```bash
cp docs/aws_internal_dev_alb.example.json docs/aws_internal_dev_alb.local.json
```

Load the config into shell variables.

```bash
export DEV_ALB_CONFIG=docs/aws_internal_dev_alb.local.json

export AWS_PROFILE=$(jq -r '.awsProfile' "$DEV_ALB_CONFIG")
export AWS_REGION=$(jq -r '.awsRegion' "$DEV_ALB_CONFIG")
export AWS_PAGER=""

aws sso login --profile "$AWS_PROFILE"

export APP_NAME=$(jq -r '.appName' "$DEV_ALB_CONFIG")
export ENV_NAME=$(jq -r '.envName' "$DEV_ALB_CONFIG")

export VPC_ID=$(jq -r '.vpcId' "$DEV_ALB_CONFIG")
export PRIVATE_SUBNET_A_ID=$(jq -r '.privateSubnetAId' "$DEV_ALB_CONFIG")
export PRIVATE_SUBNET_B_ID=$(jq -r '.privateSubnetBId' "$DEV_ALB_CONFIG")

export ECS_CLUSTER_NAME=$(jq -r '.ecsClusterName' "$DEV_ALB_CONFIG")

export DEV_ALB_NAME=$(jq -r '.devAlbName' "$DEV_ALB_CONFIG")
export DEV_FRONTEND_TG_NAME=$(jq -r '.devFrontendTargetGroupName' "$DEV_ALB_CONFIG")
export DEV_API_TG_NAME=$(jq -r '.devApiTargetGroupName' "$DEV_ALB_CONFIG")

export DEV_FRONTEND_SERVICE_NAME=$(jq -r '.devFrontendServiceName' "$DEV_ALB_CONFIG")
export DEV_API_SERVICE_NAME=$(jq -r '.devApiServiceName' "$DEV_ALB_CONFIG")

export DEV_FRONTEND_TASK_DEF_FAMILY=$(jq -r '.devFrontendTaskDefFamily' "$DEV_ALB_CONFIG")
export DEV_API_TASK_DEF_FAMILY=$(jq -r '.devApiTaskDefFamily' "$DEV_ALB_CONFIG")

export FRONTEND_CONTAINER_NAME=$(jq -r '.frontendContainerName' "$DEV_ALB_CONFIG")
export FRONTEND_CONTAINER_PORT=$(jq -r '.frontendContainerPort' "$DEV_ALB_CONFIG")

export API_CONTAINER_NAME=$(jq -r '.apiContainerName' "$DEV_ALB_CONFIG")
export API_CONTAINER_PORT=$(jq -r '.apiContainerPort' "$DEV_ALB_CONFIG")

export ECS_EXECUTION_ROLE_ARN=$(jq -r '.ecsExecutionRoleArn' "$DEV_ALB_CONFIG")

# Broad private ranges for internal/VPN-routed access to the dev URL.
# This does not expose the internal ALB to the public internet, but any routed private network in these ranges can reach it.
# Do not use 0.0.0.0/0 for an internal dev portal.
mapfile -t INTERNAL_CLIENT_CIDRS < <(jq -r '.internalClientCidrs[]' "$DEV_ALB_CONFIG")
```

## 1) Helper Functions

```bash
get_sg_id_by_name() {
  aws ec2 describe-security-groups \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --filters "Name=vpc-id,Values=$VPC_ID" "Name=group-name,Values=$1" \
    --query 'SecurityGroups[0].GroupId' \
    --output text
}

get_tg_arn_by_name() {
  aws elbv2 describe-target-groups \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --names "$1" \
    --query 'TargetGroups[0].TargetGroupArn' \
    --output text 2>/dev/null || true
}

get_alb_arn_by_name() {
  aws elbv2 describe-load-balancers \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --names "$1" \
    --query 'LoadBalancers[0].LoadBalancerArn' \
    --output text 2>/dev/null || true
}

ecs_service_exists() {
  aws ecs describe-services \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --cluster "$ECS_CLUSTER_NAME" \
    --services "$1" \
    --query 'services[0].status' \
    --output text 2>/dev/null | grep -q ACTIVE
}
```

## 2) Create Security Groups

Create or reuse the internal ALB security group.

```bash
DEV_ALB_SG_ID=$(get_sg_id_by_name tapestry-dev-internal-alb-sg)

if [[ "$DEV_ALB_SG_ID" == "None" || -z "$DEV_ALB_SG_ID" ]]; then
  DEV_ALB_SG_ID=$(aws ec2 create-security-group \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --group-name tapestry-dev-internal-alb-sg \
    --description "Internal dev ALB SG for TAPESTRY" \
    --vpc-id "$VPC_ID" \
    --query 'GroupId' \
    --output text)
fi

echo "$DEV_ALB_SG_ID"

for cidr in "${INTERNAL_CLIENT_CIDRS[@]}"; do
  aws ec2 authorize-security-group-ingress \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --group-id "$DEV_ALB_SG_ID" \
    --protocol tcp \
    --port 80 \
    --cidr "$cidr" || true
done
```

Create or reuse the dev frontend task security group.

```bash
DEV_FRONTEND_TASK_SG_ID=$(get_sg_id_by_name tapestry-dev-frontend-task-sg)

if [[ "$DEV_FRONTEND_TASK_SG_ID" == "None" || -z "$DEV_FRONTEND_TASK_SG_ID" ]]; then
  DEV_FRONTEND_TASK_SG_ID=$(aws ec2 create-security-group \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --group-name tapestry-dev-frontend-task-sg \
    --description "Dev frontend ECS task SG for TAPESTRY" \
    --vpc-id "$VPC_ID" \
    --query 'GroupId' \
    --output text)
fi

echo "$DEV_FRONTEND_TASK_SG_ID"

aws ec2 authorize-security-group-ingress \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --group-id "$DEV_FRONTEND_TASK_SG_ID" \
  --protocol tcp \
  --port "$FRONTEND_CONTAINER_PORT" \
  --source-group "$DEV_ALB_SG_ID" || true
```

Create or reuse the dev API task security group.

```bash
DEV_API_TASK_SG_ID=$(get_sg_id_by_name tapestry-dev-api-task-sg)

if [[ "$DEV_API_TASK_SG_ID" == "None" || -z "$DEV_API_TASK_SG_ID" ]]; then
  DEV_API_TASK_SG_ID=$(aws ec2 create-security-group \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --group-name tapestry-dev-api-task-sg \
    --description "Dev API ECS task SG for TAPESTRY" \
    --vpc-id "$VPC_ID" \
    --query 'GroupId' \
    --output text)
fi

echo "$DEV_API_TASK_SG_ID"

aws ec2 authorize-security-group-ingress \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --group-id "$DEV_API_TASK_SG_ID" \
  --protocol tcp \
  --port "$API_CONTAINER_PORT" \
  --source-group "$DEV_ALB_SG_ID" || true
```

If the dev API should use the existing RDS database, allow the dev API security group to reach the RDS security group.

```bash
export RDS_SG_ID=$(jq -r '.rdsSecurityGroupId' "$DEV_ALB_CONFIG")

aws ec2 authorize-security-group-ingress \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --group-id "$RDS_SG_ID" \
  --protocol tcp \
  --port 5432 \
  --source-group "$DEV_API_TASK_SG_ID" || true
```

Allow the dev ECS tasks to reach the existing VPC interface endpoints for ECR, Secrets Manager, and CloudWatch Logs.

```bash
export VPCE_SG_ID=$(jq -r '.vpcEndpointSecurityGroupId' "$DEV_ALB_CONFIG")

aws ec2 authorize-security-group-ingress \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --group-id "$VPCE_SG_ID" \
  --protocol tcp \
  --port 443 \
  --source-group "$DEV_FRONTEND_TASK_SG_ID" || true

aws ec2 authorize-security-group-ingress \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --group-id "$VPCE_SG_ID" \
  --protocol tcp \
  --port 443 \
  --source-group "$DEV_API_TASK_SG_ID" || true
```

## 3) Create Target Groups

Create or reuse the dev frontend target group.

```bash
DEV_FRONTEND_TG_ARN=$(get_tg_arn_by_name "$DEV_FRONTEND_TG_NAME")

if [[ "$DEV_FRONTEND_TG_ARN" == "None" || -z "$DEV_FRONTEND_TG_ARN" ]]; then
  DEV_FRONTEND_TG_ARN=$(aws elbv2 create-target-group \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --name "$DEV_FRONTEND_TG_NAME" \
    --protocol HTTP \
    --port "$FRONTEND_CONTAINER_PORT" \
    --target-type ip \
    --vpc-id "$VPC_ID" \
    --health-check-protocol HTTP \
    --health-check-path / \
    --query 'TargetGroups[0].TargetGroupArn' \
    --output text)
fi

echo "$DEV_FRONTEND_TG_ARN"
```

Create or reuse the dev API target group.

```bash
DEV_API_TG_ARN=$(get_tg_arn_by_name "$DEV_API_TG_NAME")

if [[ "$DEV_API_TG_ARN" == "None" || -z "$DEV_API_TG_ARN" ]]; then
  DEV_API_TG_ARN=$(aws elbv2 create-target-group \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --name "$DEV_API_TG_NAME" \
    --protocol HTTP \
    --port "$API_CONTAINER_PORT" \
    --target-type ip \
    --vpc-id "$VPC_ID" \
    --health-check-protocol HTTP \
    --health-check-path /tapestry-api/status/ \
    --query 'TargetGroups[0].TargetGroupArn' \
    --output text)
fi

echo "$DEV_API_TG_ARN"
```

## 4) Create Internal ALB

```bash
DEV_ALB_ARN=$(get_alb_arn_by_name "$DEV_ALB_NAME")

if [[ "$DEV_ALB_ARN" == "None" || -z "$DEV_ALB_ARN" ]]; then
  DEV_ALB_ARN=$(aws elbv2 create-load-balancer \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --name "$DEV_ALB_NAME" \
    --type application \
    --scheme internal \
    --security-groups "$DEV_ALB_SG_ID" \
    --subnets "$PRIVATE_SUBNET_A_ID" "$PRIVATE_SUBNET_B_ID" \
    --query 'LoadBalancers[0].LoadBalancerArn' \
    --output text)
fi

echo "$DEV_ALB_ARN"

aws elbv2 wait load-balancer-available \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --load-balancer-arns "$DEV_ALB_ARN"

DEV_ALB_DNS=$(aws elbv2 describe-load-balancers \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --load-balancer-arns "$DEV_ALB_ARN" \
  --query 'LoadBalancers[0].DNSName' \
  --output text)

echo "Internal dev URL: http://$DEV_ALB_DNS"
```

## 5) Create Listener And API Path Rule

Create or reuse the HTTP listener. The default action routes to the dev frontend.

```bash
DEV_HTTP_LISTENER_ARN=$(aws elbv2 describe-listeners \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --load-balancer-arn "$DEV_ALB_ARN" \
  --query "Listeners[?Port==\`80\`].ListenerArn | [0]" \
  --output text)

if [[ "$DEV_HTTP_LISTENER_ARN" == "None" || -z "$DEV_HTTP_LISTENER_ARN" ]]; then
  DEV_HTTP_LISTENER_ARN=$(aws elbv2 create-listener \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --load-balancer-arn "$DEV_ALB_ARN" \
    --protocol HTTP \
    --port 80 \
    --default-actions Type=forward,TargetGroupArn="$DEV_FRONTEND_TG_ARN" \
    --query 'Listeners[0].ListenerArn' \
    --output text)
fi

echo "$DEV_HTTP_LISTENER_ARN"
```

Add the API path rule.

```bash
EXISTING_DEV_API_RULE_ARN=$(aws elbv2 describe-rules \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --listener-arn "$DEV_HTTP_LISTENER_ARN" \
  --query "Rules[?contains(join(',', Conditions[].Values), '/tapestry-api/*')].RuleArn | [0]" \
  --output text)

if [[ "$EXISTING_DEV_API_RULE_ARN" == "None" || -z "$EXISTING_DEV_API_RULE_ARN" ]]; then
  aws elbv2 create-rule \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --listener-arn "$DEV_HTTP_LISTENER_ARN" \
    --priority 100 \
    --conditions Field=path-pattern,Values='/tapestry-api/*' \
    --actions Type=forward,TargetGroupArn="$DEV_API_TG_ARN"
fi
```

## 6) Register Dev Task Definitions

Set dev image URIs. Replace these tags with the dev images you pushed to ECR.

```bash
export FRONTEND_DEV_IMAGE_URI=$(jq -r '.frontendDevImageUri' "$DEV_ALB_CONFIG")
export API_DEV_IMAGE_URI=$(jq -r '.apiDevImageUri' "$DEV_ALB_CONFIG")
```

If the `dev` tags have not been pushed yet, set these values in `docs/aws_internal_dev_alb.local.json` to known-good existing image tags.

Create CloudWatch log groups.

```bash
aws logs create-log-group \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --log-group-name "/ecs/$DEV_FRONTEND_TASK_DEF_FAMILY" || true

aws logs create-log-group \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --log-group-name "/ecs/$DEV_API_TASK_DEF_FAMILY" || true
```

Register the dev frontend task definition.

```bash
aws ecs register-task-definition \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --family "$DEV_FRONTEND_TASK_DEF_FAMILY" \
  --requires-compatibilities FARGATE \
  --network-mode awsvpc \
  --cpu 256 \
  --memory 512 \
  --execution-role-arn "$ECS_EXECUTION_ROLE_ARN" \
  --container-definitions "[{\"name\":\"$FRONTEND_CONTAINER_NAME\",\"image\":\"$FRONTEND_DEV_IMAGE_URI\",\"essential\":true,\"portMappings\":[{\"containerPort\":$FRONTEND_CONTAINER_PORT,\"protocol\":\"tcp\"}],\"logConfiguration\":{\"logDriver\":\"awslogs\",\"options\":{\"awslogs-group\":\"/ecs/$DEV_FRONTEND_TASK_DEF_FAMILY\",\"awslogs-region\":\"$AWS_REGION\",\"awslogs-stream-prefix\":\"ecs\"}}}]"
```

Register the dev API task definition. Keep `DB_HOST`, `DB_PORT`, `DB_NAME`, and `SECRET_ARN` aligned with the database this dev environment should use.

```bash
export DB_HOST=$(jq -r '.dbHost' "$DEV_ALB_CONFIG")
export DB_PORT=$(jq -r '.dbPort' "$DEV_ALB_CONFIG")
export DB_NAME=$(jq -r '.dbName' "$DEV_ALB_CONFIG")
export SECRET_ARN=$(jq -r '.secretArn' "$DEV_ALB_CONFIG")

aws ecs register-task-definition \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --family "$DEV_API_TASK_DEF_FAMILY" \
  --requires-compatibilities FARGATE \
  --network-mode awsvpc \
  --cpu 512 \
  --memory 1024 \
  --execution-role-arn "$ECS_EXECUTION_ROLE_ARN" \
  --container-definitions "[{\"name\":\"$API_CONTAINER_NAME\",\"image\":\"$API_DEV_IMAGE_URI\",\"essential\":true,\"portMappings\":[{\"containerPort\":$API_CONTAINER_PORT,\"protocol\":\"tcp\"}],\"environment\":[{\"name\":\"DB_HOST\",\"value\":\"$DB_HOST\"},{\"name\":\"DB_PORT\",\"value\":\"$DB_PORT\"},{\"name\":\"DB_NAME\",\"value\":\"$DB_NAME\"}],\"secrets\":[{\"name\":\"DB_USER\",\"valueFrom\":\"$SECRET_ARN:username::\"},{\"name\":\"DB_PASSWORD\",\"valueFrom\":\"$SECRET_ARN:password::\"}],\"logConfiguration\":{\"logDriver\":\"awslogs\",\"options\":{\"awslogs-group\":\"/ecs/$DEV_API_TASK_DEF_FAMILY\",\"awslogs-region\":\"$AWS_REGION\",\"awslogs-stream-prefix\":\"ecs\"}}}]"
```

## 7) Create Or Update Dev ECS Services

Create or update the dev frontend service.

```bash
if ecs_service_exists "$DEV_FRONTEND_SERVICE_NAME"; then
  aws ecs update-service \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --cluster "$ECS_CLUSTER_NAME" \
    --service "$DEV_FRONTEND_SERVICE_NAME" \
    --task-definition "$DEV_FRONTEND_TASK_DEF_FAMILY" \
    --force-new-deployment
else
  aws ecs create-service \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --cluster "$ECS_CLUSTER_NAME" \
    --service-name "$DEV_FRONTEND_SERVICE_NAME" \
    --task-definition "$DEV_FRONTEND_TASK_DEF_FAMILY" \
    --launch-type FARGATE \
    --desired-count 2 \
    --network-configuration "awsvpcConfiguration={subnets=[$PRIVATE_SUBNET_A_ID,$PRIVATE_SUBNET_B_ID],securityGroups=[$DEV_FRONTEND_TASK_SG_ID],assignPublicIp=DISABLED}" \
    --load-balancers targetGroupArn="$DEV_FRONTEND_TG_ARN",containerName="$FRONTEND_CONTAINER_NAME",containerPort="$FRONTEND_CONTAINER_PORT" \
    --health-check-grace-period-seconds 60
fi
```

Create or update the dev API service.

```bash
if ecs_service_exists "$DEV_API_SERVICE_NAME"; then
  aws ecs update-service \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --cluster "$ECS_CLUSTER_NAME" \
    --service "$DEV_API_SERVICE_NAME" \
    --task-definition "$DEV_API_TASK_DEF_FAMILY" \
    --force-new-deployment
else
  aws ecs create-service \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --cluster "$ECS_CLUSTER_NAME" \
    --service-name "$DEV_API_SERVICE_NAME" \
    --task-definition "$DEV_API_TASK_DEF_FAMILY" \
    --launch-type FARGATE \
    --desired-count 2 \
    --network-configuration "awsvpcConfiguration={subnets=[$PRIVATE_SUBNET_A_ID,$PRIVATE_SUBNET_B_ID],securityGroups=[$DEV_API_TASK_SG_ID],assignPublicIp=DISABLED}" \
    --load-balancers targetGroupArn="$DEV_API_TG_ARN",containerName="$API_CONTAINER_NAME",containerPort="$API_CONTAINER_PORT" \
    --health-check-grace-period-seconds 60
fi
```

Wait for both services to stabilize.

```bash
aws ecs wait services-stable \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --cluster "$ECS_CLUSTER_NAME" \
  --services "$DEV_FRONTEND_SERVICE_NAME" "$DEV_API_SERVICE_NAME"
```

## 8) Verify

Check ECS service status.

```bash
aws ecs describe-services \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --cluster "$ECS_CLUSTER_NAME" \
  --services "$DEV_FRONTEND_SERVICE_NAME" "$DEV_API_SERVICE_NAME" \
  --query 'services[*].[serviceName,status,desiredCount,runningCount,pendingCount,events[0].message]' \
  --output table
```

Check target health.

```bash
aws elbv2 describe-target-health \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --target-group-arn "$DEV_FRONTEND_TG_ARN" \
  --query 'TargetHealthDescriptions[*].[Target.Id,Target.Port,TargetHealth.State,TargetHealth.Reason]' \
  --output table

aws elbv2 describe-target-health \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --target-group-arn "$DEV_API_TG_ARN" \
  --query 'TargetHealthDescriptions[*].[Target.Id,Target.Port,TargetHealth.State,TargetHealth.Reason]' \
  --output table
```

Print the internal URLs.

```bash
DEV_ALB_DNS=$(aws elbv2 describe-load-balancers \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --names "$DEV_ALB_NAME" \
  --query 'LoadBalancers[0].DNSName' \
  --output text)

echo "Frontend: http://$DEV_ALB_DNS"
echo "API:      http://$DEV_ALB_DNS/tapestry-api/status/"
```

From a machine that can reach the VPC, verify:

```bash
curl -I "http://$DEV_ALB_DNS"
curl -i "http://$DEV_ALB_DNS/tapestry-api/status/"
```

## Notes

- This workflow intentionally uses a separate internal ALB, separate target groups, separate ECS services, and separate task definition families.
- The existing public production ALB and public production DNS record are not changed.
- The internal ALB DNS name may be publicly resolvable, but it resolves to private IPs and only routes for clients that can reach the VPC.
- HTTP on port 80 is the simplest internal setup. If the dev portal carries sensitive traffic, configure HTTPS and use an internal DNS name with an ACM certificate that matches that name.
- If using the production database for development is risky, create a separate dev database and update the API task definition environment and secret values before creating the service.
