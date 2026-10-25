#!/usr/bin/env python3
"""Exercise the real Android TV debug app with ADB D-pad events against the local lab.

Requires the prepared English laboratory account already saved in the emulator and
JellyTV selected in Display preferences. Local credentials seed and restore the
resume fixture through the verified loopback server; credentials are never emitted.
"""
import argparse
import json
from datetime import datetime, timezone
import re
from pathlib import Path
import subprocess
import struct
import io
import time
import xml.etree.ElementTree as ET
from PIL import Image
from urllib.request import Request, urlopen


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--adb", type=Path, required=True)
parser.add_argument("--serial", default="emulator-5554")
parser.add_argument("--port", default="5038")
parser.add_argument("--resolution", choices=("1080", "4k"), default="1080")
parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "evidence")
args = parser.parse_args()
adb = [str(args.adb.resolve()), "-P", args.port, "-s", args.serial]
package = "org.jellyfin.androidtv.debug"
checks = []
screens = args.output / "screenshots"
screens.mkdir(parents=True, exist_ok=True)
credentials = json.loads((Path(__file__).resolve().parents[2] / '.lab/credentials.local.json').read_text(encoding='utf-8'))
assert credentials['baseURL'] == 'http://127.0.0.1:18996'
token = credentials['limited']['accessToken']
headers = {'Content-Type': 'application/json', 'Authorization': f'MediaBrowser Client="JellyTV Lab", Device="Local validation", DeviceId="jellytv-local-validation", Version="0.1.0", Token="{token}"'}


def api(path, body=None, method=None):
    request = Request(credentials['baseURL'] + path, data=json.dumps(body).encode() if body is not None else None, headers=headers, method=method)
    with urlopen(request, timeout=15) as response:
        content = response.read()
        return json.loads(content) if content else None


server = api('/System/Info/Public')
assert server['Id'] == credentials['serverId'] and server['Version'] == '12.2.0'


def command(*arguments, binary=False):
    result = subprocess.run(adb + list(arguments), capture_output=True, timeout=30)
    if result.returncode:
        raise RuntimeError(f'ADB {arguments}: exit {result.returncode}: ' + result.stderr.decode('utf-8', errors='replace')[-1500:])
    return result.stdout if binary else result.stdout.decode("utf-8", errors="replace")


def key(*keys):
    for value in keys:
        command("shell", "input", "keyevent", str(value))
        time.sleep(0.25)


def tree():
    command("shell", "uiautomator", "dump", "/sdcard/jellytv-validation.xml")
    xml = command("shell", "cat", "/sdcard/jellytv-validation.xml")
    return [node.attrib for node in ET.fromstring(xml).iter("node")]


def wait(predicate, timeout=20):
    deadline = time.monotonic() + timeout
    last = []
    while time.monotonic() < deadline:
        last = tree()
        if predicate(last):
            return last
        time.sleep(0.25)
    raise AssertionError("UI condition timed out: " + json.dumps([
        {k: n.get(k) for k in ("text", "content-desc", "focused")}
        for n in last if n.get("focused") == "true" or n.get("text")], ensure_ascii=False))


def has(nodes, text):
    return any(node.get("text") == text for node in nodes)


def focused(nodes, text):
    return any(node.get("text") == text and node.get("focused") == "true" for node in nodes)


def shot(label):
    name = f"runtime-{args.resolution}-{label}.png"
    data = command("exec-out", "screencap", "-p", binary=True)
    assert struct.unpack('>II', data[16:24]) == expected_pixels, 'Screenshot does not match requested physical viewport'
    (screens / name).write_bytes(data)
    return "screenshots/" + name


def home():
    command("shell", "am", "force-stop", package)
    command("shell", "monkey", "-p", package, "-c", "android.intent.category.LEANBACK_LAUNCHER", "1")
    nodes = wait(lambda nodes: has(nodes, "Who's watching?") or has(nodes, "Info"))
    if has(nodes, "Who's watching?"):
        key(23)
    return wait(lambda nodes: has(nodes, "Info") and focused(nodes, "Play"))


