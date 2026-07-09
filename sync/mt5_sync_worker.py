import os
import json
import time
import sys
from datetime import datetime, timedelta
import warnings
import requests
from dotenv import load_dotenv

# Suppress datetime deprecation warnings from standard packages
warnings.filterwarnings("ignore", category=DeprecationWarning)

# Load environments
load_dotenv()

API_URL = os.getenv("API_URL", "http://localhost:5000/api")
SYNC_INTERVAL_SECONDS = int(os.getenv("SYNC_INTERVAL_SECONDS", "60"))
STATE_FILE = os.path.join(os.path.dirname(__file__), "sync_state.json")

# Define fallback constants in case MT5 module import fails
DEAL_ENTRY_IN = 0
DEAL_ENTRY_OUT = 1
DEAL_ENTRY_INOUT = 2
DEAL_ENTRY_OUT_BY = 3

DEAL_TYPE_BUY = 0
DEAL_TYPE_SELL = 1

# Try to import MetaTrader5
mt5_available = False
try:
    import MetaTrader5 as mt5
    mt5_available = True
except ImportError:
    print("WARNING: MetaTrader5 Python package is not installed.")
    print("Background worker will run in offline simulation mode.")

def update_backend_status(status, last_error=None, imported=0, skipped=0, trigger_manual=False, account_name=None, account_number=None, broker_server=None):
    """Sends status updates and sets manual trigger flags to false on the backend."""
    try:
        url = f"{API_URL}/sync/status"
        payload = {
            "status": status,
            "lastSyncTime": datetime.utcnow().isoformat() + "Z",
            "importedCount": imported,
            "skippedDuplicates": skipped,
            "triggerManualSync": trigger_manual,
        }
        if last_error:
            payload["lastError"] = str(last_error)
        
        if account_name:
            payload["mt5AccountName"] = account_name
        if account_number:
            payload["mt5AccountNumber"] = account_number
        if broker_server:
            payload["mt5BrokerServer"] = broker_server
            
        if status in ["running", "stopped"]:
            payload["lastSuccessfulSyncTime"] = datetime.utcnow().isoformat() + "Z"

        res = requests.post(url, json=payload, timeout=5)
        return res.status_code == 200
    except Exception as e:
        print(f"Error updating status on backend: {e}")
        return False

def check_manual_trigger():
    """Polls the backend to see if a manual sync was requested by the client."""
    try:
        url = f"{API_URL}/sync/status"
        res = requests.get(url, timeout=3)
        if res.status_code == 200:
            data = res.json()
            return data.get("triggerManualSync", False)
    except Exception as e:
        print(f"Error reading status from backend: {e}")
    return False

def get_last_sync_time(login_id, sync_depth="all"):
    """Gets start date for deal query from local state file for this specific login."""
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r") as f:
                state = json.load(f)
                key = str(login_id)
                if key in state:
                    return datetime.utcfromtimestamp(state[key])
        except Exception as e:
            print(f"Error reading sync state: {e}")
            
    # Fallback to chosen depth if no state exists for this account
    if sync_depth == "week":
        return datetime.utcnow() - timedelta(days=7)
    elif sync_depth == "month":
        return datetime.utcnow() - timedelta(days=30)
    elif sync_depth == "year":
        return datetime.utcnow() - timedelta(days=365)
    else:
        return datetime(2000, 1, 1)

def save_last_sync_time(login_id, timestamp):
    state = {}
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r") as f:
                state = json.load(f)
        except Exception:
            pass
            
    state[str(login_id)] = int(timestamp)
    try:
        with open(STATE_FILE, "w") as f:
            json.dump(state, f)
    except Exception as e:
        print(f"Error saving sync state: {e}")

