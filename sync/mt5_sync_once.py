"""
Single MT5 -> TradingJournal sync pass.

Run by the Express backend automatically (on account creation, on the "Sync"
button and on a schedule), but can also be run manually:  python mt5_sync_once.py

What it does:
  1. Fetches the active account credentials from the backend.
  2. Connects to the local MetaTrader 5 terminal.
  3. Reports live account info (balance, equity, deposits) to the backend.
  4. Imports closed trades. The starting point is the newest trade already
     stored in MongoDB (minus an overlap window), so history is never lost and
     duplicates are skipped by the backend.
"""
import os
import sys
import time
from datetime import datetime, timedelta
import warnings
import requests
from dotenv import load_dotenv

# Suppress datetime deprecation warnings from standard packages
warnings.filterwarnings("ignore", category=DeprecationWarning)

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

API_URL = os.getenv("API_URL", "http://localhost:5000/api")

# Re-scan this many days before the newest stored trade (covers broker timezone
# offsets and late-arriving deals). Duplicates are skipped by the backend.
RESYNC_OVERLAP_DAYS = 3
UPLOAD_CHUNK_SIZE = 200
HISTORY_START = datetime(2000, 1, 1)  # NOTE: 1970 dates raise errors on Windows

DEAL_TYPE_BALANCE = 2

mt5_available = False
try:
    import MetaTrader5 as mt5
    mt5_available = True
except ImportError:
    print("WARNING: MetaTrader5 Python package is not installed. Run: pip install -r requirements.txt")


def update_backend_status(status, last_error=None, imported=None, skipped=None, account_name=None, account_number=None, broker_server=None):
    """Sends status updates to the Express API."""
    try:
        payload = {
            "status": status,
            "lastSyncTime": datetime.utcnow().isoformat() + "Z",
            "triggerManualSync": False,
        }
        if imported is not None:
            payload["importedCount"] = imported
        if skipped is not None:
            payload["skippedDuplicates"] = skipped
        if last_error is not None:
            payload["lastError"] = str(last_error)
        if account_name:
            payload["mt5AccountName"] = account_name
        if account_number:
            payload["mt5AccountNumber"] = account_number
        if broker_server:
            payload["mt5BrokerServer"] = broker_server
        if status == "stopped":
            payload["lastSuccessfulSyncTime"] = datetime.utcnow().isoformat() + "Z"

        res = requests.post(f"{API_URL}/sync/status", json=payload, timeout=5)
        if res.status_code != 200:
            print(f"Failed to update backend status: {res.text}")
    except Exception as e:
        print(f"Error connecting to backend API at {API_URL}: {e}")


def get_sync_start(active_account):
    """Where to start scanning MT5 history from."""
    last_close = active_account.get("lastTradeCloseTime")
    if last_close:
        try:
            last_dt = datetime.fromisoformat(last_close.replace("Z", "")).replace(tzinfo=None)
            return max(HISTORY_START, last_dt - timedelta(days=RESYNC_OVERLAP_DAYS))
        except ValueError:
            pass

    depth = active_account.get("syncHistoryDepth", "all")
    now = datetime.utcnow()
    if depth == "week":
        return now - timedelta(days=7)
    if depth == "month":
        return now - timedelta(days=30)
    if depth == "year":
        return now - timedelta(days=365)
    return HISTORY_START


