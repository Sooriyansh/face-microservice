import argparse
import atexit
import ctypes
import json
import os
import platform
import socket
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

try:
    import psutil
    import win32evtlog
    import win32evtlogutil
except ImportError as error:
    print(
        "Missing dependency. Run `npm run setup:python` or install pywin32 and psutil first.",
        file=sys.stderr,
    )
    raise SystemExit(str(error))


SYSTEM_EVENT_MAP = {
    6005: {
        "event": "Startup",
        "meaning": "Laptop ON hua",
        "providers": {"EventLog"},
    },
    6006: {
        "event": "Shutdown",
        "meaning": "Laptop OFF hua",
        "providers": {"EventLog"},
    },
    6008: {
        "event": "Unexpected Shutdown",
        "meaning": "Laptop unexpectedly OFF hua",
        "providers": {"EventLog"},
    },
    1074: {
        "event": "Shutdown",
        "meaning": "Shutdown ya restart initiate hua",
        "providers": {"USER32"},
    },
    42: {
        "event": "Sleep",
        "meaning": "Sleep mode",
        "providers": {"Microsoft-Windows-Kernel-Power"},
    },
    1: {
        "event": "Wakeup",
        "meaning": "Sleep se wapas ON",
        "providers": {"Microsoft-Windows-Power-Troubleshooter"},
    },
}

SECURITY_EVENT_MAP = {
    4800: {
        "event": "Lock",
        "meaning": "Screen lock",
        "providers": {"Microsoft-Windows-Security-Auditing"},
    },
    4801: {
        "event": "Unlock",
        "meaning": "Screen unlock",
        "providers": {"Microsoft-Windows-Security-Auditing"},
    },
    4624: {
        "event": "Login",
        "meaning": "User login",
        "providers": {"Microsoft-Windows-Security-Auditing"},
    },
    4634: {
        "event": "Logout",
        "meaning": "User logout",
        "providers": {"Microsoft-Windows-Security-Auditing"},
    },
    4778: {
        "event": "User Session Start",
        "meaning": "User session reconnected",
        "providers": {"Microsoft-Windows-Security-Auditing"},
    },
    4779: {
        "event": "User Session End",
        "meaning": "User session disconnected",
        "providers": {"Microsoft-Windows-Security-Auditing"},
    },
}

LOG_CONFIG = {
    "System": SYSTEM_EVENT_MAP,
    "Security": SECURITY_EVENT_MAP,
}


class LASTINPUTINFO(ctypes.Structure):
    _fields_ = [("cbSize", ctypes.c_uint), ("dwTime", ctypes.c_uint)]


class POINT(ctypes.Structure):
    _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]


if platform.system() == "Windows":
    USER32 = ctypes.windll.user32
    KERNEL32 = ctypes.windll.kernel32
else:
    USER32 = None
    KERNEL32 = None


def utc_now():
    return datetime.now(timezone.utc)


def current_user():
    domain = os.getenv("USERDOMAIN", "")
    username = os.getenv("USERNAME", "")
    return f"{domain}\\{username}" if domain and username else username


def default_state_file():
    base = os.getenv("LOCALAPPDATA") or os.getenv("TEMP") or "."
    return str(Path(base) / "EmployeeActivityMonitor" / "state.json")


def load_state(path):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return {}


def save_state(path, state):
    try:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(state, handle, indent=2, sort_keys=True)
    except Exception as error:
        print(f"Could not save monitor state: {error}", file=sys.stderr)


def get_idle_ms():
    if not USER32 or not KERNEL32:
        return 0
    info = LASTINPUTINFO()
    info.cbSize = ctypes.sizeof(LASTINPUTINFO)
    if not USER32.GetLastInputInfo(ctypes.byref(info)):
        return 0
    elapsed = KERNEL32.GetTickCount() - info.dwTime
    return max(int(elapsed), 0)


def get_cursor_position():
    if not USER32:
        return None
    point = POINT()
    if USER32.GetCursorPos(ctypes.byref(point)):
        return point.x, point.y
    return None


def keyboard_pressed():
    if not USER32:
        return False
    # Polling high-level key state is intentionally lightweight; it avoids a global hook.
    for virtual_key in range(8, 256):
        if USER32.GetAsyncKeyState(virtual_key) & 0x8000:
            return True
    return False