def run_sync_cycle():
    """Performs the full MT5 connection and database sync operations."""
    if not mt5_available:
        print("MetaTrader5 module is missing. Updating backend to offline.")
        update_backend_status("mt5_offline", last_error="MetaTrader5 Python library is not installed.")
        return False

    # Fetch active credentials from backend
    active_account = None
    try:
        res = requests.get(f"{API_URL}/sync/active-account", timeout=5)
        if res.status_code == 200:
            active_account = res.json()
    except Exception as e:
        print(f"Error fetching active credentials from backend: {e}")
        
    if not active_account:
        err_msg = "No active MT5 account profile configured. Please add an MT5 account from the TraderNet dashboard."
        print(err_msg)
        update_backend_status("mt5_offline", last_error=err_msg)
        return False

    login = int(active_account.get("login", 0))
    password = active_account.get("password", "")
    server = active_account.get("server", "")
    path = active_account.get("path", "")

    # Initialize connection using account profile credentials
    init_args = {}
    if path:
        init_args["path"] = path
    if login > 0:
        init_args["login"] = login
    if password:
        init_args["password"] = password
    if server:
        init_args["server"] = server

    if not mt5.initialize(**init_args):
        err_msg = f"MT5 initialization failed for login #{login} on server {server}. Code: {mt5.last_error()}"
        print(err_msg)
        update_backend_status("mt5_offline", last_error=err_msg)
        return False

    print("Connected to MT5 terminal.")
    
    # Wait for MT5 terminal database connection to synchronize with broker
    time.sleep(2)
    
    # Query MT5 active account details
    acc_info = mt5.account_info()
    acc_name = acc_info.name if acc_info else (active_account.get("name") or str(login))
    acc_num = str(acc_info.login) if acc_info else str(login)
    acc_srv = acc_info.server if acc_info else server
    
    update_backend_status("running", account_name=acc_name, account_number=acc_num, broker_server=acc_srv)

    # Detect Initial Deposit from MT5 history
    try:
        all_history = mt5.history_deals_get(datetime(1970, 1, 1), datetime.utcnow() + timedelta(days=1))
        if all_history:
            # Filter type 2 (DEAL_TYPE_BALANCE) with positive profit (deposit)
            balance_deals = [d for d in all_history if d.type == 2 and d.profit > 0]
            if balance_deals:
                balance_deals.sort(key=lambda x: x.time)
                first_deposit = balance_deals[0].profit
                print(f"Detected Initial Deposit in MT5: ${first_deposit}")
                res = requests.put(f"{API_URL}/settings", json={"defaultBalance": float(first_deposit)})
                if res.status_code == 200:
                    print(f"Automatically synchronized default starting balance: ${first_deposit}")
    except Exception as e:
        print(f"Failed to synchronize initial deposit: {e}")

    from_date = get_last_sync_time(login_id=login, sync_depth=active_account.get("syncHistoryDepth", "all"))
    to_date = datetime.utcnow() + timedelta(days=1)
    
    print(f"Fetching closed deals since: {from_date}")
    history_deals = mt5.history_deals_get(from_date, to_date)
    
    if history_deals is None:
        err_msg = f"Failed to retrieve deals: {mt5.last_error()}"
        print(err_msg)
        update_backend_status("error", last_error=err_msg, account_name=acc_name, account_number=acc_num, broker_server=acc_srv)
        mt5.shutdown()
        return False

    exit_deals = [
        d for d in history_deals 
        if d.entry in [mt5.DEAL_ENTRY_OUT, mt5.DEAL_ENTRY_INOUT, mt5.DEAL_ENTRY_OUT_BY] and d.symbol
    ]

    if not exit_deals:
        print("No new deals to import.")
        update_backend_status("stopped", imported=0, skipped=0, account_name=acc_name, account_number=acc_num, broker_server=acc_srv)
        mt5.shutdown()
        return True

    print(f"Ingesting {len(exit_deals)} deals...")
    trades_to_import = []
    max_timestamp = 0

    for exit_deal in exit_deals:
        position_id = exit_deal.position_id
        if exit_deal.time > max_timestamp:
            max_timestamp = exit_deal.time

        # Find entry deal details
        position_deals = mt5.history_deals_get(position=position_id)
        entry_deal = None
        if position_deals:
            entry_deal = next((d for d in position_deals if d.entry == mt5.DEAL_ENTRY_IN), None)

        open_time = datetime.utcfromtimestamp(entry_deal.time) if entry_deal else datetime.utcfromtimestamp(exit_deal.time - 300)
        close_time = datetime.utcfromtimestamp(exit_deal.time)
        entry_price = entry_deal.price if entry_deal else exit_deal.price
        
        trade_type = "BUY"
        if entry_deal:
            trade_type = "BUY" if entry_deal.type == mt5.DEAL_TYPE_BUY else "SELL"
        else:
            trade_type = "BUY" if exit_deal.type == mt5.DEAL_TYPE_SELL else "SELL"

        # Check entry order details for stopLoss and takeProfit
        stop_loss = 0.0
        take_profit = 0.0
        if entry_deal and entry_deal.order:
            orders = mt5.history_orders_get(ticket=entry_deal.order)
            if orders:
                stop_loss = orders[0].sl
                take_profit = orders[0].tp

        # Session mapping (based on US Eastern Time open hour)
        # Broker close_time is GMT+2/3 (New York Close time). Difference is always exactly 7 hours.
        ny_open_hour = (open_time.hour - 7) % 24
        session = "Other"
        
        # New York Session: 8 AM to 5 PM NY time
        if 8 <= ny_open_hour < 17:
            session = "New York"
        # London Session: 3 AM to 8 AM NY time (overlap starts at 8 AM, priority given to NY)
        elif 3 <= ny_open_hour < 8:
            session = "London"
        # Asia Session: 6 PM to 3 AM NY time
        elif 18 <= ny_open_hour or ny_open_hour < 3:
            session = "Asia"

        trade_data = {
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
            "commission": float(exit_deal.commission),
            "swap": float(exit_deal.swap),
            "netProfit": float(exit_deal.profit + exit_deal.commission + exit_deal.swap),
            "session": session,
            "strategy": "Unassigned"
        }

        if stop_loss > 0:
            trade_data["stopLoss"] = float(stop_loss)
        if take_profit > 0:
            trade_data["takeProfit"] = float(take_profit)

        trades_to_import.append(trade_data)

    # Post to API
    try:
        url = f"{API_URL}/trades/import"
        res = requests.post(url, json=trades_to_import, timeout=15)
        if res.status_code == 201:
            data = res.json()
            imported = data.get("importedCount", 0)
            skipped = data.get("skippedDuplicates", 0)
            print(f"Successfully synced: {imported} imported, {skipped} duplicates skipped.")
            
            if max_timestamp > 0:
                save_last_sync_time(login_id=login, timestamp=max_timestamp)
                
            update_backend_status("stopped", imported=imported, skipped=skipped, account_name=acc_name, account_number=acc_num, broker_server=acc_srv)
        else:
            err_msg = f"Backend upload failed ({res.status_code}): {res.text}"
            print(err_msg)
            update_backend_status("error", last_error=err_msg, account_name=acc_name, account_number=acc_num, broker_server=acc_srv)
    except Exception as e:
        err_msg = f"Failed to upload due to network/API error: {e}"
        print(err_msg)
        update_backend_status("error", last_error=err_msg, account_name=acc_name, account_number=acc_num, broker_server=acc_srv)

    # Clean up connection
    mt5.shutdown()
    return True

