/**
 * FixxBuddy MongoDB Image URL Migration Script:
 * Updates image references in 'fixxbuddy_prod' (production) database to point to 'main/'.
 * Specifically:
 *  - /services/  -> /main/services/
 *  - /Website/   -> /main/Website/
 *  - /partner/   -> /main/partner/
 * Does NOT touch 'FixBuddy' (testing database), keeping test URLs intact.
 */

const mongoose = require('C:/Users/armst/Desktop/FIXXBUDDY/03_Backend/fixxbuddy_backend/node_modules/mongoose');
const dns = require('dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);
const path = require('path');
const fs = require('fs');
require('C:/Users/armst/Desktop/FIXXBUDDY/03_Backend/fixxbuddy_backend/node_modules/dotenv').config({
  path: 'C:/Users/armst/Desktop/FIXXBUDDY/03_Backend/fixxbuddy_backend/.env'
});

const envContent = fs.readFileSync('C:/Users/armst/Desktop/FIXXBUDDY/03_Backend/fixxbuddy_backend/.env', 'utf8');
let rawUri = '';
envContent.split('\n').forEach(line => {
  const m = line.trim().match(/^DB_URL\s*[:=]\s*(.*)$/);
  if (m) rawUri = m[1].trim();
});
const prodDbUri = rawUri.replace(/\s+/g, '').replace(/\/[a-zA-Z0-9_-]+(\?|$)/, '/fixxbuddy_prod$1');

function convertUrlToMain(url) {
  if (!url || typeof url !== 'string') return url;
  // If already has /main/, don't duplicate
  if (url.includes('.amazonaws.com/main/')) return url;

  // Replace .amazonaws.com/services/ -> .amazonaws.com/main/services/
  // Replace .amazonaws.com/Website/  -> .amazonaws.com/main/Website/
  // Replace .amazonaws.com/partner/  -> .amazonaws.com/main/partner/
  return url.replace(
    /(\.amazonaws\.com)\/(services|Website|partner)\//g,
    '$1/main/$2/'
  );
}

async function updateProdImageUrls() {
  console.log('=====================================================');
  console.log('  UPDATING IMAGE REFERENCES IN: fixxbuddy_prod');
  console.log('=====================================================\n');

  const conn = await mongoose.createConnection(prodDbUri).asPromise();
  const db = conn.db;

  if (db.databaseName !== 'fixxbuddy_prod') {
    throw new Error(`Safety Check Failed: Expected database 'fixxbuddy_prod', but connected to '${db.databaseName}'!`);
  }

  console.log(`Connected to database: ${db.databaseName}`);

  // 1. mainservices
  const mainServices = await db.collection('mainservices').find({}).toArray();
  let msUpdated = 0;
  for (const ms of mainServices) {
    if (ms.serviceImage) {
      const newImg = convertUrlToMain(ms.serviceImage);
      if (newImg !== ms.serviceImage) {
        await db.collection('mainservices').updateOne({ _id: ms._id }, { $set: { serviceImage: newImg } });
        msUpdated++;
      }
    }
  }
  console.log(`- mainservices: updated ${msUpdated} of ${mainServices.length} records.`);

  // 2. mainservicecategories
  const categories = await db.collection('mainservicecategories').find({}).toArray();
  let catUpdated = 0;
  for (const cat of categories) {
    if (cat.serviceImage) {
      const newImg = convertUrlToMain(cat.serviceImage);
      if (newImg !== cat.serviceImage) {
        await db.collection('mainservicecategories').updateOne({ _id: cat._id }, { $set: { serviceImage: newImg } });
        catUpdated++;
      }
    }
  }
  console.log(`- mainservicecategories: updated ${catUpdated} of ${categories.length} records.`);

  // 3. applicationtypes
  const appTypes = await db.collection('applicationtypes').find({}).toArray();
  let appUpdated = 0;
  for (const app of appTypes) {
    if (app.serviceImage) {
      const newImg = convertUrlToMain(app.serviceImage);
      if (newImg !== app.serviceImage) {
        await db.collection('applicationtypes').updateOne({ _id: app._id }, { $set: { serviceImage: newImg } });
        appUpdated++;
      }
    }
  }
  console.log(`- applicationtypes: updated ${appUpdated} of ${appTypes.length} records.`);

  // 4. servicetypes (serviceImage is an array of strings!)
  const serviceTypes = await db.collection('servicetypes').find({}).toArray();
  let stUpdated = 0;
  for (const st of serviceTypes) {
    if (Array.isArray(st.serviceImage) && st.serviceImage.length > 0) {
      const newArr = st.serviceImage.map(convertUrlToMain);
      const isChanged = newArr.some((url, idx) => url !== st.serviceImage[idx]);
      if (isChanged) {
        await db.collection('servicetypes').updateOne({ _id: st._id }, { $set: { serviceImage: newArr } });
        stUpdated++;
      }
    } else if (typeof st.serviceImage === 'string' && st.serviceImage) {
      const newImg = convertUrlToMain(st.serviceImage);
      if (newImg !== st.serviceImage) {
        await db.collection('servicetypes').updateOne({ _id: st._id }, { $set: { serviceImage: newImg } });
        stUpdated++;
      }
    }
  }
  console.log(`- servicetypes: updated ${stUpdated} of ${serviceTypes.length} records.`);

  // 5. users (imageUrl)
  const users = await db.collection('users').find({}).toArray();
  let uUpdated = 0;
  for (const u of users) {
    if (u.imageUrl) {
      const newImg = convertUrlToMain(u.imageUrl);
      if (newImg !== u.imageUrl) {
        await db.collection('users').updateOne({ _id: u._id }, { $set: { imageUrl: newImg } });
        uUpdated++;
      }
    }
  }
  console.log(`- users: updated ${uUpdated} of ${users.length} records.`);

  // 6. carts (serviceImage)
  const carts = await db.collection('carts').find({}).toArray();
  let cUpdated = 0;
  for (const c of carts) {
    if (c.serviceImage) {
      const newImg = convertUrlToMain(c.serviceImage);
      if (newImg !== c.serviceImage) {
        await db.collection('carts').updateOne({ _id: c._id }, { $set: { serviceImage: newImg } });
        cUpdated++;
      }
    }
  }
  console.log(`- carts: updated ${cUpdated} of ${carts.length} records.`);

  // Verification samples
  console.log('\n--- VERIFICATION SAMPLES FROM fixxbuddy_prod ---');
  const sampleMs = await db.collection('mainservices').findOne({ serviceImage: { $regex: /\/main\// } });
  console.log('Sample MainService:', sampleMs ? `${sampleMs.serviceName} -> ${sampleMs.serviceImage}` : 'None found');

  const sampleSt = await db.collection('servicetypes').findOne({ serviceImage: { $elemMatch: { $regex: /\/main\// } } });
  console.log('Sample ServiceType:', sampleSt ? `${sampleSt.serviceName || sampleSt.name} -> ${JSON.stringify(sampleSt.serviceImage)}` : 'None found');

  await conn.close();
  console.log('\nAll references in fixxbuddy_prod successfully updated to main/.');
}

updateProdImageUrls().catch(err => {
  console.error('Update failed:', err);
  process.exit(1);
});
