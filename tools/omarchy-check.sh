#!/usr/bin/env bash
# Runs on the Omarchy desktop: opens the single-file game in Chromium inside the user's
# Hyprland session (its own profile, floated to 1920x1080) with remote debugging on, so a
# Playwright script on another machine can drive it over an SSH tunnel.
#   omarchy-check.sh start <html> <port>   |   omarchy-check.sh stop
set -uo pipefail
export XDG_RUNTIME_DIR=/run/user/$(id -u)
export WAYLAND_DISPLAY=${WAYLAND_DISPLAY:-wayland-1}
export HYPRLAND_INSTANCE_SIGNATURE=$(ls -t "$XDG_RUNTIME_DIR/hypr" | head -1)
profile=/tmp/wetpaint-qa-profile
if [ "$1" = stop ]; then pkill -f "user-data-dir=$profile" ; exit 0; fi
html="$2"; port="$3"
rm -rf "$profile"
chromium --user-data-dir="$profile" --remote-debugging-port="$port" --remote-allow-origins='*' --no-first-run --no-default-browser-check \
  --window-size=1920,1080 --app="file://$html?check=1&ratio=1" >/tmp/wetpaint-qa.log 2>&1 &
pid=$!
for _ in $(seq 1 40); do
  addr=$(hyprctl clients -j 2>/dev/null | python3 -c "import json,sys;p=int(sys.argv[1]);cs=json.load(sys.stdin);print(next((c['address'] for c in cs if c.get('pid')==p or c.get('class','').lower().startswith('chromium') and 'wetpaint' in (c.get('title','')+c.get('initialTitle','')).lower()),''))" "$pid" 2>/dev/null)
  if [ -n "$addr" ]; then
    hyprctl dispatch "hl.dsp.window.float({window=\"address:$addr\", action=\"enable\"})" >/dev/null 2>&1
    hyprctl dispatch "hl.dsp.window.resize({window=\"address:$addr\", x=1920, y=1080})" >/dev/null 2>&1
    hyprctl dispatch "hl.dsp.window.move({window=\"address:$addr\", x=0, y=0})" >/dev/null 2>&1
    break
  fi
  sleep .5
done
echo "pid $pid window ${addr:-none}"
