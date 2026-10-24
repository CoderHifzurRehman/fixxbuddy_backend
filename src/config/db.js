const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const connectDB = async () => {
  try {
    const rawUri = process.env.DB_URL || process.env.MONGODB_URI;
    if (!rawUri) {
      throw new Error('[Database Error] Neither DB_URL nor MONGODB_URI is defined in environment variables.');
    }

    const sanitizedUri = rawUri.trim().replace(/\s+/g, '');
    await mongoose.connect(sanitizedUri);

    const dbName = mongoose.connection.db.databaseName;
    const currentEnv = (process.env.NODE_ENV || 'development').toLowerCase();

    // Guardrail: Production environment MUST NOT point to the testing database ('FixBuddy')
    if (currentEnv === 'production' && dbName.toLowerCase() === 'fixbuddy') {
      console.error(`[FATAL SECURITY ERROR] NODE_ENV is 'production' but connected database is '${dbName}' (Testing DB). Halting server immediately!`);
      process.exit(1);
    }

    // Guardrail: Testing environment MUST NOT point to the production database ('fixxbuddy_prod')
    if ((currentEnv === 'testing' || currentEnv === 'test') && dbName.toLowerCase().includes('prod')) {
      console.error(`[FATAL SECURITY ERROR] NODE_ENV is '${currentEnv}' but connected database is '${dbName}' (Production DB). Halting server immediately!`);
      process.exit(1);
    }

    console.log(`[Database] MongoDB connected successfully to '${dbName}' [Environment: ${currentEnv}]`);
  } catch (err) {
    console.error('[Database Connection Error]:', err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
