/**
 * FixxBuddy Partner Migration Script:
 * Safely transfers all current partners from 'FixBuddy' (Beta) to 'fixxbuddy_prod' (Main).
 * - Preserves _id, partnerId, passwords, roles, phone numbers, configs, and details.
 * - Converts image URLs to point to 'main/partner/' in S3.
 * - Syncs the 'partnerId' counter sequence in 'fixxbuddy_prod' to prevent ID collisions.
 */

const mongoose = require('C:/Users/armst/Desktop/FIXXBUDDY/03_Backend/fixxbuddy_backend/node_modules/mongoose');
const dns = require('dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);
const fs = require('fs');

const envContent = fs.readFileSync('C:/Users/armst/Desktop/FIXXBUDDY/03_Backend/fixxbuddy_backend/.env', 'utf8');
let rawUri = '';
envContent.split('\n').forEach(line => {
  const m = line.trim().match(/^DB_URL\s*[:=]\s*(.*)$/);
  if (m) rawUri = m[1].trim();
});

const cleanUri = rawUri.replace(/\s+/g, '');
const testDbUri = cleanUri.replace(/\/[a-zA-Z0-9_-]+(\?|$)/, '/FixBuddy$1');
const prodDbUri = cleanUri.replace(/\/[a-zA-Z0-9_-]+(\?|$)/, '/fixxbuddy_prod$1');

function convertUrlToMain(url) {
  if (!url || typeof url !== 'string') return url;
  if (url.includes('.amazonaws.com/main/')) return url;
  return url.replace(
    /(\.amazonaws\.com)\/(services|Website|partner)\//g,
    '$1/main/$2/'
  );
}

async function copyPartnersToProd() {
  console.log('=====================================================');
  console.log('  TRANSFER PARTNERS: FixBuddy -> fixxbuddy_prod');
  console.log('=====================================================\n');

  console.log('[1/4] Connecting to FixBuddy (Beta)...');
  const testConn = await mongoose.createConnection(testDbUri).asPromise();
  const testDb = testConn.db;

  console.log('[2/4] Connecting to fixxbuddy_prod (Main)...');
  const prodConn = await mongoose.createConnection(prodDbUri).asPromise();
  const prodDb = prodConn.db;

  if (prodDb.databaseName !== 'fixxbuddy_prod') {
    throw new Error(`Safety Check Failed: Expected database 'fixxbuddy_prod', but connected to '${prodDb.databaseName}'!`);
  }

  // 1. Fetch all partners from beta
  console.log('\n[3/4] Reading partners from FixBuddy (Beta)...');
  const betaPartners = await testDb.collection('partners').find({}).toArray();
  console.log(`Found ${betaPartners.length} partners in FixBuddy.`);

  let maxSeq = 0;
  let copiedCount = 0;

  console.log('\n[4/4] Upserting partners into fixxbuddy_prod...');
  for (const p of betaPartners) {
    // Extract sequence number from partnerId (e.g. "FBP_0098" -> 98)
    if (p.partnerId) {
      const match = p.partnerId.match(/\d+$/);
      if (match) {
        const seqNum = parseInt(match[0], 10);
        if (seqNum > maxSeq) maxSeq = seqNum;
      }
    }

    // Convert image URLs to main/
    const docToInsert = { ...p };
    if (docToInsert.profilePic) docToInsert.profilePic = convertUrlToMain(docToInsert.profilePic);
    if (docToInsert.aadharFrontPic) docToInsert.aadharFrontPic = convertUrlToMain(docToInsert.aadharFrontPic);
    if (docToInsert.aadharBackPic) docToInsert.aadharBackPic = convertUrlToMain(docToInsert.aadharBackPic);
    if (docToInsert.PanPic) docToInsert.PanPic = convertUrlToMain(docToInsert.PanPic);
    if (docToInsert.pcc) docToInsert.pcc = convertUrlToMain(docToInsert.pcc);

    // Upsert into prod
    const filter = { _id: p._id };
    await prodDb.collection('partners').replaceOne(filter, docToInsert, { upsert: true });
    console.log(` - Transferred partner: [${p.role}] ${p.partnerId || 'NO_ID'} | ${p.email} (${p.fullName})`);
    copiedCount++;
  }

  // Sync partnerId counter in production
  console.log(`\nMax sequence found among transferred partners: ${maxSeq}`);
  const currentProdCounter = await prodDb.collection('counters').findOne({ _id: 'partnerId' });
  const currentProdSeq = currentProdCounter ? currentProdCounter.seq || 0 : 0;
  const newSeq = Math.max(maxSeq, currentProdSeq);

  await prodDb.collection('counters').updateOne(
    { _id: 'partnerId' },
    { $set: { seq: newSeq } },
    { upsert: true }
  );
  console.log(`Updated fixxbuddy_prod counter 'partnerId' to seq: ${newSeq} (Next registered partner will be FBP_${String(newSeq + 1).padStart(4, '0')}).`);

  // Final verification
  console.log('\n=====================================================');
  console.log('  VERIFICATION IN fixxbuddy_prod');
  console.log('=====================================================');
  const prodPartnerCount = await prodDb.collection('partners').countDocuments();
  console.log(`Total partners in fixxbuddy_prod: ${prodPartnerCount}`);

  const sampleProdPartner = await prodDb.collection('partners').findOne({ partnerId: 'FBP_0097' });
  if (sampleProdPartner) {
    console.log('\nSample Manager (FBP_0097) in fixxbuddy_prod:');
    console.log(` - ID: ${sampleProdPartner.partnerId}`);
    console.log(` - Email: ${sampleProdPartner.email}`);
    console.log(` - Role: ${sampleProdPartner.role}`);
    console.log(` - ProfilePic: ${sampleProdPartner.profilePic}`);
  }

  await testConn.close();
  await prodConn.close();

  console.log('\nPartner transfer completed successfully!');
}

if (require.main === module) {
  copyPartnersToProd().catch(err => {
    console.error('Transfer failed:', err);
    process.exit(1);
  });
}

module.exports = copyPartnersToProd;
