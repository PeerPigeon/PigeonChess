#!/bin/bash

# PigeonChess AWS Deployment Script
# This script deploys the built app to AWS S3

# Configuration - Update these values
BUCKET_NAME="pigeonchess-peerpigeon-2025"  # Change this to your desired bucket name
REGION="us-east-1"              # Change this to your preferred AWS region

echo "🚀 Deploying PigeonChess to AWS S3..."

# Check if bucket name is still default
if [ "$BUCKET_NAME" = "pigeonchess-app" ]; then
    echo "⚠️  Warning: You're using the default bucket name. Consider changing it to something unique."
    read -p "Press enter to continue or Ctrl+C to cancel and edit the script..."
fi

# Build the project
echo "📦 Building the project..."
npm run build

if [ ! -d "dist" ]; then
    echo "❌ Build failed - dist directory not found"
    exit 1
fi

# Check if bucket exists
echo "🔍 Checking if bucket exists..."
if aws s3 ls "s3://$BUCKET_NAME" 2>&1 | grep -q 'NoSuchBucket'; then
    echo "📦 Creating S3 bucket: $BUCKET_NAME in region $REGION..."
    
    if [ "$REGION" = "us-east-1" ]; then
        # us-east-1 doesn't need LocationConstraint
        aws s3api create-bucket --bucket "$BUCKET_NAME" --region "$REGION"
    else
        aws s3api create-bucket --bucket "$BUCKET_NAME" --region "$REGION" \
            --create-bucket-configuration LocationConstraint="$REGION"
    fi
    
    if [ $? -ne 0 ]; then
        echo "❌ Failed to create bucket. It may already exist or you may not have permissions."
        exit 1
    fi
    
    echo "✅ Bucket created successfully"
else
    echo "✅ Bucket already exists"
fi

# Configure bucket for static website hosting
echo "🌐 Configuring static website hosting..."
aws s3 website "s3://$BUCKET_NAME" \
    --index-document index.html \
    --error-document index.html

# Upload files to S3
echo "📤 Uploading files to S3..."
aws s3 sync dist/ "s3://$BUCKET_NAME" \
    --delete \
    --cache-control "public, max-age=31536000" \
    --exclude "index.html"

# Upload index.html with no-cache to ensure updates are seen
aws s3 cp dist/index.html "s3://$BUCKET_NAME/index.html" \
    --cache-control "no-cache, no-store, must-revalidate"

# Make bucket public
echo "🔓 Setting bucket policy for public access..."

# First, disable block public access
aws s3api put-public-access-block \
    --bucket "$BUCKET_NAME" \
    --public-access-block-configuration \
    "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"

# Create and apply bucket policy
cat > /tmp/bucket-policy.json <<EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "PublicReadGetObject",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::$BUCKET_NAME/*"
        }
    ]
}
EOF

aws s3api put-bucket-policy --bucket "$BUCKET_NAME" --policy file:///tmp/bucket-policy.json

# Clean up
rm /tmp/bucket-policy.json

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📍 Your website is available at:"
echo "   http://$BUCKET_NAME.s3-website-$REGION.amazonaws.com"
echo ""
echo "💡 Tips:"
echo "   - To update the site, just run this script again"
echo "   - Consider setting up CloudFront for HTTPS and better performance"
echo "   - You can add a custom domain using Route 53"
echo ""