def event_id(raw_event_id):
    return int(raw_event_id) & 0xFFFF


def iso_datetime(value):
    if hasattr(value, "astimezone"):
        return value.astimezone(timezone.utc).isoformat()
    return str(value)


def format_message(log_name, event):
    try:
        return win32evtlogutil.SafeFormatMessage(event, log_name).strip()
    except Exception:
        return ""


def rule_matches_provider(rule, provider):
    providers = rule.get("providers")
    return not providers or provider in providers


def classify_event(log_name, current_event_id, message):
    rule = LOG_CONFIG[log_name][current_event_id]
    event_name = rule["event"]
    meaning = rule["meaning"]

    if current_event_id == 1074:
        lowered = message.lower()
        if "restart" in lowered or "reboot" in lowered:
            return "Restart", "Restart hua"
        return "Shutdown", "Laptop OFF hua"

    return event_name, meaning


def read_windows_events(max_records):
    computer_name = socket.gethostname()
    collected = []

    for log_name, event_map in LOG_CONFIG.items():
        try:
            handle = win32evtlog.OpenEventLog(None, log_name)
        except Exception as error:
            print(f"Could not open {log_name} log: {error}", file=sys.stderr)
            continue

        flags = win32evtlog.EVENTLOG_BACKWARDS_READ | win32evtlog.EVENTLOG_SEQUENTIAL_READ
        records_seen = 0

        try:
            while records_seen < max_records:
                events = win32evtlog.ReadEventLog(handle, flags, 0)
                if not events:
                    break

                for event in events:
                    records_seen += 1
                    current_event_id = event_id(event.EventID)

                    provider = str(event.SourceName or "")

                    if current_event_id not in event_map:
                        if records_seen >= max_records:
                            break
                        continue

                    if not rule_matches_provider(event_map[current_event_id], provider):
                        if records_seen >= max_records:
                            break
                        continue

                    message = format_message(log_name, event)
                    event_name, meaning = classify_event(log_name, current_event_id, message)
                    record_number = int(event.RecordNumber)

                    collected.append(
                        {
                            "event": event_name,
                            "meaning": meaning,
                            "occurredAt": iso_datetime(event.TimeGenerated),
                            "eventId": current_event_id,
                            "sourceLog": log_name,
                            "provider": provider,
                            "recordNumber": record_number,
                            "computer": str(event.ComputerName or computer_name),
                            "user": "",
                            "message": message[:2000],
                            "externalId": f"{log_name}:{record_number}:{current_event_id}",
                        }
                    )

                    if records_seen >= max_records:
                        break
        finally:
            win32evtlog.CloseEventLog(handle)

    return collected


def add_boot_event(events):
    boot_time = getattr(psutil, "boot_time", lambda: None)()
    if not boot_time:
        return events

    occurred_at = time.strftime("%Y-%m-%dT%H:%M:%S%z", time.localtime(boot_time))
    events.append(
        {
            "event": "Startup",
            "meaning": "Laptop ON hua",
            "occurredAt": occurred_at,
            "eventId": 0,
            "sourceLog": "psutil",
            "provider": "psutil.boot_time",
            "recordNumber": None,
            "computer": socket.gethostname(),
            "user": os.getenv("USERNAME", ""),
            "message": "Current boot time detected by psutil.",
            "externalId": f"psutil:boot:{int(boot_time)}",
        }
    )
    return events


def base_event(args, event_name, meaning, occurred_at=None, duration_ms=0, status="Recorded", metadata=None):
    occurred_at = occurred_at or utc_now()
    millis = int(occurred_at.timestamp() * 1000)
    computer = socket.gethostname()
    employee_id = args.employee_id or os.getenv("EMPLOYEE_ID", "")
    employee_name = args.employee_name or os.getenv("EMPLOYEE_NAME", "")
    return {
        "event": event_name,
        "meaning": meaning,
        "occurredAt": occurred_at.isoformat(),
        "eventId": 0,
        "sourceLog": "LiveMonitor",
        "provider": "WindowsActivityCollector",
        "recordNumber": None,
        "computer": computer,
        "employeeId": employee_id,
        "employeeName": employee_name,
        "user": current_user(),
        "durationMs": max(int(duration_ms or 0), 0),
        "status": status,
        "message": meaning,
        "metadata": metadata or {},
        "externalId": f"live:{computer}:{event_name}:{millis}",
    }


