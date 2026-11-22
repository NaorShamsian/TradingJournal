import { Request, Response } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import MT5Account from '../models/MT5Account';
import Trade from '../models/Trade';
import BalanceOperation from '../models/BalanceOperation';
import { runMT5Sync } from '../services/mt5Sync';

// Never send stored MT5 passwords back to the browser
const toPublic = (acc: any) => {
  const obj = typeof acc.toObject === 'function' ? acc.toObject() : { ...acc };
  delete obj.password;
  return obj;
};

const BALANCE_SOURCES = ['manual', 'mt5_first_deposit', 'mt5_net_deposits'];
const SYNC_DEPTHS = ['week', 'month', 'year', 'all'];

// Helper to run MT5 connection validation via Python script
const validateMT5Credentials = (
  login: number,
  password?: string,
  server?: string,
  terminalPath?: string
): Promise<void> => {
  return new Promise((resolve, reject) => {
    // Resolve the path to sync/validate_mt5.py
    const scriptPath = path.resolve(__dirname, '../../../sync/validate_mt5.py');
    
    // Spawn python process
    const pyProcess = spawn(process.env.PYTHON_PATH || 'python', [scriptPath]);
    
    let stdoutData = '';
    let stderrData = '';
    
    pyProcess.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });
    
    pyProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
    });
    
    // Write JSON payload to Python stdin
    const input = JSON.stringify({
      login,
      password: password || '',
      server: server || '',
      path: terminalPath || '',
    });
    
    pyProcess.stdin.write(input);
    pyProcess.stdin.end();
    
    pyProcess.on('close', (code) => {
      if (code === 0 && stdoutData.includes('SUCCESS')) {
        resolve();
      } else {
        const errorMsg = stdoutData.trim() || stderrData.trim() || 'MetaTrader 5 terminal connection failed.';
        reject(new Error(errorMsg));
      }
    });
    
    pyProcess.on('error', (err) => {
      reject(new Error(`Failed to start MT5 validator: ${err.message}`));
    });
  });
};

export const getAccounts = async (req: Request, res: Response) => {
  try {
    const accounts = await MT5Account.find().sort({ createdAt: 1 });
    
    // Auto-activate the first account if none is active
    const hasActive = accounts.some(acc => acc.isActive);
    if (!hasActive && accounts.length > 0) {
      accounts[0].isActive = true;
      await accounts[0].save();
    }
    
    res.json(accounts.map(toPublic));
  } catch (error: any) {
    res.status(500).json({ message: 'Error retrieving MT5 accounts', error: error.message });
  }
};

export const createAccount = async (req: Request, res: Response) => {
  try {
    const { login, password, server, path, name, defaultBalance, riskPerTradePercent, syncHistoryDepth, balanceSource } = req.body;

    if (!login || !server) {
      return res.status(400).json({ message: 'Login ID and Server are required fields.' });
    }

    // Check if account already exists
    const existing = await MT5Account.findOne({ login });
    if (existing) {
      return res.status(400).json({ message: `Account with Login #${login} already registered.` });
    }

    // Validate MT5 credentials before saving
    try {
      await validateMT5Credentials(Number(login), password, server, path);
    } catch (err: any) {
      return res.status(400).json({
        message: `MT5 connection verification failed: ${err.message}. Ensure your MT5 desktop app is open, logged in, and matches the entered login and server details.`
      });
    }

    // Set all other accounts to inactive
    await MT5Account.updateMany({}, { $set: { isActive: false } });

    const newAccount = new MT5Account({
      login,
      password: password || '',
      server,
      path: path || '',
      name: name || `Account ${login}`,
      isActive: true,
      defaultBalance: defaultBalance !== undefined ? defaultBalance : 25000,
      riskPerTradePercent: riskPerTradePercent !== undefined ? riskPerTradePercent : 1.0,
      syncHistoryDepth: syncHistoryDepth || 'all',
      balanceSource: BALANCE_SOURCES.includes(balanceSource) ? balanceSource : 'manual',
    });

    await newAccount.save();

    // Import the account's trade history right away so the journal isn't empty
    const sync = await runMT5Sync(`new account #${login}`);
    const importedTrades = await Trade.countDocuments({ accountNumber: String(login) });
    const refreshed = await MT5Account.findById(newAccount._id);

    res.status(201).json({
      ...toPublic(refreshed || newAccount),
      initialSync: { ok: sync.ok, importedTrades },
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Error creating MT5 account', error: error.message });
  }
};

export const setActiveAccount = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const account = await MT5Account.findById(id);
    if (!account) {
      return res.status(404).json({ message: 'MT5 account not found.' });
    }

    // Set all other accounts to inactive
    await MT5Account.updateMany({}, { $set: { isActive: false } });

    // Mark current account as active
    account.isActive = true;
    await account.save();

    // Pull any trades missing for this account in the background
    runMT5Sync(`switched to account #${account.login}`);

    res.json(toPublic(account));
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating active account', error: error.message });
  }
};

