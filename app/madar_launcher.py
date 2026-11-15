"""Madar Windows launcher: one-time-installed per-user background localhost server.
No privileged OS actions; service can be disabled by deleting its Startup shortcut.
"""
from __future__ import annotations
import argparse
import logging
import os
import subprocess
import sys
import time
import urllib.request
import webbrowser
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent


def default_home() -> Path:
    # Installed packages keep runtime files beside the App directory.
    if APP_DIR.name == 'App':
        return APP_DIR.parent
    # Source checkouts keep runtime data outside the public repository.
    local_app_data = os.environ.get('LOCALAPPDATA')
    if local_app_data:
        return Path(local_app_data) / 'Madar'
    return Path.home() / 'AppData' / 'Local' / 'Madar'


BASE = Path(os.environ.get('MADAR_HOME') or default_home()).expanduser().resolve()
DATA = BASE / 'Data'
LOGS = BASE / 'Logs'
PORT = int(os.environ.get('MADAR_PORT', '8765'))
URL = f'http://127.0.0.1:{PORT}'


def env():
    e = os.environ.copy()
    e['MADAR_DATA_DIR'] = str(DATA)
    e['MADAR_HOME'] = str(BASE)
    e['MADAR_PORT'] = str(PORT)
    # Ensure child stdout/stderr encode non-ASCII safely in installed log files.
    e['PYTHONIOENCODING'] = 'utf-8:backslashreplace'
    return e


def service_alive():
    try:
        with urllib.request.urlopen(URL + '/api/health', timeout=1.1) as r:
            import json
            obj = json.loads(r.read(4096))
            return obj.get('applicationId') == 'madar-local' and r.status == 200
    except Exception:
        return False


def port_occupied():
    import socket
    with socket.socket() as s:
        return s.connect_ex(('127.0.0.1', PORT)) == 0


def prepare_logs():
    LOGS.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(filename=str(LOGS / 'startup.log'), encoding='utf-8',
                        level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--server', action='store_true')
    p.add_argument('--open', action='store_true')
    p.add_argument('--status', action='store_true')
    args = p.parse_args()
    prepare_logs()
    if args.status:
        print('active' if service_alive() else 'stopped')
        return 0 if service_alive() else 1
    if args.server:
        if service_alive():
            logging.info('Already running')
            return 0
        if port_occupied():
            logging.error('Port %d is occupied by a different process. Refusing to replace it.', PORT)
            return 2
        os.environ.update(env())
        try:
            from madar_ai_server import serve
            serve()
            return 0
        except Exception:
            logging.exception('Unable to run Madar service')
            return 2
    # Clicking the desktop icon starts the server if it was not already started on sign-in.
    if not service_alive():
        if port_occupied():
            logging.error('Port occupied by a service other than Madar')
            return 2
        opts = {}
        if os.name == 'nt':
            opts['creationflags'] = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS
        with (LOGS / 'server.log').open('ab') as fp:
            subprocess.Popen([sys.executable, str(APP_DIR / 'madar_launcher.py'), '--server'],
                             cwd=str(APP_DIR), env=env(), stdin=subprocess.DEVNULL,
                             stdout=fp, stderr=subprocess.STDOUT, **opts)
        for i in range(35):
            if service_alive():
                break
            if port_occupied() and i > 5:  # may be a freshly started service; wait a little
                pass
            time.sleep(0.2)
    if not service_alive():
        logging.error('Madar server did not become ready; inspect Logs/startup.log')
        return 2
    webbrowser.open(URL, new=2)
    return 0

if __name__ == '__main__':
    sys.exit(main())