class LiveActivityTracker:
    def __init__(self, args):
        self.args = args
        self.state_path = args.state_file
        self.state = load_state(self.state_path)
        self.last_sample_at = utc_now()
        self.last_cursor = get_cursor_position()
        self.was_idle = bool(self.state.get("wasIdle", False))
        self.display_off = bool(self.state.get("displayOff", False))
        self.sleep_started_at = self.state.get("sleepStartedAt")

    def persist(self):
        self.state.update(
            {
                "wasIdle": self.was_idle,
                "displayOff": self.display_off,
                "lastSeenAt": utc_now().isoformat(),
                "sleepStartedAt": self.sleep_started_at,
            }
        )
        save_state(self.state_path, self.state)

    def startup_events(self):
        previous_seen = self.state.get("lastSeenAt")
        events = [
            base_event(self.args, "User Session Start", "Activity collector started for the Windows user session."),
        ]
        if previous_seen:
            try:
                gap_ms = int((utc_now() - datetime.fromisoformat(previous_seen)).total_seconds() * 1000)
                if gap_ms > max(self.args.interval * 3000, 120000):
                    events.append(
                        base_event(
                            self.args,
                            "Wakeup",
                            "Activity collector resumed after a gap. The device may have slept, restarted, or recovered from a crash.",
                            duration_ms=gap_ms,
                            status="Recovered",
                            metadata={"previousSeenAt": previous_seen},
                        )
                    )
            except Exception:
                pass
        return events

    def shutdown_event(self):
        return base_event(self.args, "User Session End", "Activity collector stopped for the Windows user session.", status="Stopped")

    def sample(self):
        now = utc_now()
        elapsed_ms = max(int((now - self.last_sample_at).total_seconds() * 1000), 0)
        idle_ms = get_idle_ms()
        is_idle = idle_ms >= self.args.idle_threshold * 1000
        cursor = get_cursor_position()
        key_active = keyboard_pressed()
        mouse_active = cursor is not None and self.last_cursor is not None and cursor != self.last_cursor
        events = []

        if mouse_active:
            events.append(base_event(self.args, "Mouse Activity", "Mouse activity detected.", status="Active"))
        if key_active:
            events.append(base_event(self.args, "Keyboard Activity", "Keyboard activity detected.", status="Active"))

        if is_idle:
            events.append(
                base_event(
                    self.args,
                    "Idle Time",
                    "No keyboard or mouse activity detected.",
                    duration_ms=elapsed_ms,
                    status="Idle",
                    metadata={"idleMs": idle_ms},
                )
            )
        else:
            events.append(
                base_event(
                    self.args,
                    "Active Usage",
                    "Keyboard or mouse activity detected in the sampling window.",
                    duration_ms=elapsed_ms,
                    status="Active",
                    metadata={"idleMs": idle_ms},
                )
            )

        if is_idle and not self.was_idle:
            events.append(base_event(self.args, "Idle State", "Windows user session became idle.", status="Idle", metadata={"idleMs": idle_ms}))
        if not is_idle and self.was_idle:
            events.append(base_event(self.args, "Active State", "Windows user session became active.", status="Active", metadata={"idleMs": idle_ms}))

        should_display_off = idle_ms >= self.args.display_off_threshold * 1000
        if should_display_off and not self.display_off:
            events.append(base_event(self.args, "Display Off", "Display considered off after extended user inactivity.", status="Display Off", metadata={"inferred": True, "idleMs": idle_ms}))
        if not should_display_off and self.display_off:
            events.append(base_event(self.args, "Display On", "Display considered on after user activity resumed.", status="Display On", metadata={"inferred": True, "idleMs": idle_ms}))

        self.was_idle = is_idle
        self.display_off = should_display_off
        self.last_cursor = cursor
        self.last_sample_at = now
        self.persist()
        return events


