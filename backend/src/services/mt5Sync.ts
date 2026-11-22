import { spawn } from 'child_process';
import path from 'path';
import MT5Account from '../models/MT5Account';
import SyncStatus from '../models/SyncStatus';

const SYNC_DIR = path.resolve(__dirname, '../../../sync');
const SYNC_SCRIPT = path.join(SYNC_DIR, 'mt5_sync_once.py');
const PYTHON_BIN = process.env.PYTHON_PATH || 'python';
const SYNC_TIMEOUT_MS = 5 * 60 * 1000;

export interface SyncRunResult {
  ok: boolean;
  skipped?: boolean;
  output: string;
}

let currentRun: Promise<SyncRunResult> | null = null;

/**
 * Runs sync/mt5_sync_once.py, which pulls closed deals + account info from the
 * MT5 terminal and posts them back to this API. Only one run at a time: if a
 * sync is already in progress, callers share that run's promise.
 */
export const runMT5Sync = (reason: string): Promise<SyncRunResult> => {
  if (currentRun) return currentRun;

  currentRun = new Promise<SyncRunResult>((resolve) => {
    console.log(`[MT5 Sync] Starting (${reason})`);
    let output = '';
    const proc = spawn(PYTHON_BIN, [SYNC_SCRIPT], {
      cwd: SYNC_DIR,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' },
    });

    const timer = setTimeout(() => {
      output += '\nSync timed out and was terminated.';
      proc.kill();
    }, SYNC_TIMEOUT_MS);

    proc.stdout.on('data', (d) => { output += d.toString(); });
    proc.stderr.on('data', (d) => { output += d.toString(); });

    proc.on('error', async (err) => {
      clearTimeout(timer);
      const msg = `Failed to start Python sync process (${PYTHON_BIN}): ${err.message}`;
      console.error(`[MT5 Sync] ${msg}`);
      await SyncStatus.findOneAndUpdate(
        {},
        { $set: { status: 'error', lastError: msg, lastSyncTime: new Date(), triggerManualSync: false } },
        { upsert: true }
      ).catch(() => undefined);
      resolve({ ok: false, output: msg });
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      const tail = output.trim().split('\n').slice(-3).join(' | ');
      console.log(`[MT5 Sync] Finished with code ${code}: ${tail}`);
      resolve({ ok: code === 0, output });
    });
  }).finally(() => {
    currentRun = null;
  });

  return currentRun;
};

export const isSyncRunning = () => currentRun !== null;

/** Periodically syncs the active account so new trades land in MongoDB automatically. */
export const startSyncScheduler = () => {
  const intervalSec = Number(process.env.SYNC_INTERVAL_SECONDS || 60);
  if (!intervalSec || intervalSec <= 0) {
    console.log('[MT5 Sync] Scheduler disabled (SYNC_INTERVAL_SECONDS <= 0).');
    return;
  }

  const tick = async () => {
    try {
      const active = await MT5Account.exists({ isActive: true });
      if (active) await runMT5Sync('scheduled');
    } catch (err: any) {
      console.error(`[MT5 Sync] Scheduler error: ${err.message}`);
    }
  };

  console.log(`[MT5 Sync] Scheduler running every ${intervalSec}s.`);
  setTimeout(tick, 3000);
  setInterval(tick, intervalSec * 1000);
};
