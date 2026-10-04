#!/usr/bin/env bash
# Installs the single-file game on this Mac (~/Games/WetPaint + a Desktop link) and on the
# Omarchy desktop over SSH (~/Games/WetPaint + an application entry). Run after tools/build.mjs.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
html="$root/dist/WetPaint.html"
[ -f "$html" ] || { echo "build first: node tools/build.mjs"; exit 1; }
sum=$(shasum -a 256 "$html" | cut -d' ' -f1)

# Mac
mkdir -p "$HOME/Games/WetPaint"
cp "$html" "$HOME/Games/WetPaint/WetPaint.html"
cat > "$HOME/Desktop/Wet Paint.webloc" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>URL</key><string>https://gazhenko.dev/wet-paint/</string></dict></plist>
EOF
echo "mac: ~/Games/WetPaint/WetPaint.html ($sum) and ~/Desktop/Wet Paint.webloc"

# Omarchy
if ssh -o ConnectTimeout=8 omarchy true 2>/dev/null; then
  scp -q "$html" omarchy:/tmp/WetPaint.html
  ssh omarchy "set -e; mkdir -p ~/Games/WetPaint ~/.local/share/applications; mv /tmp/WetPaint.html ~/Games/WetPaint/WetPaint.html;
    echo '$sum  WetPaint.html' > ~/Games/WetPaint/SHA256SUMS.txt; (cd ~/Games/WetPaint && sha256sum -c SHA256SUMS.txt);
    printf '[Desktop Entry]\nType=Application\nName=Wet Paint\nComment=A watercolour flight over Koriko\nExec=chromium --app=file://%s/Games/WetPaint/WetPaint.html --window-size=1920,1080\nTerminal=false\nCategories=Game;\n' \"\$HOME\" > ~/.local/share/applications/wet-paint.desktop;
    update-desktop-database ~/.local/share/applications 2>/dev/null || true; echo omarchy: ~/Games/WetPaint/WetPaint.html and the Wet Paint launcher"
else
  echo "omarchy: not reachable, skipped"
fi