def report_account_info(login, acc_info):
    """Sends live balance/equity and deposit history to the backend."""
    payload = {"login": login}
    if acc_info:
        payload.update({
            "balance": float(acc_info.balance),
            "equity": float(acc_info.equity),
            "currency": acc_info.currency,
            "leverage": int(acc_info.leverage),
        })

    try:
        all_deals = mt5.history_deals_get(HISTORY_START, datetime.now() + timedelta(days=1)) or []
        balance_ops = sorted((d for d in all_deals if d.type == DEAL_TYPE_BALANCE), key=lambda d: d.time)
        deposits = [d.profit for d in balance_ops if d.profit > 0]
        withdrawals = [-d.profit for d in balance_ops if d.profit < 0]
        if deposits:
            payload["firstDeposit"] = float(deposits[0])
        payload["totalDeposits"] = round(float(sum(deposits)), 2)
        payload["totalWithdrawals"] = round(float(sum(withdrawals)), 2)

        # Every non-trading balance change (deposits, withdrawals, credits,
        # corrections...). Trade deals are types 0 (buy) and 1 (sell).
        payload["balanceOps"] = [
            {
                "dealId": str(d.ticket),
                "time": datetime.utcfromtimestamp(d.time).isoformat() + "Z",
                "amount": round(float(d.profit + d.commission + d.swap), 2),
                "type": int(d.type),
                "comment": d.comment or "",
            }
            for d in all_deals
            if d.type not in (0, 1) and (d.profit + d.commission + d.swap) != 0
        ]
    except Exception as e:
        print(f"Could not read deposit history: {e}")

    try:
        res = requests.post(f"{API_URL}/sync/account-info", json=payload, timeout=10)
        if res.status_code == 200:
            print(f"Account info synced (balance: {payload.get('balance')}, first deposit: {payload.get('firstDeposit')})")
        else:
            print(f"Failed to sync account info: {res.text}")
    except Exception as e:
        print(f"Error sending account info: {e}")


def classify_session(open_time):
    # Broker server time is typically GMT+2/3 (New York close), i.e. NY time + 7h
    ny_open_hour = (open_time.hour - 7) % 24
    if 8 <= ny_open_hour < 17:
        return "New York"
    if 3 <= ny_open_hour < 8:
        return "London"
    if ny_open_hour >= 18 or ny_open_hour < 3:
        return "Asia"
    return "Other"


def build_trade(exit_deal):
    position_id = exit_deal.position_id
    position_deals = mt5.history_deals_get(position=position_id) if position_id else None
    entry_deal = None
    if position_deals:
        entry_deal = next((d for d in position_deals if d.entry == mt5.DEAL_ENTRY_IN), None)

    open_time = datetime.utcfromtimestamp(entry_deal.time if entry_deal else exit_deal.time - 300)
    close_time = datetime.utcfromtimestamp(exit_deal.time)
    entry_price = entry_deal.price if entry_deal else exit_deal.price

    if entry_deal:
        trade_type = "BUY" if entry_deal.type == mt5.DEAL_TYPE_BUY else "SELL"
    else:
        # Exit deal is the opposite direction of the position
        trade_type = "BUY" if exit_deal.type == mt5.DEAL_TYPE_SELL else "SELL"

    stop_loss = 0.0
    take_profit = 0.0
    if entry_deal and entry_deal.order:
        orders = mt5.history_orders_get(ticket=entry_deal.order)
        if orders:
            stop_loss = orders[0].sl
            take_profit = orders[0].tp

    # Entry-side commission is charged on the IN deal; include it in net P&L
    entry_commission = 0.0
    if entry_deal and position_deals:
        in_deals = [d for d in position_deals if d.entry == mt5.DEAL_ENTRY_IN]
        total_in_volume = sum(d.volume for d in in_deals) or 1
        entry_commission = sum(d.commission for d in in_deals) * min(1.0, exit_deal.volume / total_in_volume)

    commission = float(exit_deal.commission + entry_commission)

    trade = {
        "mt5DealId": str(exit_deal.ticket),
        "mt5OrderId": str(exit_deal.order),
        "positionId": str(position_id),
        "symbol": exit_deal.symbol,
        "type": trade_type,
        "volume": float(exit_deal.volume),
        "openTime": open_time.isoformat() + "Z",
        "closeTime": close_time.isoformat() + "Z",
        "entryPrice": float(entry_price),
        "exitPrice": float(exit_deal.price),
        "profit": float(exit_deal.profit),
        "commission": round(commission, 2),
        "swap": float(exit_deal.swap),
        "netProfit": round(float(exit_deal.profit + commission + exit_deal.swap), 2),
        "session": classify_session(open_time),
        "strategy": "Unassigned",
    }
    if stop_loss > 0:
        trade["stopLoss"] = float(stop_loss)
    if take_profit > 0:
        trade["takeProfit"] = float(take_profit)
    return trade


