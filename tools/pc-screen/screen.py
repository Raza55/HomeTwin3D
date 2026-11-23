"""Small Windows desktop snapshots -> Home Assistant MQTT discovery camera."""
import argparse
import ctypes
import io
import json
import logging
from logging.handlers import RotatingFileHandler
import os
import re
import socket
import ssl
from ctypes import wintypes
from pathlib import Path
import threading
import time

from PIL import Image
import mss
import paho.mqtt.client as mqtt

MAX_BYTES = 200_000
DEFAULT_INTERVAL = 10  # seconds between frames; config "interval" overrides
BASE = "hometwin/desktop_main_screen"
DISCOVERY = "homeassistant/camera/hometwin_desktop_main_screen/config"
SWITCH_DISCOVERY = "homeassistant/switch/hometwin_desktop_main_screen_enabled/config"
DEVICE = {"identifiers": ["hometwin_desktop_main_screen_helper"],
          "name": "DesktopMain Screenshot", "manufacturer": "HomeTwin3D",
          "model": "JPEG MQTT helper"}


def encode_image(image):
    image = image.convert("RGB")
    # Bound both axes for portrait monitors, without distorting the image.
    image.thumbnail((1920, 1080), Image.Resampling.LANCZOS)
    for quality in (65, 50, 35, 25, 15, 8):
        output = io.BytesIO()
        image.save(output, format="JPEG", quality=quality)
        payload = output.getvalue()
        if len(payload) <= MAX_BYTES:
            return payload
    raise ValueError("JPEG exceeds 200 KB; frame skipped")


def discovery():
    return {
        "name": "Bildschirm",
        "unique_id": "hometwin_desktop_main_screen",
        "default_entity_id": "camera.desktop_main_bildschirm",
        "topic": BASE + "/image",
        # Keep the default UTF-8 for availability text; camera image topics
        # are decoded as binary by Home Assistant independently.
        # The camera needs both: a fresh frame and a running helper (last will).
        "availability": [{"topic": BASE + "/availability"}, {"topic": BASE + "/helper"}],
        "availability_mode": "all",
        "device": DEVICE,
    }


def switch_discovery():
    """Home Assistant switch that pauses and resumes the capture."""
    return {
        "name": "Screenshots",
        "unique_id": "hometwin_desktop_main_screen_enabled",
        "default_entity_id": "switch.desktop_main_screenshots",
        "icon": "mdi:monitor-screenshot",
        "command_topic": BASE + "/enabled/set",
        "state_topic": BASE + "/enabled",
        "availability_topic": BASE + "/helper",
        "device": DEVICE,
    }


def read_enabled(data_dir):
    """Capture is off until the switch was turned on; the choice survives restarts."""
    try:
        return (data_dir / "enabled").read_text(encoding="utf-8").strip() == "ON"
    except OSError:
        return False


def write_enabled(data_dir, enabled):
    (data_dir / "enabled").write_text("ON" if enabled else "OFF", encoding="utf-8")


class _MonitorInfo(ctypes.Structure):
    _fields_ = [("cbSize", wintypes.DWORD), ("rcMonitor", wintypes.RECT), ("rcWork", wintypes.RECT),
                ("dwFlags", wintypes.DWORD), ("szDevice", wintypes.WCHAR * 32)]


class _DisplayDevice(ctypes.Structure):
    _fields_ = [("cb", wintypes.DWORD), ("DeviceName", wintypes.WCHAR * 32), ("DeviceString", wintypes.WCHAR * 128),
                ("StateFlags", wintypes.DWORD), ("DeviceID", wintypes.WCHAR * 128), ("DeviceKey", wintypes.WCHAR * 128)]


def monitor_id(device_id):
    """PnP hardware ID of a monitor (e.g. DON0074), stable across desktop layouts."""
    match = re.search(r"(?:DISPLAY|MONITOR)[#\\]([A-Za-z0-9]{3,8})(?:[#\\]|$)", str(device_id or ""))
    return match.group(1).upper() if match else ""


def list_monitors():
    """Active desktop monitors in Windows enumeration order (the same order as mss)."""
    user32 = ctypes.WinDLL("user32", use_last_error=True)
    callback_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HMONITOR, wintypes.HDC,
                                       ctypes.POINTER(wintypes.RECT), wintypes.LPARAM)
    user32.GetMonitorInfoW.argtypes = [wintypes.HMONITOR, ctypes.POINTER(_MonitorInfo)]
    user32.EnumDisplayDevicesW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, ctypes.POINTER(_DisplayDevice), wintypes.DWORD]
    monitors = []

    def callback(handle, _hdc, _rect, _data):
        info = _MonitorInfo()
        info.cbSize = ctypes.sizeof(_MonitorInfo)
        if not user32.GetMonitorInfoW(handle, ctypes.byref(info)):
            return True
        # A display output can list several monitors (e.g. "second screen only"):
        # only the one flagged DISPLAY_DEVICE_ACTIVE currently shows the desktop.
        ids, index = [], 0
        while True:
            device = _DisplayDevice()
            device.cb = ctypes.sizeof(_DisplayDevice)
            if not user32.EnumDisplayDevicesW(info.szDevice, index, ctypes.byref(device), 1):
                break
            if device.StateFlags & 1 and monitor_id(device.DeviceID):
                ids.append(monitor_id(device.DeviceID))
            index += 1
        rect = info.rcMonitor
        monitors.append({"left": rect.left, "top": rect.top, "width": rect.right - rect.left,
                         "height": rect.bottom - rect.top, "primary": bool(info.dwFlags & 1), "ids": ids})
        return True

    try:
        ctypes.WinDLL("shcore").SetProcessDpiAwareness(2)  # physical pixels, as mss expects
    except OSError:
        pass
    user32.EnumDisplayMonitors(None, None, callback_type(callback), 0)
    return monitors


