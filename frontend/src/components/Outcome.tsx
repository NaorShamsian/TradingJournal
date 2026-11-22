import React from 'react';

/**
 * Shared win / loss colors used across the app:
 *   win  -> green (emerald), loss -> red (rose), breakeven -> neutral slate.
 */
export type Outcome = 'win' | 'loss' | 'breakeven';

export const outcomeOf = (netProfit: number): Outcome =>
  netProfit > 0 ? 'win' : netProfit < 0 ? 'loss' : 'breakeven';

/** Text color for P&L values */
export const pnlText = (netProfit: number) =>
  netProfit > 0 ? 'text-emerald-500' : netProfit < 0 ? 'text-rose-500' : 'text-slate-400';

/** Card / row styling: tinted background + colored accent border */
export const outcomeSurface = (netProfit: number) => {
  switch (outcomeOf(netProfit)) {
    case 'win':
      return 'bg-emerald-50/70 dark:bg-emerald-500/[0.06] border-emerald-300/70 dark:border-emerald-500/30';
    case 'loss':
      return 'bg-rose-50/70 dark:bg-rose-500/[0.06] border-rose-300/70 dark:border-rose-500/30';
    default:
      return 'bg-white dark:bg-card border-slate-200 dark:border-border';
  }
};

/** Solid accent strip color (e.g. a left / top border bar) */
export const outcomeAccent = (netProfit: number) =>
  netProfit > 0 ? 'bg-emerald-500' : netProfit < 0 ? 'bg-rose-500' : 'bg-slate-400';

export const OutcomeBadge: React.FC<{ netProfit: number; lang: string; className?: string }> = ({ netProfit, lang, className = '' }) => {
  const o = outcomeOf(netProfit);
  const he = lang === 'he';
  const label = o === 'win' ? (he ? 'רווח' : 'WIN') : o === 'loss' ? (he ? 'הפסד' : 'LOSS') : he ? 'איזון' : 'BE';
  const cls =
    o === 'win'
      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
      : o === 'loss'
        ? 'bg-rose-500/15 border-rose-500/40 text-rose-600 dark:text-rose-400'
        : 'bg-slate-500/10 border-slate-400/40 text-slate-500';
  return (
    <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border uppercase tracking-wider ${cls} ${className}`}>{label}</span>
  );
};

/** "Merged · N positions" badge for smart-grouped trades */
export const MergedBadge: React.FC<{ positions?: number; lang: string; compact?: boolean }> = ({ positions, lang, compact }) => {
  if (!positions || positions < 2) return null;
  const he = lang === 'he';
  return (
    <span
      title={
        he
          ? `העסקה אוחדה אוטומטית מ-${positions} פוזיציות באותו סימבול ובאותו כיוון שנפתחו בסמיכות זמנים`
          : `Automatically merged from ${positions} same-symbol, same-direction positions opened close together`
      }
      className="px-1.5 py-0.5 bg-primary/10 border border-primary/30 text-primary rounded-md text-[9px] font-black tracking-wider whitespace-nowrap"
    >
      {compact ? `×${positions}` : he ? `מאוחד · ${positions} פוז׳` : `MERGED · ${positions} POS`}
    </span>
  );
};
