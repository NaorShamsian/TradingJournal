import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Trade from '../models/Trade';
import SyncStatus from '../models/SyncStatus';
import Settings from '../models/Settings';

dotenv.config();

const mockSymbols = ['EURUSD', 'GBPUSD', 'XAUUSD', 'BTCUSD', 'US30'];
const mockStrategies = ['Breakout', 'Support/Resistance', 'ICT/SMC', 'Scalping', 'Trend Following'];
const mockEmotions = ['Disciplined', 'Patient', 'Greedy', 'FOMO', 'Anxious', 'Calm'];
const mockMistakeTags = ['Chasing Price', 'Early Exit', 'Overleveraged', 'No Stop Loss', 'Rule Breaker'];
const mockSessions: ('Asia' | 'London' | 'New York' | 'Other')[] = ['Asia', 'London', 'New York'];

const generateMockTrades = (numTrades: number) => {
  const trades = [];
  const now = new Date();
  
  // Starting from 30 days ago
  let currentTime = new Date();
  currentTime.setDate(now.getDate() - 30);

  for (let i = 0; i < numTrades; i++) {
    const symbol = mockSymbols[Math.floor(Math.random() * mockSymbols.length)];
    const strategy = mockStrategies[Math.floor(Math.random() * mockStrategies.length)];
    const session = mockSessions[Math.floor(Math.random() * mockSessions.length)];
    const type = Math.random() > 0.4 ? 'BUY' : 'SELL';
    const volume = Math.random() > 0.7 ? 1.5 : Math.random() > 0.3 ? 0.5 : 0.1;
    
    // Set timing
    currentTime = new Date(currentTime.getTime() + (8 * 3600000) + (Math.random() * 12 * 3600000)); // advance time
    if (currentTime.getDay() === 0 || currentTime.getDay() === 6) {
      currentTime.setDate(currentTime.getDate() + 2); // Skip weekends
    }
    
    const openTime = new Date(currentTime);
    const durationMin = Math.floor(Math.random() * 120) + 5; // 5 mins to 2 hours
    const closeTime = new Date(openTime.getTime() + durationMin * 60000);

    // Mock pricing
    let entryPrice = 0;
    if (symbol === 'EURUSD') entryPrice = 1.08000 + Math.random() * 0.02;
    else if (symbol === 'GBPUSD') entryPrice = 1.25000 + Math.random() * 0.03;
    else if (symbol === 'XAUUSD') entryPrice = 2300.00 + Math.random() * 80;
    else if (symbol === 'BTCUSD') entryPrice = 65000.00 + Math.random() * 3000;
    else if (symbol === 'US30') entryPrice = 39000.00 + Math.random() * 400;

    const pipSize = (symbol === 'XAUUSD' || symbol === 'US30') ? 0.1 : symbol === 'BTCUSD' ? 1.0 : 0.0001;
    const isWin = Math.random() > 0.45; // 55% win rate

    let exitPrice = entryPrice;
    let profit = 0;
    let stopLoss = entryPrice - (type === 'BUY' ? 150 * pipSize : -150 * pipSize);
    let takeProfit = entryPrice + (type === 'BUY' ? 300 * pipSize : -300 * pipSize);

    if (isWin) {
      const pips = Math.floor(Math.random() * 250) + 50;
      exitPrice = entryPrice + (type === 'BUY' ? pips * pipSize : -pips * pipSize);
      profit = pips * volume * (symbol === 'BTCUSD' ? 0.1 : symbol === 'XAUUSD' ? 10 : 10);
    } else {
      const pips = Math.floor(Math.random() * 150) + 20;
      exitPrice = entryPrice - (type === 'BUY' ? pips * pipSize : -pips * pipSize);
      profit = -pips * volume * (symbol === 'BTCUSD' ? 0.1 : symbol === 'XAUUSD' ? 10 : 10);
    }

    const commission = -volume * 3.5;
    const swap = Math.random() > 0.8 ? -volume * 1.5 : 0;
    const netProfit = Number((profit + commission + swap).toFixed(2));

    // Calculate RR
    const slDist = Math.abs(entryPrice - stopLoss);
    const profitDist = Math.abs(exitPrice - entryPrice);
    const rr = slDist > 0 ? Number((profitDist / slDist).toFixed(2)) * (netProfit > 0 ? 1 : -1) : undefined;

    // Emotions and mistakes
    const followedRules = Math.random() > 0.3;
    const mistake = !followedRules || Math.random() > 0.7;
    const emotion = mockEmotions[Math.floor(Math.random() * mockEmotions.length)];
    const mistakeTags = mistake ? [mockMistakeTags[Math.floor(Math.random() * mockMistakeTags.length)]] : [];
    const selfRating = followedRules ? Math.floor(Math.random() * 3) + 8 : Math.floor(Math.random() * 5) + 2; // 8-10 if rules, 2-6 if not

    trades.push({
      mt5DealId: `MOCK_DEAL_${100000 + i}`,
      mt5OrderId: `MOCK_ORDER_${200000 + i}`,
      positionId: `MOCK_POS_${300000 + i}`,
      symbol,
      type,
      volume,
      openTime,
      closeTime,
      entryPrice: Number(entryPrice.toFixed(5)),
      exitPrice: Number(exitPrice.toFixed(5)),
      stopLoss: Number(stopLoss.toFixed(5)),
      takeProfit: Number(takeProfit.toFixed(5)),
      profit: Number(profit.toFixed(2)),
      commission: Number(commission.toFixed(2)),
      swap: Number(swap.toFixed(2)),
      netProfit,
      rr,
      durationMinutes: durationMin,
      strategy,
      session,
      emotion,
      mistake,
      mistakeTags,
      notes: isWin 
        ? `Solid trade execution. Standard ${strategy} pattern on ${session} session. Trend was in our favor.`
        : `Got stopped out. Market reversed sharply. ${mistake ? 'Did not wait for full confirmation.' : 'Executed correctly, trade just failed.'}`,
      entryReason: `Spike in volume on key support retest.`,
      exitReason: isWin ? `Reached projected take profit target.` : `Hit stop loss.`,
      followedRules,
      selfRating,
    });
  }
  return trades;
};

const run = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      console.error('ERROR: MONGO_URI environment variable is missing.');
      process.exit(1);
    }

    console.log('Connecting to database...');
    await mongoose.connect(mongoUri);
    console.log('Connected.');

    // Clear existing
    console.log('Clearing old database records...');
    await Trade.deleteMany({});
    await SyncStatus.deleteMany({});
    await Settings.deleteMany({});

    // Seed Settings
    console.log('Seeding default Settings...');
    const defaultSettings = new Settings({
      defaultBalance: 15000, // $15,000 Starting Balance
      timezone: 'UTC',
      currency: 'USD',
      strategies: mockStrategies,
      riskPerTradePercent: 1.5,
    });
    await defaultSettings.save();

    // Seed SyncStatus
    console.log('Seeding initial SyncStatus...');
    const defaultSync = new SyncStatus({
      status: 'stopped',
      lastSyncTime: new Date(),
      lastSuccessfulSyncTime: new Date(),
      importedCount: 40,
      skippedDuplicates: 0,
      triggerManualSync: false,
    });
    await defaultSync.save();

    // Generate and seed trades
    console.log('Generating 40 mock trades...');
    const mockTradesData = generateMockTrades(40);
    
    console.log('Writing trades to database...');
    await Trade.insertMany(mockTradesData);

    console.log('Database successfully seeded!');
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
};

run();