def select_monitor(monitors, config):
    """The TV wins whenever Windows currently drives it; otherwise the fixed screen index."""
    wanted = str(config.get("tv_monitor") or "").strip().upper()
    if wanted:
        for monitor in monitors:
            if wanted in monitor["ids"]:
                return monitor, "tv"
    index = int(config["screen"])
    if index < 0 or index >= len(monitors):
        raise ValueError("Configured monitor is not connected")
    return monitors[index], "screen"


def capture_interval(config):
    """Seconds between frames, clamped to 2..300 so a typo cannot flood the broker or stall the camera."""
    try:
        value = int(config.get("interval", DEFAULT_INTERVAL))
    except (TypeError, ValueError):
        value = DEFAULT_INTERVAL
    return min(300, max(2, value))


def describe_monitor(monitor):
    return f"{monitor['width']}x{monitor['height']} at {monitor['left']},{monitor['top']}" +         (f" [{'+'.join(monitor['ids'])}]" if monitor["ids"] else "") + (" primary" if monitor["primary"] else "")


def desktop_unlocked():
    """Fail closed if the input desktop is locked, secure, or inaccessible."""
    user32 = ctypes.WinDLL("user32", use_last_error=True)
    user32.OpenInputDesktop.argtypes = [ctypes.c_uint, ctypes.c_bool, ctypes.c_uint]
    user32.OpenInputDesktop.restype = ctypes.c_void_p
    user32.SwitchDesktop.argtypes = [ctypes.c_void_p]
    user32.CloseDesktop.argtypes = [ctypes.c_void_p]
    handle = user32.OpenInputDesktop(0, False, 0x0100)  # DESKTOP_SWITCHDESKTOP
    if not handle:
        return False
    try:
        return bool(user32.SwitchDesktop(handle))
    finally:
        user32.CloseDesktop(handle)


def send_frame(client, image):
    payload = encode_image(image)
    # QoS 0: no stale screenshots queued for retransmission after reconnect.
    message = client.publish(BASE + "/image", payload, qos=0, retain=False)
    if message.rc != mqtt.MQTT_ERR_SUCCESS:
        return False
    message.wait_for_publish(timeout=5)
    if not message.is_published():
        return False
    client.publish(BASE + "/availability", "online", qos=0, retain=True)
    with Image.open(io.BytesIO(payload)) as preview:
        logging.info("JPEG sent: %dx%d, %d bytes", *preview.size, len(payload))
    return True