// PUT /api/accounts/:id — edit account profile & risk parameters
export const updateAccount = async (req: Request, res: Response) => {
  try {
    const account = await MT5Account.findById(req.params.id);
    if (!account) {
      return res.status(404).json({ message: 'MT5 account not found.' });
    }

    const { name, defaultBalance, riskPerTradePercent, balanceSource, syncHistoryDepth, password, server, path } = req.body;

    if (name !== undefined) account.name = String(name);
    if (defaultBalance !== undefined) {
      const v = Number(defaultBalance);
      if (!Number.isFinite(v) || v < 0) return res.status(400).json({ message: 'Starting balance must be a positive number.' });
      account.defaultBalance = v;
    }
    if (riskPerTradePercent !== undefined) {
      const v = Number(riskPerTradePercent);
      if (!Number.isFinite(v) || v <= 0 || v > 100) return res.status(400).json({ message: 'Risk per trade must be between 0 and 100%.' });
      account.riskPerTradePercent = v;
    }
    if (balanceSource !== undefined) {
      if (!BALANCE_SOURCES.includes(balanceSource)) return res.status(400).json({ message: 'Invalid balance source.' });
      account.balanceSource = balanceSource;
      // Apply the MT5 value immediately if we already have it
      const info = account.mt5Info;
      if (balanceSource === 'mt5_first_deposit' && info?.firstDeposit) {
        account.defaultBalance = info.firstDeposit;
      } else if (balanceSource === 'mt5_net_deposits' && info?.totalDeposits !== undefined) {
        account.defaultBalance = Number(((info.totalDeposits || 0) - (info.totalWithdrawals || 0)).toFixed(2));
      }
    }
    if (syncHistoryDepth !== undefined) {
      if (!SYNC_DEPTHS.includes(syncHistoryDepth)) return res.status(400).json({ message: 'Invalid sync history depth.' });
      account.syncHistoryDepth = syncHistoryDepth;
    }
    if (password) account.password = String(password);
    if (server) account.server = String(server);
    if (path !== undefined) account.path = String(path);

    await account.save();
    res.json(toPublic(account));
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating MT5 account', error: error.message });
  }
};

export const deleteAccount = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const account = await MT5Account.findById(id);
    if (!account) {
      return res.status(404).json({ message: 'MT5 account not found.' });
    }

    // Delete all trades linked to this account login
    const deleteTradesResult = await Trade.deleteMany({ accountNumber: String(account.login) });
    console.log(`Deleted ${deleteTradesResult.deletedCount} trades associated with account #${account.login}`);
    await BalanceOperation.deleteMany({ accountNumber: String(account.login) });

    const loginId = account.login;
    const wasActive = account.isActive;

    await MT5Account.findByIdAndDelete(id);

    // If we deleted the active account, set another one as active if any exist
    if (wasActive) {
      const remainingAccounts = await MT5Account.find().sort({ createdAt: 1 });
      if (remainingAccounts.length > 0) {
        remainingAccounts[0].isActive = true;
        await remainingAccounts[0].save();
      }
    }

    res.json({ message: `Account #${loginId} and all associated trades deleted successfully.` });
  } catch (error: any) {
    res.status(500).json({ message: 'Error deleting MT5 account', error: error.message });
  }
};
