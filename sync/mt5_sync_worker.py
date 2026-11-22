"""
Optional standalone sync loop.

The Express backend already runs mt5_sync_once.py on a schedule
(SYNC_INTERVAL_SECONDS in backend/.env), so you normally do NOT need this.
Use it only if you run the sync on a different machine than the backend
(in that case set SYNC_INTERVAL_SECONDS=0 in backend/.env).
"""
import os
import sys
import time
import warnings

import requests
from dotenv import load_dotenv

warnings.filterwarnings("ignore", category=DeprecationWarning)
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

from mt5_sync_once import API_URL, sync_trades  # noqa: E402

SYNC_INTERVAL_SECONDS = int(os.getenv("SYNC_INTERVAL_SECONDS", "60"))


def manual_trigger_requested():
    try:
        res = requests.get(f"{API_URL}/sync/status", timeout=3)
        return res.status_code == 200 and res.json().get("triggerManualSync", False)
    except Exception:
        return False


def run_loop():
    print(f"MT5 sync worker running every {SYNC_INTERVAL_SECONDS}s (API: {API_URL})")
    last_run = 0.0
    while True:
        try:
            if manual_trigger_requested() or time.time() - last_run >= SYNC_INTERVAL_SECONDS:
                sync_trades()
                last_run = time.time()
            time.sleep(5)
        except KeyboardInterrupt:
            print("\nShutting down MT5 sync worker...")
            sys.exit(0)
        except Exception as e:
            print(f"Unexpected error in worker loop: {e}")
            time.sleep(10)


if __name__ == "__main__":
    run_loop()
