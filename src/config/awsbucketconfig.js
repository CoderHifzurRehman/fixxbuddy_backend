// Set up AWS S3
require('dotenv').config();
module.exports = {
  // AWS S3 Configuration (use your own credentials and information)
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  bucketName: process.env.AWS_BUCKET_NAME,
  region: process.env.AWS_REGION || 'ap-south-1', // Choose your AWS region
  imagebaseurl: process.env.AWS_IMAGE_BASE_URL || 'https://fixxbuddy.s3.amazonaws.com', // Base URL to access images
};
