# AWS Deployment Guide

This guide explains how to deploy PigeonChess to AWS S3.

## Prerequisites

1. **AWS CLI installed** - Already installed ✅
2. **AWS credentials configured** - Run `aws configure` if not already done
3. **Node.js and npm** - For building the project

## Quick Deployment

### Step 1: Configure the deployment script

Edit `deploy.sh` and update these variables:

```bash
BUCKET_NAME="pigeonchess-app"  # Choose a unique bucket name
REGION="us-east-1"              # Choose your preferred AWS region
```

**Important:** S3 bucket names must be globally unique. Consider using something like:
- `pigeonchess-yourname`
- `pigeonchess-prod-2025`
- `your-domain-pigeonchess`

### Step 2: Run the deployment script

```bash
./deploy.sh
```

The script will:
1. Build your project (`npm run build`)
2. Create an S3 bucket (if it doesn't exist)
3. Configure static website hosting
4. Upload all files from the `dist` folder
5. Set proper caching headers
6. Configure public access permissions
7. Display your website URL

### Step 3: Access your website

Your site will be available at:
```
http://[BUCKET_NAME].s3-website-[REGION].amazonaws.com
```

For example:
```
http://pigeonchess-app.s3-website-us-east-1.amazonaws.com
```

## Manual Deployment (Alternative)

If you prefer to run commands manually:

```bash
# 1. Build the project
npm run build

# 2. Create S3 bucket
aws s3api create-bucket --bucket your-bucket-name --region us-east-1

# 3. Configure static website hosting
aws s3 website s3://your-bucket-name --index-document index.html --error-document index.html

# 4. Upload files
aws s3 sync dist/ s3://your-bucket-name --delete

# 5. Disable block public access
aws s3api put-public-access-block \
    --bucket your-bucket-name \
    --public-access-block-configuration \
    "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"

# 6. Apply bucket policy for public access
aws s3api put-bucket-policy --bucket your-bucket-name --policy '{
    "Version": "2012-10-17",
    "Statement": [{
        "Sid": "PublicReadGetObject",
        "Effect": "Allow",
        "Principal": "*",
        "Action": "s3:GetObject",
        "Resource": "arn:aws:s3:::your-bucket-name/*"
    }]
}'
```

## Updating Your Site

To update your deployed site, simply run:

```bash
./deploy.sh
```

The script will rebuild and sync only changed files.

## Adding HTTPS and Custom Domain

### Option 1: CloudFront (Recommended)

1. Create a CloudFront distribution:
```bash
aws cloudfront create-distribution \
    --origin-domain-name your-bucket-name.s3-website-us-east-1.amazonaws.com \
    --default-root-object index.html
```

2. CloudFront provides:
   - HTTPS support
   - Global CDN caching
   - Custom domain support
   - DDoS protection

### Option 2: Custom Domain with Route 53

1. Register or transfer your domain to Route 53
2. Create a CloudFront distribution (as above)
3. Add your custom domain as an alternate domain name
4. Request an SSL certificate via AWS Certificate Manager
5. Update Route 53 to point to your CloudFront distribution

## Cost Estimates

- **S3 Storage**: ~$0.023 per GB/month
- **S3 Requests**: ~$0.0004 per 1,000 GET requests
- **Data Transfer**: First 1 GB/month free, then ~$0.09 per GB
- **CloudFront** (optional): First 1 TB free for 12 months, then ~$0.085 per GB

For a small chess app, expect costs under $1-2/month without CloudFront.

## Troubleshooting

### Bucket name already exists
S3 bucket names are globally unique. Try a different name.

### Access Denied errors
Make sure you've configured AWS credentials:
```bash
aws configure
```

### 403 Forbidden when accessing the site
The bucket policy might not be applied correctly. Re-run the deployment script.

### Files not updating
The browser might be caching old files. Try:
- Hard refresh (Cmd+Shift+R on Mac, Ctrl+Shift+R on Windows)
- Clear browser cache
- Check that the deployment script ran successfully

## Security Notes

- This setup makes your website publicly accessible (as intended)
- The S3 bucket is configured for public read access only
- Consider adding CloudFront for additional security features
- Never commit AWS credentials to your repository

## Additional Resources

- [AWS S3 Static Website Hosting](https://docs.aws.amazon.com/AmazonS3/latest/userguide/WebsiteHosting.html)
- [AWS CloudFront Documentation](https://docs.aws.amazon.com/cloudfront/)
- [AWS CLI Command Reference](https://docs.aws.amazon.com/cli/)
