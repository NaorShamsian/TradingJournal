import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Trade from '../models/Trade';
import SyncStatus from '../models/SyncStatus';
import Settings from '../models/Settings';

dotenv.config();

const run = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      console.error('ERROR: MONGO_URI is missing from env.');
      process.exit(1);
    }

    console.log('Connecting to database to clear data...');
    await mongoose.connect(mongoUri);
    console.log('Connected.');

    // Delete all trades
    console.log('Deleting all trades...');
    await Trade.deleteMany({});

    // Delete all sync status logs
    console.log('Resetting sync status logs...');
    await SyncStatus.deleteMany({});

    // Reset default settings
    console.log('Resetting to default settings...');
    await Settings.deleteMany({});
    const defaultSettings = new Settings({
      defaultBalance: 10000, // Default Starting Balance is $10,000
      timezone: 'UTC',
      currency: 'USD',
      strategies: ['Breakout', 'Support/Resistance', 'ICT/SMC', 'Scalping', 'Trend Following'],
      riskPerTradePercent: 1.0,
    });
    await defaultSettings.save();

    console.log('Database successfully cleared! Ready for real MT5 trades.');
    process.exit(0);
  } catch (error) {
    console.error('Failed to clear database:', error);
    process.exit(1);
  }
};

run();