def case(name, run):
    try:
        result = run() or {}
        checks.append({"name": name, "status": "PASS", **result})
    except Exception as error:
        checks.append({"name": name, "status": "FAIL", "detail": str(error), "screenshot": shot("failure-" + name)})
    print(name, checks[-1]["status"], flush=True)
    save()


def save():
    result = {"date": datetime.now(timezone.utc).isoformat(), "device": "Android TV API 34 x86 emulator / WHPX", "resolution": args.resolution,
              "app": package, "input": "ADB KEYCODE_DPAD events; no injected UI or fake media responses",
              "installedApkSha256": installed_apk_sha256,
              "outputPixels": list(output_pixels), "viewportPixels": list(expected_pixels),
              "displayConfiguration": display_configuration,
              "native4kUiRasterization": 'UNVERIFIED: system UI capped at 1920' if output_pixels != expected_pixels else 'Not applicable' if args.resolution == '1080' else 'PASS',
              "server": "isolated Jellyfin 12.2 laboratory", "checks": checks,
              "status": "PASS" if checks and all(check["status"] == "PASS" for check in checks) else "FAIL"}
    (args.output / f"runtime-{args.resolution}.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")


def test_home():
    nodes = home()
    dots = [node for node in nodes if node.get("content-desc", "").startswith("Featured item ")]
    assert len(dots) == 6, "Expected six real API candidates"
    assert has(nodes, "Continue watching"), "Native rows must remain after the hero"
    assert any(n.get("content-desc") == "The Meridian Archive" and n.get("class") == "android.widget.ImageView" for n in nodes), "Logo did not load"
    buttons = [node for node in nodes if node.get("class") == "android.widget.Button" and (node.get("text") in ("Play", "Info", "Add favorite", "Remove favorite", "•"))]
    scale = ui_density / 160
    import re
    sizes = []
    for button in buttons:
        x1, y1, x2, y2 = map(int, re.findall(r"\d+", button["bounds"]))
        sizes.append([x2 - x1, y2 - y1])
        assert x2 - x1 >= 44 * scale and y2 - y1 >= 44 * scale
    screenshot = shot('home')
    header = next(node for node in nodes if node.get('text') == 'Continue watching')
    bounds = tuple(map(int, re.findall(r'\d+', header['bounds'])))
    pixels = Image.open(io.BytesIO((args.output / screenshot).read_bytes())).convert('RGB').crop(bounds)
    # The controlled dark fixture has no bright artwork in this header rectangle.
    # Accessibility XML alone cannot detect an image drawn over the visible text.
    visible_header_pixels = sum(min(pixel) > 180 for pixel in pixels.getdata())
    assert visible_header_pixels > 300, 'Continue watching exists in accessibility XML but is visually occluded'
    return {"candidates": len(dots), "minimumButtonDp": 44, "screenshot": screenshot,
            "visibleNativeHeaderPixels": visible_header_pixels}


def test_info_return():
    home()
    key(22, 23)
    wait(lambda nodes: has(nodes, "SEASONS"))
    info = shot("info")
    key(4)
    wait(lambda nodes: focused(nodes, "Info"))
    return {"screenshots": [info, shot("return-info")], "restoredFocus": "Info"}


def test_favorite():
    nodes = home()
    original = "Remove favorite" if has(nodes, "Remove favorite") else "Add favorite"
    target = "Add favorite" if original == "Remove favorite" else "Remove favorite"
    try:
        key(22, 22, 23)
        wait(lambda nodes: focused(nodes, target))
        screenshot = shot("favorite")
        home()
        assert has(tree(), target), "Favorite did not survive an activity restart/server fetch"
        key(22, 22, 23)
        wait(lambda nodes: focused(nodes, original))
        return {"persistedAcrossRestart": True, "restoredOriginalFavorite": True, "screenshot": screenshot}
    finally:
        item_id = credentials['items']['Series:The Meridian Archive']
        api(f'/UserFavoriteItems/{item_id}?userId={credentials["limited"]["userId"]}',
            method='POST' if original == 'Remove favorite' else 'DELETE')


