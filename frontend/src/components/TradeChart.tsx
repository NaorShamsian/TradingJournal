import React, { useEffect, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  IChartApi,
  SeriesMarker,
  Time,
  UTCTimestamp,
} from 'lightweight-charts';
import { CandlestickChart, RefreshCw, AlertCircle, Database } from 'lucide-react';
import api from '../services/api';
import { CandleResponse, GroupedTrade, Trade } from '../types';
import { useThemeLang } from '../context/ThemeLangContext';
import { formatCurrency } from '../utils/format';

const TIMEFRAMES = ['auto', 'M1', 'M5', 'M15', 'H1', 'H4'] as const;

const COLORS = {
  win: '#10b981',
  loss: '#ef4444',
  buy: '#3b82f6',
  sell: '#f97316',
};

interface Props {
  trade: GroupedTrade;
  currency?: string;
}

const toSec = (d: string | Date) => Math.floor(new Date(d).getTime() / 1000);

/** Snap a timestamp to the candle that contains it (markers must sit on a bar time). */
const snapToBar = (t: number, barTimes: number[]) => {
  let lo = 0;
  let hi = barTimes.length - 1;
  if (t <= barTimes[0]) return barTimes[0];
  if (t >= barTimes[hi]) return barTimes[hi];
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (barTimes[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return barTimes[lo];
};

export const TradeChart: React.FC<Props> = ({ trade, currency = 'USD' }) => {
  const { lang, theme } = useThemeLang();
  const he = lang === 'he';
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const [timeframe, setTimeframe] = useState<string>('auto');
  const [data, setData] = useState<CandleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const legs: Trade[] = trade.rawExits && trade.rawExits.length ? trade.rawExits : [trade];

  // Fetch candles
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getTradeCandles(trade._id, timeframe)
      .then((res) => !cancelled && setData(res))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [trade._id, timeframe]);

  // Draw chart
  useEffect(() => {
    if (!containerRef.current || !data || data.candles.length === 0) return;

    const dark = theme === 'dark';
    const chart = createChart(containerRef.current, {
      autoSize: true,
      height: 420,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: dark ? '#94a3b8' : '#475569',
        fontFamily: 'Inter, sans-serif',
      },
      grid: {
        vertLines: { color: dark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.06)' },
        horzLines: { color: dark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.06)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: dark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.1)' },
      timeScale: {
        borderColor: dark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.1)',
        timeVisible: true,
        secondsVisible: false,
      },
    });
    chartRef.current = chart;

    const precision = Math.min(Math.max(data.digits ?? 5, 0), 8);
    const priceFormat = { type: 'price' as const, precision, minMove: 1 / 10 ** precision };

    const candles = chart.addCandlestickSeries({
      upColor: COLORS.win,
      downColor: COLORS.loss,
      wickUpColor: COLORS.win,
      wickDownColor: COLORS.loss,
      borderVisible: false,
      priceFormat,
    });
    candles.setData(data.candles.map((c) => ({ ...c, time: c.time as UTCTimestamp })));

    const barTimes = data.candles.map((c) => c.time);
    const isBuy = trade.type === 'BUY';

    // Dashed line from each position's entry to its exit
    legs.forEach((leg) => {
      const a = snapToBar(toSec(leg.openTime), barTimes);
      const b = snapToBar(toSec(leg.closeTime), barTimes);
      if (b <= a) return; // same candle — the arrows are enough
      const line = chart.addLineSeries({
        color: leg.netProfit >= 0 ? COLORS.win : COLORS.loss,
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        priceFormat,
      });
      line.setData([
        { time: a as UTCTimestamp, value: leg.entryPrice },
        { time: b as UTCTimestamp, value: leg.exitPrice },
      ]);
    });

    // Entry / exit arrows (legs that land on the same candle are merged into one marker)
    const entries = new Map<number, { count: number; volume: number; price: number }>();
    const exits = new Map<number, { count: number; pnl: number; price: number }>();
    legs.forEach((leg) => {
      const et = snapToBar(toSec(leg.openTime), barTimes);
      const e = entries.get(et) || { count: 0, volume: 0, price: leg.entryPrice };
      e.count++;
      e.volume += leg.volume;
      entries.set(et, e);

      const xt = snapToBar(toSec(leg.closeTime), barTimes);
      const x = exits.get(xt) || { count: 0, pnl: 0, price: leg.exitPrice };
      x.count++;
      x.pnl += leg.netProfit;
      exits.set(xt, x);
    });

    const markers: SeriesMarker<Time>[] = [];
    entries.forEach((e, t) => {
      markers.push({
        time: t as UTCTimestamp,
        position: isBuy ? 'belowBar' : 'aboveBar',
        shape: isBuy ? 'arrowUp' : 'arrowDown',
        color: isBuy ? COLORS.buy : COLORS.sell,
        // Single entry: show its price. Several entries on one candle: show the count.
        text: e.count > 1 ? `${trade.type} ${e.volume.toFixed(2)} (×${e.count})` : `${trade.type} @ ${e.price.toFixed(precision)}`,
      });
    });
    exits.forEach((x, t) => {
      markers.push({
        time: t as UTCTimestamp,
        position: isBuy ? 'aboveBar' : 'belowBar',
        shape: isBuy ? 'arrowDown' : 'arrowUp',
        color: x.pnl >= 0 ? COLORS.win : COLORS.loss,
        text: `${he ? 'יציאה' : 'EXIT'} ${x.pnl >= 0 ? '+' : ''}${formatCurrency(x.pnl, currency)}`,
      });
    });
    markers.sort((a, b) => (a.time as number) - (b.time as number));
    candles.setMarkers(markers);

    // Reference levels
    candles.createPriceLine({
      price: trade.entryPrice,
      color: isBuy ? COLORS.buy : COLORS.sell,
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      axisLabelVisible: true,
      title: legs.length > 1 ? (he ? 'כניסה ממוצעת' : 'Avg entry') : he ? 'כניסה' : 'Entry',
    });
    if (trade.stopLoss) {
      candles.createPriceLine({ price: trade.stopLoss, color: COLORS.loss, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'SL' });
    }
    if (trade.takeProfit) {
      candles.createPriceLine({ price: trade.takeProfit, color: COLORS.win, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'TP' });
    }

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, theme, lang]);

  return (
    <div className="p-5 rounded-2xl bg-white dark:bg-card border border-slate-200 dark:border-border space-y-4 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200 dark:border-border/30 pb-3">
        <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
          <CandlestickChart className="h-4.5 w-4.5 text-primary" />
          {he ? 'גרף העסקה — כניסה ויציאה' : 'Trade replay — entry & exit'}
          {data && (
            <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
              · {data.symbol} {data.timeframe}
              {data.cached && (
                <span title={he ? 'נטען מהמטמון ב-MongoDB' : 'Loaded from MongoDB cache'}>
                  <Database className="h-3 w-3" />
                </span>
              )}
            </span>
          )}
        </h3>
        <div className="flex flex-wrap gap-1">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => setTimeframe(tf)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
                timeframe === tf
                  ? 'bg-primary text-white border-primary'
                  : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-border text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tf === 'auto' ? (he ? 'אוטומטי' : 'Auto') : tf}
            </button>
          ))}
        </div>
      </div>

      <div className="relative min-h-[420px]">
        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-white/60 dark:bg-card/60">
            <RefreshCw className="h-6 w-6 text-primary animate-spin" />
            <span className="text-xs font-semibold text-slate-400">{he ? 'טוען נרות מ-MT5...' : 'Loading candles from MT5...'}</span>
          </div>
        )}
        {error && !loading ? (
          <div className="h-[420px] flex flex-col items-center justify-center text-center gap-2 px-6">
            <AlertCircle className="h-8 w-8 text-danger" />
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{he ? 'לא ניתן לטעון את הגרף' : 'Could not load the chart'}</p>
            <p className="text-xs text-slate-500 max-w-md">{error}</p>
            <p className="text-[11px] text-slate-400 max-w-md">
              {he
                ? 'ודא שתוכנת MT5 פתוחה. גרפים שנטענו פעם אחת נשמרים ב-MongoDB וזמינים גם כש-MT5 סגור.'
                : 'Make sure the MT5 terminal is open. Charts that loaded once are cached in MongoDB and work even when MT5 is closed.'}
            </p>
          </div>
        ) : (
          <div ref={containerRef} className="w-full h-[420px]" />
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[11px] font-semibold text-slate-500">
        <span className="flex items-center gap-1.5">
          <span style={{ color: trade.type === 'BUY' ? COLORS.buy : COLORS.sell }}>{trade.type === 'BUY' ? '▲' : '▼'}</span>
          {he ? `כניסה (${trade.type})` : `Entry (${trade.type})`}
        </span>
        <span className="flex items-center gap-1.5">
          <span style={{ color: COLORS.win }}>{trade.type === 'BUY' ? '▼' : '▲'}</span>
          <span style={{ color: COLORS.loss }}>{trade.type === 'BUY' ? '▼' : '▲'}</span>
          {he ? 'יציאה ברווח / בהפסד' : 'Exit in profit / loss'}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-5 border-t-2 border-dashed" style={{ borderColor: COLORS.win }} />
          {he ? 'מסלול כל פוזיציה' : 'Path of each position'}
        </span>
        {(trade.stopLoss || trade.takeProfit) && (
          <span>{he ? 'קווים מקווקווים: SL באדום, TP בירוק' : 'Dashed levels: SL red, TP green'}</span>
        )}
        <span className="text-slate-400">{he ? 'שעות לפי שעון השרת של הברוקר (כמו ב-MT5)' : 'Times in broker server time (as in MT5)'}</span>
      </div>
    </div>
  );
};

export default TradeChart;