def sync_trades():
    if not mt5_available:
        update_backend_status("mt5_offline", last_error="MetaTrader5 Python library is not installed. Run: pip install -r sync/requirements.txt")
        return False

    active_account = None
    try:
        res = requests.get(f"{API_URL}/sync/active-account", timeout=5)
        if res.status_code == 200:
            active_account = res.json()
    except Exception as e:
        print(f"Error fetching active credentials from backend: {e}")

    if not active_account:
        err_msg = "No active MT5 account profile configured. Please add an MT5 account from the dashboard."
        print(err_msg)
        update_backend_status("mt5_offline", last_error=err_msg)
        return False

    login = int(active_account.get("login", 0))
    server = active_account.get("server", "")
    init_args = {k: v for k, v in {
        "path": active_account.get("path", ""),
        "login": login,
        "password": active_account.get("password", ""),
        "server": server,
    }.items() if v}

    update_backend_status("running")
    print(f"Connecting to MetaTrader 5 Terminal (Login: {login}, Server: {server})...")
    if not mt5.initialize(**init_args):
        err_msg = f"Could not connect to MT5 for account #{login} ({server}). Make sure the MT5 terminal is open. Error: {mt5.last_error()}"
        print(err_msg)
        update_backend_status("mt5_offline", last_error=err_msg)
        return False

    try:
        # Give the terminal a moment to sync history with the broker
        time.sleep(1)

        acc_info = mt5.account_info()
        if acc_info and acc_info.login != login:
            err_msg = f"MT5 terminal is logged into #{acc_info.login}, expected #{login}."
            print(err_msg)
            update_backend_status("error", last_error=err_msg)
            return False

        acc_name = acc_info.name if acc_info else (active_account.get("name") or str(login))
        acc_num = str(login)
        acc_srv = acc_info.server if acc_info else server
        status_ctx = {"account_name": acc_name, "account_number": acc_num, "broker_server": acc_srv}

        report_account_info(login, acc_info)

        from_date = get_sync_start(active_account)
        to_date = datetime.now() + timedelta(days=1)
        print(f"Querying closed deals from {from_date} to {to_date}...")

        history_deals = mt5.history_deals_get(from_date, to_date)
        if history_deals is None:
            err_msg = f"Failed to retrieve history deals. Error: {mt5.last_error()}"
            print(err_msg)
            update_backend_status("error", last_error=err_msg, **status_ctx)
            return False

        exit_deals = [
            d for d in history_deals
            if d.entry in (mt5.DEAL_ENTRY_OUT, mt5.DEAL_ENTRY_INOUT, mt5.DEAL_ENTRY_OUT_BY) and d.symbol
        ]
        print(f"Found {len(history_deals)} deals, {len(exit_deals)} closed trades in range.")

        if not exit_deals:
            update_backend_status("stopped", last_error="", imported=0, skipped=0, **status_ctx)
            return True

        trades = []
        for deal in exit_deals:
            try:
                trades.append(build_trade(deal))
            except Exception as e:
                print(f"Skipping deal {deal.ticket}: {e}")

        imported_total = 0
        skipped_total = 0
        for i in range(0, len(trades), UPLOAD_CHUNK_SIZE):
            chunk = trades[i:i + UPLOAD_CHUNK_SIZE]
            res = requests.post(f"{API_URL}/trades/import", params={"account": login}, json=chunk, timeout=120)
            if res.status_code != 201:
                err_msg = f"Failed to upload trades. Backend code: {res.status_code}, Body: {res.text[:300]}"
                print(err_msg)
                update_backend_status("error", last_error=err_msg, **status_ctx)
                return False
            data = res.json()
            imported_total += data.get("importedCount", 0)
            skipped_total += data.get("skippedDuplicates", 0)
            for err in data.get("errors", [])[:5]:
                print(f"  import error: {err}")

        print(f"Imported {imported_total} new trades, skipped {skipped_total} already stored.")
        update_backend_status("stopped", last_error="", imported=imported_total, skipped=skipped_total, **status_ctx)
        return True
    except Exception as e:
        err_msg = f"Sync failed: {e}"
        print(err_msg)
        update_backend_status("error", last_error=err_msg)
        return False
    finally:
        mt5.shutdown()


if __name__ == "__main__":
    print("Starting MetaTrader 5 sync...")
    ok = sync_trades()
    print("Sync complete." if ok else "Sync aborted.")
    sys.exit(0 if ok else 1)
