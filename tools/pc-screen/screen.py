"""Small Windows desktop snapshots -> Home Assistant MQTT discovery camera."""
import argparse
import ctypes
import io
import json
import logging
from logging.handlers import RotatingFileHandler
import os
import socket
import ssl
from pathlib import Path
import threading
import time

from PIL import Image
import mss
import paho.mqtt.client as mqtt

MAX_BYTES = 200_000
BASE = "hometwin/desktop_main_screen"
DISCOVERY = "homeassistant/camera/hometwin_desktop_main_screen/config"


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
        "availability_topic": BASE + "/availability",
        "device": {"identifiers": ["hometwin_desktop_main_screen_helper"],
                   "name": "DesktopMain Screenshot", "manufacturer": "HomeTwin3D",
                   "model": "JPEG MQTT helper"},
    }


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
    client.will_set(BASE + "/availability", "offline", qos=1, retain=True)
    client.reconnect_delay_set(min_delay=5, max_delay=60)
    client.max_queued_messages_set(2)

    def on_connect(c, userdata, flags, reason, properties):
        if reason.is_failure:
            logging.warning("MQTT refused: %s", reason)
            return
        c.publish(DISCOVERY, json.dumps(discovery()), qos=0, retain=True)
        c.publish(BASE + "/availability", "offline", qos=0, retain=True)
        c.subscribe("homeassistant/status")
        ready.set()
        refresh.set()
        logging.info("MQTT connected")

    def on_disconnect(c, userdata, flags, reason, properties):
        ready.clear()
        logging.warning("MQTT disconnected: %s", reason)

    def on_message(c, userdata, message):
        if message.topic == "homeassistant/status" and message.payload == b"online":
            c.publish(DISCOVERY, json.dumps(discovery()), qos=0, retain=True)
            refresh.set()

    client.on_connect = on_connect
    client.on_disconnect = on_disconnect
    client.on_message = on_message
    client.on_connect_fail = lambda c, u: logging.warning(
        "MQTT connection failed; check host, port and TLS. Retrying in 5-60 seconds.")
    logging.info("Connecting to MQTT %s:%s (TLS=%s)", config["host"], config["port"], config["tls"])
    client.connect_async(config["host"], int(config["port"]), keepalive=30)
    client.loop_start()
    stop_file = data_dir / "stop"
    next_frame = 0.0
    locked = False
    try:
        while not stop_file.exists():
            if not ready.is_set():
                time.sleep(1)
                continue
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
            next_frame = time.monotonic() + 30
            try:
                with mss.mss() as capture:
                    index = int(config["screen"]) + 1  # mss[0] is ALL monitors
                    if index < 1 or index >= len(capture.monitors):
                        raise ValueError("Configured monitor is not connected")
                    shot = capture.grab(capture.monitors[index])
                    image = Image.frombytes("RGB", shot.size, shot.rgb)
                # Recheck in case Windows locked during capture.
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
            info = client.publish(BASE + "/availability", "offline", qos=1, retain=True)
            info.wait_for_publish(timeout=3)
        client.disconnect()
        client.loop_stop()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--list", action="store_true")
    parser.add_argument("--config", type=Path)
    args = parser.parse_args()
    if args.list:
        with mss.mss() as capture:
            for index, monitor in enumerate(capture.monitors[1:]):
                print(f"Screen {index}: {monitor['width']}x{monitor['height']} "
                      f"at {monitor['left']},{monitor['top']}")
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
