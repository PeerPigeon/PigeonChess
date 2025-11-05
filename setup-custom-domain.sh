#!/bin/bash

# Setup custom domain chess.peerpigeon.io with SSL

DOMAIN="chess.peerpigeon.io"
BASE_DOMAIN="peerpigeon.io"
DISTRIBUTION_ID="E1HQG9N7TAA20M"

echo "🌐 Setting up custom domain: $DOMAIN"
echo ""

# Step 1: Request ACM certificate (must be in us-east-1 for CloudFront)
echo "📜 Requesting SSL certificate from ACM..."
CERT_ARN=$(aws acm request-certificate \
    --domain-name "$DOMAIN" \
    --validation-method DNS \
    --region us-east-1 \
    --query 'CertificateArn' \
    --output text)

if [ $? -ne 0 ]; then
    echo "❌ Failed to request certificate"
    exit 1
fi

echo "✅ Certificate requested: $CERT_ARN"
echo ""

# Step 2: Get DNS validation records
echo "⏳ Waiting for certificate validation records..."
sleep 5

VALIDATION_RECORD=$(aws acm describe-certificate \
    --certificate-arn "$CERT_ARN" \
    --region us-east-1 \
    --query 'Certificate.DomainValidationOptions[0].ResourceRecord' \
    --output json)

VALIDATION_NAME=$(echo "$VALIDATION_RECORD" | grep -o '"Name": "[^"]*"' | cut -d'"' -f4)
VALIDATION_VALUE=$(echo "$VALIDATION_RECORD" | grep -o '"Value": "[^"]*"' | cut -d'"' -f4)

echo "📋 DNS Validation Record:"
echo "   Name:  $VALIDATION_NAME"
echo "   Type:  CNAME"
echo "   Value: $VALIDATION_VALUE"
echo ""

# Step 3: Get the hosted zone ID for peerpigeon.io
echo "🔍 Finding Route 53 hosted zone for $BASE_DOMAIN..."
HOSTED_ZONE_ID=$(aws route53 list-hosted-zones \
    --query "HostedZones[?Name=='${BASE_DOMAIN}.'].Id" \
    --output text | sed 's/\/hostedzone\///')

if [ -z "$HOSTED_ZONE_ID" ]; then
    echo "❌ Could not find hosted zone for $BASE_DOMAIN"
    exit 1
fi

echo "✅ Found hosted zone: $HOSTED_ZONE_ID"
echo ""

# Step 4: Create DNS validation record in Route 53
echo "📝 Creating DNS validation record in Route 53..."
cat > /tmp/validation-record.json <<EOF
{
  "Changes": [{
    "Action": "UPSERT",
    "ResourceRecordSet": {
      "Name": "$VALIDATION_NAME",
      "Type": "CNAME",
      "TTL": 300,
      "ResourceRecords": [{"Value": "$VALIDATION_VALUE"}]
    }
  }]
}
EOF

aws route53 change-resource-record-sets \
    --hosted-zone-id "$HOSTED_ZONE_ID" \
    --change-batch file:///tmp/validation-record.json \
    --output json > /dev/null

rm /tmp/validation-record.json

echo "✅ DNS validation record created"
echo ""

# Step 5: Wait for certificate validation
echo "⏳ Waiting for certificate validation (this may take a few minutes)..."
aws acm wait certificate-validated \
    --certificate-arn "$CERT_ARN" \
    --region us-east-1

echo "✅ Certificate validated!"
echo ""

# Step 6: Update CloudFront distribution with custom domain and certificate
echo "☁️  Updating CloudFront distribution..."

# Get current distribution config
aws cloudfront get-distribution-config --id "$DISTRIBUTION_ID" > /tmp/dist-config.json

# Extract ETag and config
ETAG=$(cat /tmp/dist-config.json | grep -o '"ETag": "[^"]*"' | cut -d'"' -f4)

# Update the config with custom domain and certificate
cat /tmp/dist-config.json | \
    jq '.DistributionConfig.Aliases.Quantity = 1 | 
        .DistributionConfig.Aliases.Items = ["'$DOMAIN'"] |
        .DistributionConfig.ViewerCertificate = {
            "ACMCertificateArn": "'$CERT_ARN'",
            "SSLSupportMethod": "sni-only",
            "MinimumProtocolVersion": "TLSv1.2_2021",
            "CertificateSource": "acm"
        }' | \
    jq '.DistributionConfig' > /tmp/updated-config.json

aws cloudfront update-distribution \
    --id "$DISTRIBUTION_ID" \
    --distribution-config file:///tmp/updated-config.json \
    --if-match "$ETAG" \
    --output json > /dev/null

echo "✅ CloudFront updated with custom domain and certificate"
echo ""

# Step 7: Get CloudFront domain name
CLOUDFRONT_DOMAIN=$(aws cloudfront get-distribution --id "$DISTRIBUTION_ID" \
    --query 'Distribution.DomainName' --output text)

# Step 8: Create Route 53 record for the custom domain
echo "📝 Creating Route 53 A record for $DOMAIN..."
cat > /tmp/domain-record.json <<EOF
{
  "Changes": [{
    "Action": "UPSERT",
    "ResourceRecordSet": {
      "Name": "$DOMAIN",
      "Type": "A",
      "AliasTarget": {
        "HostedZoneId": "Z2FDTNDATAQYW2",
        "DNSName": "$CLOUDFRONT_DOMAIN",
        "EvaluateTargetHealth": false
      }
    }
  }]
}
EOF

aws route53 change-resource-record-sets \
    --hosted-zone-id "$HOSTED_ZONE_ID" \
    --change-batch file:///tmp/domain-record.json \
    --output json > /dev/null

rm /tmp/domain-record.json
rm /tmp/dist-config.json
rm /tmp/updated-config.json

echo "✅ Route 53 record created"
echo ""

echo "🎉 Custom domain setup complete!"
echo ""
echo "🌐 Your site is now available at:"
echo "   https://$DOMAIN"
echo ""
echo "⏳ Note: DNS propagation may take a few minutes."
echo "   CloudFront update may take 15-20 minutes to fully deploy."
echo ""
echo "💾 Certificate ARN saved for reference:"
echo "   $CERT_ARN"
echo "$CERT_ARN" > .acm-certificate-arn
echo ""
