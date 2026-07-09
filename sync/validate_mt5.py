import sys
import json

try:
    import MetaTrader5 as mt5
    mt5_available = True
except ImportError:
    mt5_available = False

def main():
    if not mt5_available:
        print("ERROR: MetaTrader5 Python library is not installed on this system.")
        sys.exit(1)

    try:
        # Read credentials from stdin
        input_data = json.loads(sys.stdin.read())
        login = int(input_data.get("login", 0))
        password = input_data.get("password", "")
        server = input_data.get("server", "")
        path = input_data.get("path", "")
        
        init_args = {}
        if path:
            init_args["path"] = path
        if login > 0:
            init_args["login"] = login
        if password:
            init_args["password"] = password
        if server:
            init_args["server"] = server
            
        # Attempt MT5 connection
        if not mt5.initialize(**init_args):
            err_info = mt5.last_error()
            print(f"MT5 Connection failed: Error code {err_info[0] if err_info else 'unknown'}")
            sys.exit(1)
            
        # Verify account details
        acc_info = mt5.account_info()
        if acc_info is None:
            err_info = mt5.last_error()
            print(f"Connected, but login failed: Error code {err_info[0] if err_info else 'unknown'}. Check password and server.")
            mt5.shutdown()
            sys.exit(1)
            
        # Ensure login matches
        if acc_info.login != login:
            print(f"MT5 is logged into account #{acc_info.login} instead of expected #{login}. Please check credentials.")
            mt5.shutdown()
            sys.exit(1)
            
        print("SUCCESS")
        mt5.shutdown()
        sys.exit(0)
    except Exception as e:
        print(f"Validator script exception: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()
