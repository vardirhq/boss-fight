#!/usr/bin/env bash
set -euo pipefail

BASELINE_APK=${1:?baseline APK path is required}
UPGRADE_APK=${2:?upgrade APK path is required}
PACKAGE_NAME=no.vardir.bosskamp.dev
ACTIVITY_NAME=no.vardir.bosskamp.MainActivity
WINDOW_DUMP=/tmp/boss-kamp-window.xml
set -x

restore_network() {
  adb shell svc wifi enable >/dev/null 2>&1 || true
  adb shell svc data enable >/dev/null 2>&1 || true
}
trap restore_network EXIT

launch_app() {
  adb shell am force-stop "$PACKAGE_NAME"
  adb shell am start -n "$PACKAGE_NAME/$ACTIVITY_NAME" >/dev/null
  for _attempt in $(seq 1 120); do
    if adb shell pidof "$PACKAGE_NAME" >/dev/null 2>&1; then
      sleep 5
      return 0
    fi
    sleep 1
  done
  echo "Boss Kamp process did not start" >&2
  adb logcat -d -t 300
  return 1
}

dump_tree() {
  # UIAutomator can take longer than the adb shell RPC on a cold, heavily
  # loaded emulator. Start the dump in the guest and poll for its output so a
  # slow RPC does not kill the dump process halfway through.
  timeout 10s adb shell rm -f /sdcard/boss-kamp-window.xml >/dev/null 2>&1 || true
  timeout 10s adb shell 'uiautomator dump --compressed /sdcard/boss-kamp-window.xml >/dev/null 2>&1 &' >/dev/null 2>&1 || true
  for _attempt in $(seq 1 30); do
    if timeout 10s adb shell test -s /sdcard/boss-kamp-window.xml >/dev/null 2>&1 \
      && timeout 10s adb pull /sdcard/boss-kamp-window.xml "$WINDOW_DUMP" >/dev/null 2>&1 \
      && grep -q '<hierarchy' "$WINDOW_DUMP"; then return 0; fi
    sleep 2
  done
  echo "Could not read the native accessibility tree" >&2
  adb shell uiautomator dump /dev/tty || true
  adb logcat -d -t 300
  return 1
}

capture_accessibility_tree() {
  dump_tree
  if ! grep -Eqi 'BOSS KAMP|Boss Kamp|TRYKK|PRESS|Account|Konto' "$WINDOW_DUMP"; then
    echo "Boss Kamp content was absent from the accessibility tree" >&2
    tr '>' '>\n' < "$WINDOW_DUMP" >&2
    return 1
  fi
  grep -Eq 'clickable="true"' "$WINDOW_DUMP"
  grep -Eq 'content-desc="[^"]+"' "$WINDOW_DUMP"
}

tap_matching_node() {
  local pattern=$1
  dump_tree
  local coordinates
  coordinates=$(python3 - "$WINDOW_DUMP" "$pattern" <<'PY'
import re
import sys
import xml.etree.ElementTree as ET

root = ET.parse(sys.argv[1]).getroot()
pattern = re.compile(sys.argv[2], re.IGNORECASE)
for node in root.iter('node'):
    label = ' '.join((node.get('text', ''), node.get('content-desc', '')))
    match = re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', node.get('bounds', ''))
    if pattern.search(label) and match:
        left, top, right, bottom = map(int, match.groups())
        print((left + right) // 2, (top + bottom) // 2)
        raise SystemExit(0)
raise SystemExit(1)
PY
  )
  adb shell input tap $coordinates
  sleep 1
}

adb wait-for-device
adb install "$BASELINE_APK"
adb shell dumpsys package "$PACKAGE_NAME" | grep -Eq 'versionCode=1([[:space:]]|$)'

launch_app
capture_accessibility_tree
tap_matching_node 'PRESS TO START|TRYKK FOR Å STARTE'
for _step in $(seq 1 5); do
  tap_matching_node 'NEXT|NESTE|GET STARTED|KOM I GANG'
done
sleep 2
capture_accessibility_tree
grep -Eq 'Account|Konto|household|husholdning' "$WINDOW_DUMP"
FIRST_PID=$(adb shell pidof "$PACKAGE_NAME" | tr -d '\r')
adb shell "run-as $PACKAGE_NAME sh -c 'mkdir -p files/audit-smoke && printf baseline > files/audit-smoke/state'"

launch_app
capture_accessibility_tree
tap_matching_node 'PRESS TO START|TRYKK FOR Å STARTE'
capture_accessibility_tree
grep -Eq 'Account|Konto|household|husholdning' "$WINDOW_DUMP"
if grep -Eq 'NEXT|NESTE|GET STARTED|KOM I GANG' "$WINDOW_DUMP"; then
  echo "Completed onboarding returned after process restart" >&2
  exit 1
fi
SECOND_PID=$(adb shell pidof "$PACKAGE_NAME" | tr -d '\r')
test -n "$FIRST_PID"
test -n "$SECOND_PID"
adb shell "run-as $PACKAGE_NAME test -f files/audit-smoke/state"

adb shell svc wifi disable
adb shell svc data disable
launch_app
capture_accessibility_tree
tap_matching_node 'PRESS TO START|TRYKK FOR Å STARTE'
capture_accessibility_tree
grep -Eq 'Account|Konto|household|husholdning' "$WINDOW_DUMP"
adb shell "run-as $PACKAGE_NAME test -f files/audit-smoke/state"
restore_network

adb install -r "$UPGRADE_APK"
adb shell dumpsys package "$PACKAGE_NAME" | grep -Eq 'versionCode=2([[:space:]]|$)'
adb shell "run-as $PACKAGE_NAME grep -qx baseline files/audit-smoke/state"
launch_app
capture_accessibility_tree
tap_matching_node 'PRESS TO START|TRYKK FOR Å STARTE'
capture_accessibility_tree
grep -Eq 'Account|Konto|household|husholdning' "$WINDOW_DUMP"

if adb logcat -d -s AndroidRuntime:E | grep -A20 'FATAL EXCEPTION' | grep -q "$PACKAGE_NAME"; then
  echo "Native lifecycle produced a fatal application error" >&2
  exit 1
fi
