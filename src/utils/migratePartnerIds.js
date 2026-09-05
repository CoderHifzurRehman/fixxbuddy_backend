const mongoose = require('mongoose');
const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

require('dotenv').config();
const Partner = require('../models/partner.model');

/**
 * Migration script to update existing partnerId values from FB_partner_XXXX to FBP_XXXX.
 */
const migratePartnerIds = async () => {
  try {
    if (!process.env.DB_URL) {
      console.error('DB_URL missing in environment variables');
      process.exit(1);
    }
    await mongoose.connect(process.env.DB_URL);
    console.log('Connected to DB');

    const partnersToUpdate = await Partner.find({ partnerId: { $regex: /^FB_partner_/ } });
    console.log(`Found ${partnersToUpdate.length} partners with FB_partner_ prefix.`);

    let updatedCount = 0;
    for (const partner of partnersToUpdate) {
      const oldId = partner.partnerId;
      const newId = oldId.replace(/^FB_partner_/, 'FBP_');
      await Partner.updateOne({ _id: partner._id }, { $set: { partnerId: newId } });
      console.log(`Updated: ${oldId} -> ${newId}`);
      updatedCount++;
    }

    console.log(`Migration completed successfully. Updated ${updatedCount} records.`);
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  migratePartnerIds();
}

module.exports = migratePartnerIds;
