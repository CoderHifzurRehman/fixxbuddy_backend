/**
 * FixxBuddy Admin Migration Script:
 * Safely copies all admin users from 'FixBuddy' (Beta) to 'fixxbuddy_prod' (Production).
 * Preserves password hashes, roles, names, addresses, and contact numbers.
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

async function copyAdminsToProd() {
  console.log('=====================================================');
  console.log('  COPY ADMIN USERS FROM FixBuddy TO fixxbuddy_prod');
  console.log('=====================================================\n');

  console.log('[1/4] Connecting to FixBuddy (Beta)...');
  const testConn = await mongoose.createConnection(testDbUri).asPromise();
  const testDb = testConn.db;

  console.log('[2/4] Connecting to fixxbuddy_prod (Production)...');
  const prodConn = await mongoose.createConnection(prodDbUri).asPromise();
  const prodDb = prodConn.db;

  if (prodDb.databaseName !== 'fixxbuddy_prod') {
    throw new Error(`Target is not fixxbuddy_prod (connected to ${prodDb.databaseName})`);
  }

  // 1. Find all admins in FixBuddy
  console.log('\n[3/4] Finding admin users in FixBuddy...');
  const admins = await testDb.collection('users').find({
    role: { $in: ['admin', 'subadmin', 'ADMIN', 'SUBADMIN'] }
  }).toArray();

  console.log(`Found ${admins.length} admin accounts in FixBuddy:`);
  admins.forEach(a => {
    console.log(` - [${a.role}] ${a.email} (${a.firstName} ${a.lastName})`);
  });

  // 2. Copy/Upsert into fixxbuddy_prod
  console.log('\n[4/4] Copying admin accounts to fixxbuddy_prod...');
  let copiedCount = 0;
  for (const admin of admins) {
    const filter = { email: admin.email };
    const updateDoc = {
      $set: {
        firstName: admin.firstName,
        lastName: admin.lastName,
        email: admin.email,
        password: admin.password, // bcrypt hash preserved
        role: admin.role.toLowerCase(), // normalize to 'admin' / 'subadmin'
        isActive: admin.isActive !== undefined ? admin.isActive : true,
        isEmailVerified: admin.isEmailVerified !== undefined ? admin.isEmailVerified : true,
        imageUrl: admin.imageUrl || "",
        addresses: admin.addresses || [],
        contactNumbers: admin.contactNumbers || [],
        updatedAt: new Date()
      },
      $setOnInsert: {
        createdAt: admin.createdAt || new Date()
      }
    };

    const res = await prodDb.collection('users').updateOne(filter, updateDoc, { upsert: true });
    if (res.upsertedCount > 0) {
      console.log(` + Inserted new admin in prod: ${admin.email}`);
    } else {
      console.log(` ~ Updated existing admin in prod: ${admin.email}`);
    }
    copiedCount++;
  }

  console.log(`\nSuccessfully synced ${copiedCount} admin accounts into fixxbuddy_prod.`);

  // Verify all users in prod
  console.log('\n=====================================================');
  console.log('  CURRENT USERS IN fixxbuddy_prod:');
  console.log('=====================================================');
  const allProdUsers = await prodDb.collection('users').find({}).toArray();
  allProdUsers.forEach(u => {
    console.log(` * [${u.role}] ${u.email} (${u.firstName} ${u.lastName}) | Active: ${u.isActive}`);
  });

  await testConn.close();
  await prodConn.close();
  console.log('\nDone!');
}

copyAdminsToProd().catch(err => {
  console.error('Error copying admins:', err);
  process.exit(1);
});