def run(config, data_dir):
    ready = threading.Event()
    refresh = threading.Event()
    enabled = threading.Event()
    if read_enabled(data_dir):
        enabled.set()
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2,
                         client_id="hometwin-pc-screen", clean_session=True)
    client.username_pw_set(os.environ.pop("DESKTOP_MQTT_USER"),
                          os.environ.pop("DESKTOP_MQTT_PASSWORD"))
    if config["tls"]:
        context = ssl.create_default_context(cafile=config.get("ca_file") or None)
        # Paho's async retry otherwise hides certificate failures at DEBUG level.
        try:
            with socket.create_connection((config["host"], int(config["port"])), timeout=5) as raw:
                with context.wrap_socket(raw, server_hostname=config["host"]):
                    pass
        except ssl.SSLError as exc:
            logging.error("TLS verification failed: %s", exc)
            raise
        except OSError as exc:
            logging.warning("Broker unreachable; retrying in background (%s)", type(exc).__name__)
        client.tls_set_context(context)
    client.will_set(BASE + "/helper", "offline", qos=1, retain=True)
    client.reconnect_delay_set(min_delay=5, max_delay=60)
    client.max_queued_messages_set(2)

    def announce(c):
        c.publish(DISCOVERY, json.dumps(discovery()), qos=0, retain=True)
        c.publish(SWITCH_DISCOVERY, json.dumps(switch_discovery()), qos=0, retain=True)
        c.publish(BASE + "/helper", "online", qos=0, retain=True)
        c.publish(BASE + "/enabled", "ON" if enabled.is_set() else "OFF", qos=0, retain=True)

    def on_connect(c, userdata, flags, reason, properties):
        if reason.is_failure:
            logging.warning("MQTT refused: %s", reason)
            return
        c.publish(BASE + "/availability", "offline", qos=0, retain=True)
        announce(c)
        c.subscribe([("homeassistant/status", 0), (BASE + "/enabled/set", 1)])
        ready.set()
        refresh.set()
        logging.info("MQTT connected")

    def on_disconnect(c, userdata, flags, reason, properties):
        ready.clear()
        logging.warning("MQTT disconnected: %s", reason)

    def on_message(c, userdata, message):
        if message.topic == "homeassistant/status" and message.payload == b"online":
            announce(c)
            refresh.set()
        elif message.topic == BASE + "/enabled/set" and message.payload in (b"ON", b"OFF"):
            on = message.payload == b"ON"
            if on:
                enabled.set()
                refresh.set()
            else:
                enabled.clear()
                c.publish(BASE + "/availability", "offline", qos=0, retain=True)
            try:
                write_enabled(data_dir, on)
            except OSError as exc:
                logging.warning("Switch state not saved: %s", type(exc).__name__)
            c.publish(BASE + "/enabled", "ON" if on else "OFF", qos=0, retain=True)
            logging.info("Screenshots switched %s", "on" if on else "off")

    client.on_connect = on_connect
    client.on_disconnect = on_disconnect
    client.on_message = on_message
    client.on_connect_fail = lambda c, u: logging.warning(
        "MQTT connection failed; check host, port and TLS. Retrying in 5-60 seconds.")
    logging.info("Connecting to MQTT %s:%s (TLS=%s)", config["host"], config["port"], config["tls"])
    client.connect_async(config["host"], int(config["port"]), keepalive=30)
    client.loop_start()
    stop_file = data_dir / "stop"
    interval = capture_interval(config)
    next_frame = 0.0
    locked = False
    paused = False
    source = None
    logging.info("Capture interval: %d s", interval)
    try:
        while not stop_file.exists():
            if not ready.is_set():
                time.sleep(1)
                continue
            if not enabled.is_set():
                if not paused:
                    client.publish(BASE + "/availability", "offline", qos=0, retain=True)
                    logging.info("Screenshots off: capture paused")
                paused = True
                next_frame = 0.0
                time.sleep(1)
                continue
            paused = False
            if not desktop_unlocked():
                if not locked:
                    client.publish(BASE + "/availability", "offline", qos=0, retain=True)
                    logging.info("Desktop locked: capture paused")
                locked = True
                next_frame = 0.0
                time.sleep(1)
                continue
            locked = False
            if time.monotonic() < next_frame and not refresh.is_set():
                time.sleep(1)
                continue
            refresh.clear()
            next_frame = time.monotonic() + interval
            try:
                with mss.MSS() as capture:
                    monitor, role = select_monitor(list_monitors(), config)
                    key = (role, tuple(monitor["ids"]), monitor["width"], monitor["height"], monitor["left"], monitor["top"])
                    if key != source:
                        source = key
                        logging.info("Capture source: %s %s", "TV" if role == "tv" else "screen", describe_monitor(monitor))
                    shot = capture.grab({k: monitor[k] for k in ("left", "top", "width", "height")})
                    image = Image.frombytes("RGB", shot.size, shot.rgb)
                # Recheck in case Windows locked during capture.
                if not enabled.is_set():
                    continue  # switched off during the capture: drop the frame
                if desktop_unlocked():
                    if not send_frame(client, image):
                        client.publish(BASE + "/availability", "offline", retain=True)
                else:
                    client.publish(BASE + "/availability", "offline", retain=True)
            except Exception as exc:
                logging.warning("Capture skipped: %s", type(exc).__name__)
                client.publish(BASE + "/availability", "offline", retain=True)
    except KeyboardInterrupt:
        pass
    finally:
        if client.is_connected():
            client.publish(BASE + "/availability", "offline", qos=1, retain=True)
            info = client.publish(BASE + "/helper", "offline", qos=1, retain=True)
            info.wait_for_publish(timeout=3)
        client.disconnect()
        client.loop_stop()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--list", action="store_true")
    parser.add_argument("--config", type=Path)
    args = parser.parse_args()
    if args.list:
        with mss.MSS():
            for index, monitor in enumerate(list_monitors()):
                print(f"Screen {index}: {describe_monitor(monitor)}")
        return
    if args.config is None:
        parser.error("--config is required")
    data_dir = args.config.parent
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", handlers=[
        RotatingFileHandler(data_dir / "screen.log", maxBytes=300_000, backupCount=2),
        logging.StreamHandler(),
    ])
    try:
        config = json.loads(args.config.read_text(encoding="utf-8-sig"))
        run(config, data_dir)
    except Exception as exc:
        logging.error("Startup failed: %s (check configuration / credentials / TLS)", type(exc).__name__)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
