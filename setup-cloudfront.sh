#!/bin/bash

# PigeonChess CloudFront + SSL Setup Script
# This script sets up CloudFront with a free SSL certificate

BUCKET_NAME="pigeonchess-peerpigeon-2025"
REGION="us-east-1"

echo "🔒 Setting up CloudFront with SSL for PigeonChess..."
echo ""

# Get the S3 website endpoint
S3_WEBSITE_ENDPOINT="$BUCKET_NAME.s3-website-$REGION.amazonaws.com"

echo "📋 S3 Website Endpoint: $S3_WEBSITE_ENDPOINT"
echo ""

# Create CloudFront distribution configuration
echo "☁️  Creating CloudFront distribution..."
echo "   This will provide:"
echo "   - Free SSL certificate (HTTPS)"
echo "   - Global CDN caching"
echo "   - Better performance worldwide"
echo ""

# Create the distribution
DISTRIBUTION_CONFIG='{
  "CallerReference": "'$(date +%s)'",
  "Comment": "PigeonChess P2P Chess Application",
  "Enabled": true,
  "Origins": {
    "Quantity": 1,
    "Items": [
      {
        "Id": "S3-'$BUCKET_NAME'",
        "DomainName": "'$S3_WEBSITE_ENDPOINT'",
        "CustomOriginConfig": {
          "HTTPPort": 80,
          "HTTPSPort": 443,
          "OriginProtocolPolicy": "http-only"
        }
      }
    ]
  },
  "DefaultRootObject": "index.html",
  "DefaultCacheBehavior": {
    "TargetOriginId": "S3-'$BUCKET_NAME'",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {
      "Quantity": 2,
      "Items": ["GET", "HEAD"],
      "CachedMethods": {
        "Quantity": 2,
        "Items": ["GET", "HEAD"]
      }
    },
    "ForwardedValues": {
      "QueryString": false,
      "Cookies": {
        "Forward": "none"
      }
    },
    "MinTTL": 0,
    "DefaultTTL": 86400,
    "MaxTTL": 31536000,
    "Compress": true
  },
  "CustomErrorResponses": {
    "Quantity": 1,
    "Items": [
      {
        "ErrorCode": 404,
        "ResponsePagePath": "/index.html",
        "ResponseCode": "200",
        "ErrorCachingMinTTL": 300
      }
    ]
  },
  "PriceClass": "PriceClass_100"
}'

# Create the distribution
echo "$DISTRIBUTION_CONFIG" > /tmp/cloudfront-config.json

DISTRIBUTION_OUTPUT=$(aws cloudfront create-distribution \
  --distribution-config file:///tmp/cloudfront-config.json \
  2>&1)

if [ $? -ne 0 ]; then
  echo "❌ Failed to create CloudFront distribution"
  echo "$DISTRIBUTION_OUTPUT"
  rm /tmp/cloudfront-config.json
  exit 1
fi

# Extract the distribution details
DISTRIBUTION_ID=$(echo "$DISTRIBUTION_OUTPUT" | grep -o '"Id": "[^"]*"' | head -1 | cut -d'"' -f4)
CLOUDFRONT_DOMAIN=$(echo "$DISTRIBUTION_OUTPUT" | grep -o '"DomainName": "[^"]*"' | head -1 | cut -d'"' -f4)

rm /tmp/cloudfront-config.json

echo "✅ CloudFront distribution created!"
echo ""
echo "📋 Distribution Details:"
echo "   Distribution ID: $DISTRIBUTION_ID"
echo "   CloudFront Domain: $CLOUDFRONT_DOMAIN"
echo ""
echo "⏳ CloudFront is deploying... This takes 15-30 minutes."
echo "   Status: Deploying"
echo ""
echo "🌐 Once deployed, your HTTPS site will be available at:"
echo "   https://$CLOUDFRONT_DOMAIN"
echo ""
echo "💡 To check deployment status, run:"
echo "   aws cloudfront get-distribution --id $DISTRIBUTION_ID --query 'Distribution.Status'"
echo ""
echo "🔄 When you update your site:"
echo "   1. Run ./deploy.sh to upload to S3"
echo "   2. Invalidate CloudFront cache:"
echo "      aws cloudfront create-invalidation --distribution-id $DISTRIBUTION_ID --paths '/*'"
echo ""

# Save distribution ID for future use
echo "$DISTRIBUTION_ID" > .cloudfront-distribution-id
echo "📝 Distribution ID saved to .cloudfront-distribution-id"
echo ""
