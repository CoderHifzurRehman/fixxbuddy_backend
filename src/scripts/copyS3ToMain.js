/**
 * FixxBuddy AWS S3 Migration Script:
 * Copies 'Website/', 'partner/', and 'services/' to 'main/Website/', 'main/partner/', 'main/services/'.
 * Leaves 'tasks/' and 'user/' untouched as testing data.
 */

const { S3Client, ListObjectsV2Command, CopyObjectCommand } = require('C:/Users/armst/Desktop/FIXXBUDDY/03_Backend/fixxbuddy_backend/node_modules/@aws-sdk/client-s3');
const path = require('path');
require('C:/Users/armst/Desktop/FIXXBUDDY/03_Backend/fixxbuddy_backend/node_modules/dotenv').config({
  path: 'C:/Users/armst/Desktop/FIXXBUDDY/03_Backend/fixxbuddy_backend/.env'
});

const bucket = process.env.AWS_BUCKET_NAME || 'fixxbuddy';
const region = process.env.AWS_REGION || 'ap-south-1';

const s3 = new S3Client({
  region: region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const FOLDERS_TO_COPY = ['Website', 'partner', 'services'];
const TARGET_PREFIX = 'main';
const CONCURRENCY = 15;

async function listAllKeysInFolder(folder) {
  let keys = [];
  let token = undefined;
  do {
    const res = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: folder + '/',
      ContinuationToken: token
    }));
    (res.Contents || []).forEach(c => {
      // Exclude folder placeholder keys (zero-byte keys ending with slash)
      if (c.Key && !c.Key.endsWith('/')) {
        keys.push(c.Key);
      }
    });
    token = res.NextContinuationToken;
  } while (token);
  return keys;
}

async function copyObjectWithRetry(sourceKey, retries = 3) {
  const targetKey = `${TARGET_PREFIX}/${sourceKey}`;
  const encodedSource = `${bucket}/${sourceKey.split('/').map(encodeURIComponent).join('/')}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await s3.send(new CopyObjectCommand({
        Bucket: bucket,
        CopySource: encodedSource,
        Key: targetKey,
        ACL: 'public-read'
      }));
      return { success: true, sourceKey, targetKey };
    } catch (err) {
      if (attempt === retries) {
        return { success: false, sourceKey, targetKey, error: err.message };
      }
      await new Promise(r => setTimeout(r, 500 * attempt));
    }
  }
}

async function runS3Migration() {
  console.log('=====================================================');
  console.log(`  S3 COPY: ${FOLDERS_TO_COPY.join(', ')} -> ${TARGET_PREFIX}/`);
  console.log(`  Bucket: ${bucket} (Region: ${region})`);
  console.log('=====================================================\n');

  let allKeys = [];
  for (const folder of FOLDERS_TO_COPY) {
    console.log(`[Scanning] Scanning folder '${folder}/'...`);
    const keys = await listAllKeysInFolder(folder);
    console.log(` - Found ${keys.length} files in '${folder}/'.`);
    allKeys.push(...keys);
  }

  console.log(`\nTotal files to copy to '${TARGET_PREFIX}/': ${allKeys.length}`);
  console.log('Starting parallel server-side copy...\n');

  let completed = 0;
  let failures = [];

  for (let i = 0; i < allKeys.length; i += CONCURRENCY) {
    const chunk = allKeys.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map(k => copyObjectWithRetry(k)));
    
    results.forEach(r => {
      if (!r.success) failures.push(r);
    });

    completed += chunk.length;
    process.stdout.write(`Progress: ${completed} / ${allKeys.length} copied (${Math.round((completed / allKeys.length) * 100)}%)\r`);
  }

  console.log(`\n\n=====================================================`);
  console.log('  S3 COPY COMPLETE');
  console.log('=====================================================');
  console.log(`Successfully copied: ${completed - failures.length} files`);
  if (failures.length > 0) {
    console.warn(`Failed copies (${failures.length}):`);
    failures.forEach(f => console.error(` - ${f.sourceKey}: ${f.error}`));
  } else {
    console.log('Zero failures! All files successfully copied to main/.');
  }
}

runS3Migration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