def run_loop():
    print(f"MetaTrader 5 Background Sync Daemon running.")
    print(f"Scheduler interval: {SYNC_INTERVAL_SECONDS} seconds.")
    print("Checking backend connection...")
    
    # Test connection
    try:
        res = requests.get(f"{API_URL.replace('/api', '')}/health", timeout=5)
        print(f"Connected to backend API: {res.text.strip()}")
    except Exception as e:
        print(f"WARNING: Cannot reach backend API at {API_URL}: {e}")
        print("Please ensure your Node.js server is running.")

    last_scheduled_run = datetime.min
    
    # Clean initial backend status state
    update_backend_status("stopped")

    while True:
        try:
            current_time = datetime.utcnow()
            
            # 1. Check for manual sync trigger from frontend
            is_triggered = check_manual_trigger()
            
            # 2. Check if scheduled interval has elapsed
            elapsed = (current_time - last_scheduled_run).total_seconds()
            is_scheduled = elapsed >= SYNC_INTERVAL_SECONDS

            if is_triggered or is_scheduled:
                if is_triggered:
                    print("Manual sync request detected from React client!")
                else:
                    print("Starting scheduled sync cycle...")

                # Run sync
                run_sync_cycle()
                
                # Reset timers and flags
                last_scheduled_run = datetime.utcnow()
                if is_triggered:
                    # Update status to set trigger flag to False
                    update_backend_status("stopped", trigger_manual=False)

            # Sleep for short intervals (5 seconds) to keep the manual triggers responsive
            time.sleep(5)
            
        except KeyboardInterrupt:
            print("\nShutting down MT5 background sync daemon...")
            update_backend_status("stopped")
            sys.exit(0)
        except Exception as e:
            print(f"Unexpected error in main daemon loop: {e}")
            update_backend_status("error", last_error=str(e))
            time.sleep(10) # wait before retrying on main crash

if __name__ == "__main__":
    run_loop()