def enrich_event_identity(events, args):
    employee_id = args.employee_id or os.getenv("EMPLOYEE_ID", "")
    employee_name = args.employee_name or os.getenv("EMPLOYEE_NAME", "")
    for event in events:
        event.setdefault("computer", socket.gethostname())
        event["employeeId"] = event.get("employeeId") or employee_id
        event["employeeName"] = event.get("employeeName") or employee_name
        event["user"] = event.get("user") or current_user()
        event.setdefault("durationMs", 0)
        event.setdefault("status", "Recorded")
        event.setdefault("metadata", {})
    return events


def post_events(api_url, events, collector_token=""):
    if not events:
        return {"received": 0, "inserted": 0}

    headers = {}
    if collector_token:
        headers["x-collector-token"] = collector_token
    response = requests.post(api_url, json={"events": events}, headers=headers, timeout=15)
    response.raise_for_status()
    return response.json()


def run_once(api_url, max_records, args, live_tracker=None):
    events = add_boot_event(read_windows_events(max_records))
    if live_tracker:
        events.extend(live_tracker.sample())
    events = enrich_event_identity(events, args)
    result = post_events(api_url, events, args.collector_token or os.getenv("SYSTEM_EVENTS_COLLECTOR_TOKEN", ""))
    print(
        f"Sent {result.get('received', 0)} event(s), inserted {result.get('inserted', 0)} new event(s).",
        flush=True,
    )


def main():
    parser = argparse.ArgumentParser(description="Monitor Windows system events and send them to the dashboard API.")
    parser.add_argument(
        "--api-url",
        default="http://localhost:8080/api/system-events/ingest",
        help="Node API endpoint that stores system events.",
    )
    parser.add_argument("--interval", type=int, default=60, help="Polling interval in seconds.")
    parser.add_argument("--max-records", type=int, default=500, help="Recent records to scan per Windows log.")
    parser.add_argument("--once", action="store_true", help="Collect events once and exit.")
    parser.add_argument("--employee-id", default=os.getenv("EMPLOYEE_ID", ""), help="Employee ID/roll number to attach to events.")
    parser.add_argument("--employee-name", default=os.getenv("EMPLOYEE_NAME", ""), help="Employee name to attach to events.")
    parser.add_argument("--collector-token", default=os.getenv("SYSTEM_EVENTS_COLLECTOR_TOKEN", ""), help="Trusted collector token for unattended ingestion.")
    parser.add_argument("--idle-threshold", type=int, default=120, help="Seconds without input before the user is idle.")
    parser.add_argument("--display-off-threshold", type=int, default=300, help="Seconds without input before display is treated as off.")
    parser.add_argument("--state-file", default=default_state_file(), help="State file used to recover after sleep/restart/crash.")
    args = parser.parse_args()

    if platform.system() != "Windows":
        raise SystemExit("System event monitoring is available only on Windows.")

    if args.once:
        live_tracker = LiveActivityTracker(args)
        events = enrich_event_identity(add_boot_event(read_windows_events(args.max_records)) + live_tracker.sample(), args)
        result = post_events(args.api_url, events, args.collector_token)
        print(f"Sent {result.get('received', 0)} event(s), inserted {result.get('inserted', 0)} new event(s).", flush=True)
        return

    live_tracker = LiveActivityTracker(args)

    shutdown_sent = False

    def send_shutdown_event():
        nonlocal shutdown_sent
        if shutdown_sent:
            return
        shutdown_sent = True
        try:
            post_events(args.api_url, enrich_event_identity([live_tracker.shutdown_event()], args), args.collector_token)
        except Exception:
            pass

    atexit.register(send_shutdown_event)
    print("Windows system event monitor started. Press Ctrl+C to stop.", flush=True)
    try:
        post_events(args.api_url, enrich_event_identity(live_tracker.startup_events(), args), args.collector_token)
    except Exception as error:
        print(f"Startup event error: {error}", file=sys.stderr, flush=True)
    while True:
        try:
            run_once(args.api_url, args.max_records, args, live_tracker)
        except KeyboardInterrupt:
            send_shutdown_event()
            raise
        except Exception as error:
            print(f"Monitor error: {error}", file=sys.stderr, flush=True)
        time.sleep(max(args.interval, 5))


if __name__ == "__main__":
    main()
