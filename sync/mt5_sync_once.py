import os
import json
import sys
import time
from datetime import datetime, timedelta
import warnings
import requests
from dotenv import load_dotenv

# Suppress datetime deprecation warnings from standard packages
warnings.filterwarnings("ignore", category=DeprecationWarning)

# Load environment variables
load_dotenv()

API_URL = os.getenv("API_URL", "http://localhost:5000/api")
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
    print("MT5 terminal synchronization is only supported on Windows with MT5 installed.")

def update_backend_status(status, last_error=None, imported=0, skipped=0, account_name=None, account_number=None, broker_server=None):
    """Sends status updates to the Express API."""
    try:
        url = f"{API_URL}/sync/status"
        payload = {
            "status": status,
            "lastSyncTime": datetime.utcnow().isoformat() + "Z",
            "importedCount": imported,
            "skippedDuplicates": skipped,
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
        if res.status_code == 200:
            print(f"Updated backend status to: {status}")
        else:
            print(f"Failed to update backend status: {res.text}")
    except Exception as e:
        print(f"Error connecting to backend API at {API_URL}: {e}")

def get_last_sync_time(login_id, sync_depth="all"):
    """Gets starting timestamp for query from state file or active depth config for this specific login."""
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
    """Saves the latest synced deal close time to state per login ID."""
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

def sync_trades():
    if not mt5_available:
        print("MetaTrader5 package missing. Mark status as mt5_offline.")
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

    # Initialize connection using account credentials
    init_args = {}
    if path:
        init_args["path"] = path
    if login > 0:
        init_args["login"] = login
    if password:
        init_args["password"] = password
    if server:
        init_args["server"] = server

    print(f"Connecting to MetaTrader 5 Terminal (Login: {login}, Server: {server})...")
    if not mt5.initialize(**init_args):
        err_msg = f"initialize() failed for account #{login} on server {server}. Error code: {mt5.last_error()}"
        print(err_msg)
        update_backend_status("mt5_offline", last_error=err_msg)
        return False

    print("Connected to MT5 successfully.")
    
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

    # Set dates
    from_date = get_last_sync_time(login_id=login, sync_depth=active_account.get("syncHistoryDepth", "all"))
    to_date = datetime.utcnow() + timedelta(days=1) # query up to tomorrow to capture everything
    
    print(f"Querying closed deals from {from_date} to {to_date}...")
    
    # Query history deals
    history_deals = mt5.history_deals_get(from_date, to_date)
    if history_deals is None:
        err_msg = f"Failed to retrieve history deals. Error: {mt5.last_error()}"
        print(err_msg)
        update_backend_status("error", last_error=err_msg, account_name=acc_name, account_number=acc_num, broker_server=acc_srv)
        mt5.shutdown()
        return False

    print(f"Found {len(history_deals)} raw deals in MT5 history.")

    # Filter exit deals (DEAL_ENTRY_OUT or DEAL_ENTRY_INOUT)
    # The profit of a position is calculated on the out deal.
    exit_deals = [
        d for d in history_deals 
        if d.entry in [mt5.DEAL_ENTRY_OUT, mt5.DEAL_ENTRY_INOUT, mt5.DEAL_ENTRY_OUT_BY] and d.symbol
    ]
    
    if not exit_deals:
        print("No new closed trades found in the selected date range.")
        update_backend_status("stopped", imported=0, skipped=0, account_name=acc_name, account_number=acc_num, broker_server=acc_srv)
        mt5.shutdown()
        return True

    print(f"Processing {len(exit_deals)} closed trades...")
    trades_to_import = []
    max_timestamp = 0

    for exit_deal in exit_deals:
        position_id = exit_deal.position_id
        
        # Keep track of latest sync time
        if exit_deal.time > max_timestamp:
            max_timestamp = exit_deal.time

        # Retrieve all deals associated with this position to locate the entry deal
        position_deals = mt5.history_deals_get(position=position_id)
        entry_deal = None
        if position_deals:
            # Entry deal is usually the first DEAL_ENTRY_IN
            entry_deal = next((d for d in position_deals if d.entry == mt5.DEAL_ENTRY_IN), None)

        # Fallback values if entry deal isn't available in historical cache
        open_time = datetime.utcfromtimestamp(entry_deal.time) if entry_deal else datetime.utcfromtimestamp(exit_deal.time - 300)
        close_time = datetime.utcfromtimestamp(exit_deal.time)
        entry_price = entry_deal.price if entry_deal else exit_deal.price
        
        # BUY or SELL mapping
        trade_type = "BUY"
        if entry_deal:
            trade_type = "BUY" if entry_deal.type == mt5.DEAL_TYPE_BUY else "SELL"
        else:
            # If entry not found, exit deal type is opposite
            trade_type = "BUY" if exit_deal.type == mt5.DEAL_TYPE_SELL else "SELL"

        # Look up Stop Loss & Take Profit from entry order history
        stop_loss = 0.0
        take_profit = 0.0
        if entry_deal and entry_deal.order:
            orders = mt5.history_orders_get(ticket=entry_deal.order)
            if orders:
                entry_order = orders[0]
                stop_loss = entry_order.sl
                take_profit = entry_order.tp

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

        # Transform to MongoDB schema format
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

    # Post to Backend
    print(f"Syncing {len(trades_to_import)} trades to Express backend...")
    try:
        url = f"{API_URL}/trades/import"
        res = requests.post(url, json=trades_to_import, timeout=15)
        
        if res.status_code == 201:
            data = res.json()
            imported = data.get("importedCount", 0)
            skipped = data.get("skippedDuplicates", 0)
            print(f"Backend Response: Imported {imported} new trades, skipped {skipped} duplicates.")
            
            # Save state
            if max_timestamp > 0:
                save_last_sync_time(login_id=login, timestamp=max_timestamp)
                
            update_backend_status("stopped", imported=imported, skipped=skipped, account_name=acc_name, account_number=acc_num, broker_server=acc_srv)
        else:
            err_msg = f"Failed to upload trades. Backend code: {res.status_code}, Body: {res.text}"
            print(err_msg)
            update_backend_status("error", last_error=err_msg, account_name=acc_name, account_number=acc_num, broker_server=acc_srv)
    except Exception as e:
        err_msg = f"Error connection to backend during upload: {e}"
        print(err_msg)
        update_backend_status("error", last_error=err_msg, account_name=acc_name, account_number=acc_num, broker_server=acc_srv)

    # Shutdown MT5 connection
    mt5.shutdown()
    return True

if __name__ == "__main__":
    print("Starting MetaTrader 5 Sync Once script...")
    update_backend_status("running")
    success = sync_trades()
    if success:
        print("Sync complete.")
    else:
        print("Sync aborted.")
