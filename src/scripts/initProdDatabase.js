/**
 * FixxBuddy Production Database Initialization Script
 * 
 * Safely creates and seeds the 'fixxbuddy_prod' database from 'FixBuddy'.
 * Copies only clean master service catalogues and initializes indexes and the primary administrator.
 * DOES NOT copy test users, test partners, test bookings (carts), or test operational records.
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dns = require('dns');
try {
  dns.setServers(['1.1.1.1', '8.8.8.8']);
} catch (e) {}

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const SOURCE_DB_NAME = 'FixBuddy';
const TARGET_DB_NAME = 'fixxbuddy_prod';

async function initProdDatabase() {
  console.log('=====================================================');
  console.log('   FixxBuddy Production Database Initialization');
  console.log('=====================================================');

  const rawUri = process.env.DB_URL || process.env.MONGODB_URI;
  if (!rawUri) {
    console.error('ERROR: Neither DB_URL nor MONGODB_URI found in environment variables.');
    process.exit(1);
  }

  const cleanUri = rawUri.trim().replace(/\s+/g, '');
  
  // Build Source and Target URIs
  // Ensure the database name is replaced accurately
  const sourceUri = cleanUri.replace(/\/[a-zA-Z0-9_-]+(\?|$)/, '/' + SOURCE_DB_NAME + '$1');
  const targetUri = cleanUri.replace(/\/[a-zA-Z0-9_-]+(\?|$)/, '/' + TARGET_DB_NAME + '$1');

  console.log('Source (Testing) Database:', SOURCE_DB_NAME);
  console.log('Target (Production) Database:', TARGET_DB_NAME);

  // 1. Connect to Source
  console.log('\n[1/6] Connecting to testing database (' + SOURCE_DB_NAME + ') to read master catalogue...');
  const sourceConn = await mongoose.createConnection(sourceUri).asPromise();
  const sourceDb = sourceConn.db;
  console.log('Connected to source DB:', sourceDb.databaseName);

  // 2. Connect to Target
  console.log('\n[2/6] Connecting to production database (' + TARGET_DB_NAME + ')...');
  const targetConn = await mongoose.createConnection(targetUri).asPromise();
  const targetDb = targetConn.db;
  console.log('Connected to target DB:', targetDb.databaseName);

  if (targetDb.databaseName !== TARGET_DB_NAME) {
    throw new Error('FATAL: Target database name is not ' + TARGET_DB_NAME + ' (was ' + targetDb.databaseName + ')');
  }

  // Safety check: ensure target does not already have bookings
  const existingTargetCarts = await targetDb.collection('carts').countDocuments();
  if (existingTargetCarts > 0) {
    console.warn('WARNING: Target database already contains ' + existingTargetCarts + ' bookings! Aborting initialization to protect existing production data.');
    await sourceConn.close();
    await targetConn.close();
    process.exit(0);
  }

  // 3. Copy Clean Service Catalogues
  console.log('\n[3/6] Seeding clean master service catalogues...');

  // A. Main Services (filter out test services)
  const rawMainServices = await sourceDb.collection('mainservices').find({}).toArray();
  const testIds = new Set();
  const cleanMainServices = rawMainServices.filter(s => {
    const isTest = (s.serviceName && s.serviceName.toLowerCase().includes('testing')) ||
                   (s.serviceHeading && s.serviceHeading.toLowerCase().includes('hgyhgjb'));
    if (isTest) {
      testIds.add(String(s._id));
      console.log(' - Excluded test service record: ' + s.serviceName);
      return false;
    }
    return true;
  });

  if (cleanMainServices.length > 0) {
    await targetDb.collection('mainservices').deleteMany({});
    await targetDb.collection('mainservices').insertMany(cleanMainServices);
    console.log(' - Inserted ' + cleanMainServices.length + ' clean main services into production.');
  }

  // B. Main Service Categories
  const rawCategories = await sourceDb.collection('mainservicecategories').find({}).toArray();
  const cleanCategories = rawCategories.filter(c => !testIds.has(String(c.mainServiceId)));
  if (cleanCategories.length > 0) {
    await targetDb.collection('mainservicecategories').deleteMany({});
    await targetDb.collection('mainservicecategories').insertMany(cleanCategories);
    console.log(' - Inserted ' + cleanCategories.length + ' categories into production.');
  }

  // C. Service Types
  const rawServiceTypes = await sourceDb.collection('servicetypes').find({}).toArray();
  const cleanServiceTypes = rawServiceTypes.filter(st => !testIds.has(String(st.mainServiceId)));
  if (cleanServiceTypes.length > 0) {
    await targetDb.collection('servicetypes').deleteMany({});
    await targetDb.collection('servicetypes').insertMany(cleanServiceTypes);
    console.log(' - Inserted ' + cleanServiceTypes.length + ' service types into production.');
  }

  // D. Application Types
  const appTypes = await sourceDb.collection('applicationtypes').find({}).toArray();
  if (appTypes.length > 0) {
    await targetDb.collection('applicationtypes').deleteMany({});
    await targetDb.collection('applicationtypes').insertMany(appTypes);
    console.log(' - Inserted ' + appTypes.length + ' application types into production.');
  }

  // E. Rate Cards
  const rateCards = await sourceDb.collection('ratecards').find({}).toArray();
  if (rateCards.length > 0) {
    await targetDb.collection('ratecards').deleteMany({});
    await targetDb.collection('ratecards').insertMany(rateCards);
    console.log(' - Inserted ' + rateCards.length + ' rate cards into production.');
  }

  // F. Geographical Hubs
  const hubs = await sourceDb.collection('hubs').find({}).toArray();
  if (hubs.length > 0) {
    await targetDb.collection('hubs').deleteMany({});
    await targetDb.collection('hubs').insertMany(hubs);
    console.log(' - Inserted ' + hubs.length + ' geographical hubs into production.');
  }

  // G. Coupons
  const coupons = await sourceDb.collection('coupons').find({}).toArray();
  if (coupons.length > 0) {
    await targetDb.collection('coupons').deleteMany({});
    await targetDb.collection('coupons').insertMany(coupons);
    console.log(' - Inserted ' + coupons.length + ' coupons into production.');
  }

  // H. Expertise
  const expertise = await sourceDb.collection('expertise').find({}).toArray();
  if (expertise.length > 0) {
    await targetDb.collection('expertise').deleteMany({});
    await targetDb.collection('expertise').insertMany(expertise);
    console.log(' - Inserted ' + expertise.length + ' expertise tags into production.');
  }

  // 4. Initialize Sequences
  console.log('\n[4/6] Initializing partner ID sequence counter...');
  await targetDb.collection('counters').updateOne(
    { _id: 'partnerId' },
    { $set: { seq: 0 } },
    { upsert: true }
  );
  console.log(' - Sequence counter initialized: partnerId sequence set to 0 (First technician will be FBP_0001).');

  // 5. Initialize Production Administrator
  console.log('\n[5/6] Initializing primary production administrator account...');
  const adminEmail = (process.env.PROD_ADMIN_EMAIL || 'admin@fixxbuddy.com').toLowerCase().trim();
  const adminPasswordPlain = process.env.PROD_ADMIN_PASSWORD || 'AdminFixxBuddy@2026';
  const hashedPassword = await bcrypt.hash(adminPasswordPlain, 10);

  const adminDoc = {
    firstName: process.env.PROD_ADMIN_FIRSTNAME || 'FixxBuddy',
    lastName: process.env.PROD_ADMIN_LASTNAME || 'Administrator',
    email: adminEmail,
    password: hashedPassword,
    role: 'admin',
    isActive: true,
    isEmailVerified: true,
    addresses: [
      {
        street: 'FixxBuddy HQ',
        city: 'New Delhi',
        state: 'Delhi',
        country: 'India',
        postalCode: '110001',
        isPrimary: true,
        label: 'work'
      }
    ],
    contactNumbers: [
      {
        number: '9999999999',
        isPrimary: true,
        label: 'work'
      }
    ],
    createdAt: new Date(),
    updatedAt: new Date()
  };

  await targetDb.collection('users').updateOne(
    { email: adminEmail },
    { $set: adminDoc },
    { upsert: true }
  );
  console.log(' - Primary Admin Created/Updated: ' + adminEmail + ' (Role: admin, Status: Active & Verified)');

  // 6. Build Indexes
  console.log('\n[6/6] Creating MongoDB indexes on ' + TARGET_DB_NAME + '...');
  
  // Users indexes
  await targetDb.collection('users').createIndex({ email: 1 }, { unique: true });
  await targetDb.collection('users').createIndex({ firstName: 1, lastName: 1 });
  await targetDb.collection('users').createIndex({ employeeCode: 1 });
  await targetDb.collection('users').createIndex({ status: 1 });

  // Partners indexes
  await targetDb.collection('partners').createIndex({ partnerId: 1 }, { unique: true, sparse: true });
  await targetDb.collection('partners').createIndex({ email: 1 }, { unique: true });
  await targetDb.collection('partners').createIndex({ aadharCardNumber: 1 }, { unique: true, sparse: true });
  await targetDb.collection('partners').createIndex({ teamId: 1 });
  await targetDb.collection('partners').createIndex({ teamLeaderId: 1 });

  // Carts / Bookings indexes
  await targetDb.collection('carts').createIndex({ userId: 1 });
  await targetDb.collection('carts').createIndex({ status: 1 });
  await targetDb.collection('carts').createIndex({ orderId: 1 }, { unique: true, sparse: true });
  await targetDb.collection('carts').createIndex({ assignedPartner: 1, scheduledDate: 1, status: 1 });
  await targetDb.collection('carts').createIndex({ status: 1, scheduledDate: 1 });
  await targetDb.collection('carts').createIndex({ createdAt: -1 });

  // Hubs indexes
  await targetDb.collection('hubs').createIndex({ name: 1 });
  await targetDb.collection('hubs').createIndex({ pincodes: 1 });

  // Coupons index
  await targetDb.collection('coupons').createIndex({ code: 1 }, { unique: true, sparse: true });

  // Notifications indexes
  await targetDb.collection('notifications').createIndex({ userId: 1 });
  await targetDb.collection('notifications').createIndex({ userId: 1, createdAt: -1 });

  // Teams indexes
  await targetDb.collection('teams').createIndex({ managerId: 1 });
  await targetDb.collection('teams').createIndex({ teamLeaderId: 1 });
  await targetDb.collection('teams').createIndex({ status: 1 });

  // Audit logs indexes
  await targetDb.collection('auditlogs').createIndex({ action: 1 });
  await targetDb.collection('auditlogs').createIndex({ createdAt: -1 });

  console.log(' - Indexes successfully built on production collections.');

  // Final Production Verification Summary
  console.log('\n=====================================================');
  console.log('   PRODUCTION DATABASE INITIALIZATION COMPLETE');
  console.log('=====================================================');
  const targetCols = await targetDb.listCollections().toArray();
  for (const c of targetCols) {
    const cnt = await targetDb.collection(c.name).countDocuments();
    console.log(' - ' + c.name.padEnd(25) + ': ' + cnt + ' documents');
  }

  const prodUsers = await targetDb.collection('users').find({}).toArray();
  console.log('\nProduction Users count: ' + prodUsers.length);
  prodUsers.forEach(u => console.log('   * [' + u.role + '] ' + u.email + ' (' + u.firstName + ' ' + u.lastName + ')'));

  const prodPartners = await targetDb.collection('partners').countDocuments();
  console.log('Production Partners count: ' + prodPartners + ' (Must be 0)');

  const prodCarts = await targetDb.collection('carts').countDocuments();
  console.log('Production Bookings/Carts count: ' + prodCarts + ' (Must be 0)');

  console.log('\nTesting Database (' + SOURCE_DB_NAME + ') was untouched and preserved in full.');
  
  await sourceConn.close();
  await targetConn.close();
  console.log('Done!');
}

initProdDatabase().catch(err => {
  console.error('Fatal initialization error:', err);
  process.exit(1);
});
