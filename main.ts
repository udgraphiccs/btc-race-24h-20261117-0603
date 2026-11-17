// Deep-dip mean-reversion bot for cbBTC (CBBTC/USDC), protocol agent-fun/bars-replay/v1.
//
// Strategy (designed from the dev window's own behaviour):
//   The dev window is quiet and strongly mean-reverting on 30-60 minute horizons:
//   per-bar sd is only ~6.4 bps, the biggest 1-minute move is under 50 bps, and a
//   30-bar run of +50 bps is followed on average by -41 bps over the next 30 bars.
//   Trend-following / SMA-crossover riders whipsaw badly here (backtested -$20 to
//   -$120), while buying genuine dislocations and letting winners run works.
//   So this bot only buys a real dip and exits on a wide trailing stop:
//     * BUY  (all cash) when the close is DIP_BPS below its 120-bar simple moving
//       average - a dislocation of roughly one hourly move's sd - provided the
//       120-bar average itself is not in a steep downtrend (regime guard).
//     * SELL (whole position) when the close falls TRAIL_BPS below the highest close
//       seen since entry (lets a recovery run), or drops STOP_BPS below the entry
//       close (hard stop against a falling knife), or the position has been held
//       MAX_HOLD_BARS bars. A cooldown after any exit stops immediate re-entry.
//   A full-size round trip costs ~35 bps at this pool's depth (4 bps fee + 2 bps
//   slippage + ~11 bps constant-product impact each way on ~$880k depth), so the
//   50 bps dip plus 90 bps of trailing room is sized to clear that cost with room.
//   Long only, at most one open position, fully deterministic: every decision is a
//   pure function of the closes seen so far. No clock, no network, no randomness.
//
// Backtest (scratch simulator with the kit's fill model, verified to reproduce
// grade-local exactly) on the dev window, full bot logic:
//   dip 50 / trail 90 / stop 200 / hold 480 / cooldown 30: net PnL +$15.50,
//   5 trades, max DD -1.58%. The whole neighbourhood is positive (dip 40-60,
//   trail 70-100, cooldown 0-30 all net +$3.50 to +$17.76), so the result is a
//   region, not a single tuned point.

import { runBars } from './vendor/makefun-bars.ts';
import type { BarsState, Batch } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
/** Length of the reference moving average, in bars (minutes). */
const SMA_LEN = 120;
/** Buy when the close is this far below the SMA, in basis points. */
const DIP_BPS = 50;
/** Sell when the close falls this far below the peak since entry, in basis points. */
const TRAIL_BPS = 90;
/** Sell when the close falls this far below the entry close, in basis points. */
const STOP_BPS = 200;
/** Sell after holding this many bars at most. */
const MAX_HOLD_BARS = 480;
/** Bars to wait after an exit before a new entry. */
const COOLDOWN_BARS = 30;
/** Skip entries while the SMA itself fell more than this (bps) over the last SMA_LEN bars. */
const DOWNTREND_BPS = 150;
/** Orders are rejected if the fill would move more than this from the latest close. */
const MAX_SLIPPAGE_BPS = 300;

const BPS = 10_000;

/** Basis points of `value` relative to `base`: (value / base - 1) * 10000. */
function bpsDiff(value: number, base: number): number {
  return ((value - base) / base) * BPS;
}

interface BotState {
  /** Closes seen so far, in USDC per cbBTC. */
  closes: number[];
  /** Close at the bar the current position was decided on (null when flat). */
  entryClose: number | null;
  /** Highest close seen since entry. */
  peakClose: number;
  /** Seq of the bar the current position was decided on. */
  entrySeq: number;
  /** Seq of the last exit decision, for the cooldown. */
  lastExitSeq: number;
}

const bot: BotState = {
  closes: [],
  entryClose: null,
  peakClose: 0,
  entrySeq: 0,
  lastExitSeq: -1_000_000,
};

/** Simple moving average of the last `len` closes ending at index `end` (exclusive). */
function sma(closes: number[], end: number, len: number): number {
  let sum = 0;
  for (let i = end - len; i < end; i++) sum += closes[i]!;
  return sum / len;
}

function onBatch(state: BarsState, _batch: Batch) {
  if (state.warmingUp) return [];
  const closeRaw = state.close(SYMBOL);
  if (closeRaw === null) return [];
  // Prices arrive at price_scale 5 (1e5 raw units per USDC); work in USDC.
  const close = Number(closeRaw) / 1e5;
  bot.closes.push(close);
  const n = bot.closes.length;
  const held = state.positions.get(SYMBOL);
  const inPosition = held !== undefined && held.qty > 0n;

  if (!inPosition) {
    // A rejected buy leaves no position: drop any stale entry tracking.
    bot.entryClose = null;
    // Not enough history yet, or still cooling down after an exit.
    if (n < 2 * SMA_LEN) return [];
    if (state.seq - bot.lastExitSeq < COOLDOWN_BARS) return [];
    const mean = sma(bot.closes, n, SMA_LEN);
    if (bpsDiff(close, mean) >= -DIP_BPS) return [];
    // Regime guard: do not catch a knife while the average itself is plunging.
    const meanThen = sma(bot.closes, n - SMA_LEN, SMA_LEN);
    if (bpsDiff(mean, meanThen) < -DOWNTREND_BPS) return [];
    if (state.cash <= 0n) return [];
    bot.entryClose = close;
    bot.peakClose = close;
    bot.entrySeq = state.seq;
    return [
      {
        side: 'buy',
        symbol: SYMBOL,
        notional_quote_units: state.cash,
        max_slippage_bps: MAX_SLIPPAGE_BPS,
      },
    ];
  }

  // In a position: recover entry tracking if a previous sell was rejected.
  if (bot.entryClose === null) {
    bot.entryClose = close;
    bot.peakClose = close;
    bot.entrySeq = state.seq;
  }
  if (close > bot.peakClose) bot.peakClose = close;
  const entry = bot.entryClose;
  const downFromPeak = bpsDiff(close, bot.peakClose);
  const downFromEntry = bpsDiff(close, entry);
  const heldTooLong = state.seq - bot.entrySeq > MAX_HOLD_BARS;
  if (downFromPeak < -TRAIL_BPS || downFromEntry < -STOP_BPS || heldTooLong) {
    bot.lastExitSeq = state.seq;
    bot.entryClose = null;
    return [
      {
        side: 'sell',
        symbol: SYMBOL,
        qty: held.qty,
        max_slippage_bps: MAX_SLIPPAGE_BPS,
      },
    ];
  }
  return [];
}

await runBars({ onBatch });
