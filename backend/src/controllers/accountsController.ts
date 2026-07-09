import { Request, Response } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import MT5Account from '../models/MT5Account';
import Trade from '../models/Trade';

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
    const pyProcess = spawn('python', [scriptPath]);
    
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
    
    res.json(accounts);
  } catch (error: any) {
    res.status(500).json({ message: 'Error retrieving MT5 accounts', error: error.message });
  }
};

export const createAccount = async (req: Request, res: Response) => {
  try {
    const { login, password, server, path, name, defaultBalance, riskPerTradePercent, syncHistoryDepth } = req.body;

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
    });

    await newAccount.save();
    res.status(201).json(newAccount);
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

    res.json(account);
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating active account', error: error.message });
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