def test_carousel():
    home()
    key(22, 22, 22, 22, 23)
    nodes = wait(lambda nodes: has(nodes, "Without Artwork"))
    assert any(n.get("text") == "Without Artwork" and n.get("class") == "android.widget.TextView" for n in nodes)
    screenshot = shot("missing-art")
    key(22, 23)
    wait(lambda nodes: any(n.get("text", "").startswith("A Very Long Journey") for n in nodes))
    return {"screenshots": [screenshot, shot("long-title")], "fallbackTitle": True}


def test_vertical():
    home()
    key(20)
    wait(lambda nodes: any(n.get("focused") == "true" and n.get("text") not in ("Play", "Info", "Add favorite", "Remove favorite", "•") for n in nodes))
    screenshot = shot("native-row")
    key(19)
    wait(lambda nodes: focused(nodes, "Play"))
    key(19)
    wait(lambda nodes: any(n.get("focused") == "true" and n.get("class") == "android.view.View" for n in nodes))
    key(20)
    wait(lambda nodes: focused(nodes, "Play"))
    return {"nativeRowsAccessible": True, "screenshot": screenshot}


def test_play():
    home()
    key(23)
    time.sleep(3)
    key(23)
    nodes = wait(lambda nodes: any("current_time" in n.get("resource-id", "") for n in nodes))
    current_time = next(n.get("text") for n in nodes if "current_time" in n.get("resource-id", ""))
    assert current_time != '0:00', 'Playback must advance beyond the first frame'
    screenshot = shot("playback")
    key(4, 4)
    wait(lambda nodes: focused(nodes, "Play"))
    return {"nativePlayer": True, "position": current_time, "screenshots": [screenshot, shot("return-play")]}


def test_resume():
    item_id = credentials['items']['Movie:Without Artwork']
    user_id = credentials['limited']['userId']
    original = api(f'/Items/{item_id}?userId={user_id}')['UserData']
    restore = {key: original.get(key) for key in ('PlaybackPositionTicks', 'PlayCount', 'Played', 'LastPlayedDate')}
    try:
        api(f'/UserItems/{item_id}/UserData?userId={user_id}', {'PlaybackPositionTicks': 1800000000, 'PlayCount': 1, 'Played': False})
        home()
        key(22, 22, 22, 22, 23)
        wait(lambda nodes: has(nodes, 'Without Artwork') and has(nodes, 'Resume'))
        key(21, 21, 21, 21)
        wait(lambda nodes: focused(nodes, 'Resume'))
        key(23)
        time.sleep(3)
        key(23)
        nodes = wait(lambda nodes: any('current_time' in n.get('resource-id', '') for n in nodes))
        position = next(n.get('text') for n in nodes if 'current_time' in n.get('resource-id', ''))
        values = [int(value) for value in position.split(':')]
        seconds = sum(value * 60 ** index for index, value in enumerate(reversed(values)))
        assert seconds >= 179, f'Resume started at {position}'
        screenshot = shot('resume')
        key(4, 4)
        wait(lambda nodes: focused(nodes, 'Resume'))
        return {'savedPositionSeconds': 180, 'playerPosition': position, 'restoredFocus': 'Resume', 'screenshot': screenshot}
    finally:
        command('shell', 'am', 'force-stop', package)
        api(f'/UserItems/{item_id}/UserData?userId={user_id}', restore)


