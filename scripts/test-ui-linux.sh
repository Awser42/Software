#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -n "${DISPLAY:-}" ]]; then
  node test/ui.e2e.js
  exit
fi
test -x /usr/bin/Xorg || { echo 'Install Xorg and its dummy video driver, or supply an existing DISPLAY.' >&2; exit 1; }
task_ui_dir=$(mktemp -d)
task_display_number=101
while [[ -e "/tmp/.X11-unix/X${task_display_number}" || -e "/tmp/.X${task_display_number}-lock" ]]; do
  task_display_number=$((task_display_number + 1))
done
cat > "$task_ui_dir/xorg.conf" <<'EOF'
Section "Device"
 Identifier "Dummy"
 Driver "dummy"
 VideoRam 256000
EndSection
Section "Monitor"
 Identifier "Monitor"
 HorizSync 5.0-1000.0
 VertRefresh 5.0-200.0
 Modeline "1440x1000" 120.0 1440 1488 1520 1600 1000 1003 1009 1050
EndSection
Section "Screen"
 Identifier "Screen"
 Device "Dummy"
 Monitor "Monitor"
 DefaultDepth 24
 SubSection "Display"
 Depth 24
 Modes "1440x1000"
 EndSubSection
EndSection
EOF
Xorg ":$task_display_number" -config "$task_ui_dir/xorg.conf" -logfile "$task_ui_dir/xorg.log" -noreset -nolisten tcp > "$task_ui_dir/server.log" 2>&1 &
task_xorg_pid=$!
trap 'kill "$task_xorg_pid" 2>/dev/null || true; wait "$task_xorg_pid" 2>/dev/null || true; rm -rf "$task_ui_dir"' EXIT
for task_attempt in {1..50}; do
  [[ -S "/tmp/.X11-unix/X${task_display_number}" ]] && break
  if ! kill -0 "$task_xorg_pid" 2>/dev/null; then cat "$task_ui_dir/server.log" >&2; exit 1; fi
  sleep 0.1
done
DISPLAY=":$task_display_number" node test/ui.e2e.js
