$ErrorActionPreference = "Stop"
$env:AWS_PAGER = ""

Write-Host "=== Tanna EC2 Deployment Script ===" -ForegroundColor Cyan

# Variables
$REGION = "eu-west-1"
$INSTANCE_TYPE = "t3.micro"
$KEY_NAME = "tanna-staging-key"
$SG_NAME = "tanna-staging-sg"

# Get latest Amazon Linux 2023 AMI
Write-Host "`n1. Getting latest Amazon Linux 2023 AMI..." -ForegroundColor Yellow
$AMI_ID = aws ec2 describe-images `
    --region $REGION `
    --owners amazon `
    --filters "Name=name,Values=al2023-ami-2023*-x86_64" "Name=state,Values=available" `
    --query 'sort_by(Images, &CreationDate)[-1].ImageId' `
    --output text

if (-not $AMI_ID) {
    Write-Host "ERROR: Could not find AMI" -ForegroundColor Red
    exit 1
}
Write-Host "   AMI ID: $AMI_ID" -ForegroundColor Green

# Check if security group exists
Write-Host "`n2. Creating security group..." -ForegroundColor Yellow
$SG_EXISTS = aws ec2 describe-security-groups --group-names $SG_NAME --region $REGION 2>$null | ConvertFrom-Json
if ($SG_EXISTS) {
    $SG_ID = $SG_EXISTS.SecurityGroups[0].GroupId
    Write-Host "   Security group already exists: $SG_ID" -ForegroundColor Green
} else {
    $SG_RESULT = aws ec2 create-security-group `
        --group-name $SG_NAME `
        --description "Tanna staging - SSH, HTTP, Port 3000" `
        --region $REGION | ConvertFrom-Json
    $SG_ID = $SG_RESULT.GroupId
    Write-Host "   Created security group: $SG_ID" -ForegroundColor Green
    
    # Add ingress rules
    Write-Host "`n3. Adding security group rules..." -ForegroundColor Yellow
    
    # SSH (port 22)
    aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 22 --cidr 0.0.0.0/0 --region $REGION 2>$null
    Write-Host "   Added SSH (22) rule" -ForegroundColor Green
    
    # HTTP (port 80)
    aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 80 --cidr 0.0.0.0/0 --region $REGION 2>$null
    Write-Host "   Added HTTP (80) rule" -ForegroundColor Green
    
    # Port 3000 (Fastify)
    aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 3000 --cidr 0.0.0.0/0 --region $REGION 2>$null
    Write-Host "   Added Port 3000 rule" -ForegroundColor Green
}

# Check if key pair exists
Write-Host "`n4. Creating SSH key pair..." -ForegroundColor Yellow
$KEY_EXISTS = aws ec2 describe-key-pairs --key-names $KEY_NAME --region $REGION 2>$null
if ($KEY_EXISTS) {
    Write-Host "   Key pair already exists: $KEY_NAME" -ForegroundColor Green
} else {
    $KEY_RESULT = aws ec2 create-key-pair `
        --key-name $KEY_NAME `
        --query 'KeyMaterial' `
        --output text `
        --region $REGION
    
    $KEY_PATH = "$PSScriptRoot\$KEY_NAME.pem"
    $KEY_RESULT | Out-File -FilePath $KEY_PATH -Encoding ASCII
    Write-Host "   Created key pair and saved to: $KEY_PATH" -ForegroundColor Green
}

# Launch EC2 instance
Write-Host "`n5. Launching EC2 instance..." -ForegroundColor Yellow
$INSTANCE_RESULT = aws ec2 run-instances `
    --image-id $AMI_ID `
    --instance-type $INSTANCE_TYPE `
    --key-name $KEY_NAME `
    --security-group-ids $SG_ID `
    --associate-public-ip-address `
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=tanna-staging}]" `
    --region $REGION | ConvertFrom-Json

$INSTANCE_ID = $INSTANCE_RESULT.Instances[0].InstanceId
Write-Host "   Instance ID: $INSTANCE_ID" -ForegroundColor Green

# Wait for instance to be running
Write-Host "`n6. Waiting for instance to be running..." -ForegroundColor Yellow
aws ec2 wait instance-running --instance-ids $INSTANCE_ID --region $REGION
Write-Host "   Instance is running!" -ForegroundColor Green

# Get public IP
Write-Host "`n7. Getting public IP address..." -ForegroundColor Yellow
$INSTANCE_INFO = aws ec2 describe-instances `
    --instance-ids $INSTANCE_ID `
    --query 'Reservations[0].Instances[0].PublicIpAddress' `
    --output text `
    --region $REGION

Write-Host "`n=== DEPLOYMENT COMPLETE ===" -ForegroundColor Cyan
Write-Host "Instance ID: $INSTANCE_ID" -ForegroundColor White
Write-Host "Public IP: $INSTANCE_INFO" -ForegroundColor Green
Write-Host "SSH: ssh -i $KEY_NAME.pem ec2-user@$INSTANCE_INFO" -ForegroundColor White
Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "1. SSH into the instance"
Write-Host "2. Install Node.js, clone repo, configure database"
Write-Host "3. Update Paystack webhook URL to: http://${INSTANCE_INFO}:3000/api/webhooks/paystack"

# Save details to file
@"
TANNA STAGING EC2 DETAILS
==========================
Instance ID: $INSTANCE_ID
Public IP: $INSTANCE_INFO
Region: $REGION
SSH Command: ssh -i $KEY_NAME.pem ec2-user@$INSTANCE_INFO

Paystack URLs:
- Callback: http://${INSTANCE_INFO}:3000/api/payments/callback  
- Webhook: http://${INSTANCE_INFO}:3000/api/webhooks/paystack
"@ | Out-File -FilePath "$PSScriptRoot\ec2-details.txt" -Encoding UTF8

Write-Host "`nDetails saved to: ec2-details.txt" -ForegroundColor Green
