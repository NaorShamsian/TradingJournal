import { Request, Response } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import Trade from '../models/Trade';
import MT5Account from '../models/MT5Account';
import CandleCache from '../models/CandleCache';
import { loadTradeUnits } from '../services/tradeUnits';
import { findGroupOf } from '../utils/tradeGrouping';

const SCRIPT = path.resolve(__dirname, '../../../sync/mt5_candles.py');
const PYTHON_BIN = process.env.PYTHON_PATH || 'python';

const TF_SECONDS: Record<string, number> = { M1: 60, M5: 300, M15: 900, M30: 1800, H1: 3600, H4: 14400, D1: 86400 };
const TF_ORDER = Object.keys(TF_SECONDS);
const MAX_BARS = 260;
const MIN_BARS = 20; // fewer candles than this = broker lacks history for that timeframe

/** Smallest timeframe that shows the whole trade plus context in <= MAX_BARS candles. */
const autoTimeframe = (spanSec: number) =>
  TF_ORDER.find((tf) => (spanSec * 3) / TF_SECONDS[tf] + 80 <= MAX_BARS) || 'D1';

/** Window: context before the entry and after the exit (at least 40 bars or the trade's own length). */
const windowFor = (openSec: number, closeSec: number, tf: string) => {
  const tfSec = TF_SECONDS[tf];
  const span = Math.max(closeSec - openSec, tfSec);
  const pad = Math.max(span, 40 * tfSec);
  const from = Math.floor((openSec - pad) / tfSec) * tfSec;
  const to = Math.ceil((closeSec + pad) / tfSec) * tfSec;
  return { from, to };
};

const runPython = (payload: object): Promise<any> =>
  new Promise((resolve) => {
    const proc = spawn(PYTHON_BIN, [SCRIPT], { env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    let out = '';
    let err = '';
    const timer = setTimeout(() => proc.kill(), 60000);
    proc.stdout.on('data', (d) => (out += d.toString()));
    proc.stderr.on('data', (d) => (err += d.toString()));
    proc.on('error', (e) => {
      clearTimeout(timer);
      resolve({ ok: false, error: `Failed to start Python (${PYTHON_BIN}): ${e.message}` });
    });
    proc.on('close', () => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(out.trim().split('\n').pop() || ''));
      } catch {
        resolve({ ok: false, error: (err || out || 'No response from candle script').trim().slice(0, 500) });
      }
    });
    proc.stdin.write(JSON.stringify(payload));
    proc.stdin.end();
  });

// GET /api/trades/:id/candles?tf=auto|M1|M5|...
export const getTradeCandles = async (req: Request, res: Response) => {
  try {
    const trade = await Trade.findById(req.params.id).lean();
    if (!trade) return res.status(404).json({ message: 'Trade not found' });

    // Chart the whole grouped trade, not just this one deal
    const pad = 3 * 24 * 3600 * 1000;
    const units = await loadTradeUnits({
      symbol: trade.symbol,
      openTime: { $lte: new Date(+trade.closeTime + pad) },
      closeTime: { $gte: new Date(+trade.openTime - pad) },
    });
    const group = findGroupOf(units, String(trade._id));
    const openSec = Math.floor(+new Date(group?.openTime || trade.openTime) / 1000);
    const closeSec = Math.floor(+new Date(group?.closeTime || trade.closeTime) / 1000);

    const requested = String(req.query.tf || 'auto').toUpperCase();
    const auto = requested === 'AUTO' || !TF_SECONDS[requested];
    const startTf = auto ? autoTimeframe(closeSec - openSec) : requested;
    // In auto mode, fall back to bigger timeframes if the broker lacks old small-TF history
    const candidates = auto ? TF_ORDER.slice(TF_ORDER.indexOf(startTf)) : [startTf];

    const account = await MT5Account.findOne({ isActive: true });
    let lastError = '';

    for (const tf of candidates) {
      const { from, to } = windowFor(openSec, closeSec, tf);
      const key = `${trade.symbol}|${tf}|${from}|${to}`;

      const cached = await CandleCache.findOne({ key }).lean();
      if (cached && cached.candles.length >= MIN_BARS) {
        return res.json({ symbol: trade.symbol, timeframe: tf, digits: cached.digits, candles: cached.candles, cached: true });
      }

      const result = await runPython({
        symbol: trade.symbol,
        timeframe: tf,
        from,
        to,
        login: account?.login,
        password: account?.password,
        server: account?.server,
        path: account?.path,
        minBars: MIN_BARS,
      });

      if (result.ok) {
        // Only cache windows that are fully in the past. `to` is in broker server
        // time (usually UTC+2/3), hence the extra buffer.
        if (Date.now() / 1000 > to + 4 * 3600) {
          await CandleCache.updateOne(
            { key },
            { $set: { key, symbol: trade.symbol, timeframe: tf, from, to, digits: result.digits, candles: result.candles } },
            { upsert: true }
          ).catch(() => undefined);
        }
        return res.json({ symbol: trade.symbol, timeframe: tf, digits: result.digits, candles: result.candles, cached: false });
      }
      lastError = result.error;
      // Connection problems won't be fixed by another timeframe
      if (/connect|not installed|Failed to start/i.test(lastError)) break;
    }

    res.status(502).json({ message: lastError || 'Could not load candles from MT5.' });
  } catch (error: any) {
    res.status(500).json({ message: 'Error loading candles', error: error.message });
  }
};