def test_row_detail_play():
    item_id = credentials['items']['Movie:The Quiet Horizon']
    user_id = credentials['limited']['userId']
    original = api(f'/Items/{item_id}?userId={user_id}')['UserData']
    restore = {key: original.get(key) for key in ('PlaybackPositionTicks', 'PlayCount', 'Played', 'LastPlayedDate')}
    try:
        api(f'/UserItems/{item_id}/UserData?userId={user_id}', {
            'PlaybackPositionTicks': 1800000000, 'PlayCount': 1, 'Played': False,
            'LastPlayedDate': datetime.now(timezone.utc).isoformat()})
        home()
        key(20)
        nodes = wait(lambda nodes: has(nodes, 'The Quiet Horizon') and not focused(nodes, 'Play'))
        row_focus = next(node['bounds'] for node in nodes if node.get('focused') == 'true')
        row = shot('flow-row')
        key(23)
        wait(lambda nodes: any(node.get('resource-id', '').endswith('/fdTitle') and node.get('text') == 'The Quiet Horizon' for node in nodes))
        detail = shot('flow-detail')
        key(22, 23)  # Resume is first; Play is the next native action.
        time.sleep(3)
        key(23)
        nodes = wait(lambda nodes: any('current_time' in n.get('resource-id', '') for n in nodes))
        position = next(n['text'] for n in nodes if 'current_time' in n.get('resource-id', ''))
        assert position != '0:00'
        playback = shot('flow-player')
        key(4, 4)
        wait(lambda nodes: any(node.get('resource-id', '').endswith('/fdTitle') for node in nodes))
        key(4)
        wait(lambda nodes: has(nodes, 'Info') and any(node.get('focused') == 'true' and node.get('bounds') == row_focus for node in nodes))
        return {'route': 'Home → native row → movie detail → Play → detail → row',
                'input': 'D-pad only', 'position': position, 'rowFocusRestored': True,
                'screenshots': [row, detail, playback, shot('flow-return')]}
    finally:
        command('shell', 'am', 'force-stop', package)
        api(f'/UserItems/{item_id}/UserData?userId={user_id}', restore)


assert command('shell', 'getprop', 'sys.boot_completed').strip() == '1', 'Wait for Android to finish booting before starting validation'
command("reverse", "tcp:18996", "tcp:18996")
installed_apk = command('shell', 'pm', 'path', package).strip().removeprefix('package:')
assert installed_apk.startswith('/data/app/') and installed_apk.endswith('/base.apk')
installed_apk_sha256 = command('shell', 'sha256sum', installed_apk).split()[0]
assert re.fullmatch(r'[a-f0-9]{64}', installed_apk_sha256)
validated_apk, = json.loads((Path(__file__).resolve().parents[1] / 'evidence/validation.json').read_text(encoding='utf-8'))['apk']
assert installed_apk_sha256 == validated_apk['sha256'], 'Installed APK differs from the build/lint/unit-test evidence'
output_pixels = (1920, 1080) if args.resolution == '1080' else (3840, 2160)
physical_size = command('shell', 'wm', 'size').splitlines()[0]
assert physical_size.endswith('x'.join(map(str, output_pixels))), 'Boot the emulator with the requested physical framebuffer: ' + physical_size
# ATV's framework overlay caps UI width even on a 4K output. Record the actual
# surface rather than labelling a 1080p screenshot as native 4K rasterization.
max_ui_width = int(command('shell', 'cmd', 'overlay', 'lookup', 'android', 'android:integer/config_maxUiWidth').strip())
ui_width = min(output_pixels[0], max_ui_width) if max_ui_width > 0 else output_pixels[0]
expected_pixels = (ui_width, round(ui_width * output_pixels[1] / output_pixels[0]))
expected_size = 'x'.join(map(str, expected_pixels))
ui_density = round(ui_width / 960 * 160)
command('shell', 'wm', 'size', expected_size)
command('shell', 'wm', 'density', str(ui_density))
display_configuration = {'size': command('shell', 'wm', 'size').strip(), 'density': command('shell', 'wm', 'density').strip()}
display_configuration['frameworkMaxUiWidth'] = max_ui_width
assert display_configuration['size'].splitlines()[-1].endswith(expected_size), (
    'Android TV did not apply the requested viewport. Boot the emulator with the matching hardware resolution; ' + str(display_configuration))
for name, test in [("home", test_home), ("info-return", test_info_return), ("favorite", test_favorite),
                   ("carousel", test_carousel), ("vertical", test_vertical), ("play", test_play), ("resume", test_resume),
                   ("row-detail-play", test_row_detail_play)]:
    case(name, test)
raise SystemExit(0 if all(check["status"] == "PASS" for check in checks) else 1)
