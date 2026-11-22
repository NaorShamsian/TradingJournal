"""
Fetches OHLC candles from the MT5 terminal.

Reads JSON from stdin:
  {"symbol": "XAUUSD.m", "timeframe": "M5", "from": <epoch s>, "to": <epoch s>,
   "login": ..., "password": ..., "server": ..., "path": ...}

Epoch values are in MT5 *server time* (the same frame MT5 uses for deal and
bar times, and the frame trades are stored in), so no timezone conversion is
needed between trades and candles.

Prints JSON: {"ok": true, "timeframe": "M5", "digits": 2, "candles": [{time, open, high, low, close}, ...]}
"""
import json
import sys
import time
from datetime import datetime, timezone

try:
    import MetaTrader5 as mt5
except ImportError:
    print(json.dumps({"ok": False, "error": "MetaTrader5 Python library is not installed."}))
    sys.exit(1)

TIMEFRAMES = {
    "M1": mt5.TIMEFRAME_M1,
    "M5": mt5.TIMEFRAME_M5,
    "M15": mt5.TIMEFRAME_M15,
    "M30": mt5.TIMEFRAME_M30,
    "H1": mt5.TIMEFRAME_H1,
    "H4": mt5.TIMEFRAME_H4,
    "D1": mt5.TIMEFRAME_D1,
}


def fail(msg):
    print(json.dumps({"ok": False, "error": msg}))
    sys.exit(1)


def main():
    req = json.loads(sys.stdin.read())
    symbol = req["symbol"]
    tf_name = req.get("timeframe", "M5")
    if tf_name not in TIMEFRAMES:
        fail(f"Unsupported timeframe {tf_name}")

    init_args = {k: v for k, v in {
        "path": req.get("path"),
        "login": int(req["login"]) if req.get("login") else None,
        "password": req.get("password"),
        "server": req.get("server"),
    }.items() if v}

    if not mt5.initialize(**init_args):
        fail(f"Could not connect to MT5 (is the terminal open?). Error: {mt5.last_error()}")

    try:
        if not mt5.symbol_select(symbol, True):
            # The journal stores symbols upper-cased ("XAUUSD.M") but broker
            # suffixes are case-sensitive ("XAUUSD.m") — resolve the real name.
            match = next((s.name for s in (mt5.symbols_get() or []) if s.name.upper() == symbol.upper()), None)
            if not match or not mt5.symbol_select(match, True):
                fail(f"Symbol {symbol} is not available in MT5.")
            symbol = match

        info = mt5.symbol_info(symbol)
        date_from = datetime.fromtimestamp(int(req["from"]), tz=timezone.utc)
        date_to = datetime.fromtimestamp(int(req["to"]), tz=timezone.utc)
        # The terminal downloads missing history in the background, so the first
        # request for a period can come back empty — retry briefly.
        rates = None
        for attempt in range(4):
            rates = mt5.copy_rates_range(symbol, TIMEFRAMES[tf_name], date_from, date_to)
            if rates is not None and len(rates) > 0:
                break
            time.sleep(1.5)

        min_bars = int(req.get("minBars", 20))
        if rates is None or len(rates) < min_bars:
            got = 0 if rates is None else len(rates)
            fail(f"NOT_ENOUGH_HISTORY: MT5 returned {got} {tf_name} candles for {symbol} in this period. "
                 f"Your broker may not keep old history for small timeframes.")

        candles = [
            {
                "time": int(r["time"]),
                "open": float(r["open"]),
                "high": float(r["high"]),
                "low": float(r["low"]),
                "close": float(r["close"]),
            }
            for r in rates
        ]
        print(json.dumps({"ok": True, "timeframe": tf_name, "digits": info.digits if info else 5, "candles": candles}))
    finally:
        mt5.shutdown()


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:
        fail(f"Candle fetch failed: {e}")
