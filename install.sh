#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"

uuid=$(python3 -c 'import json; print(json.load(open("metadata.json"))["uuid"])')
destination="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$uuid"

# Compile in a temporary directory so generated files stay out of the source tree.
staging=$(mktemp -d)
trap 'rm -rf -- "$staging"' EXIT
install -m 644 schemas/*.xml "$staging/"
glib-compile-schemas --strict "$staging"

mkdir -p "$destination/schemas"
install -m 644 metadata.json extension.js ddc.js ddcClient.js prefs.js shortcuts.js "$destination/"
install -m 644 "$staging"/* "$destination/schemas/"
printf 'Installed to %s\nLog out and back in to load new or changed extension code.\n' "$destination"
printf 'Then enable with: gnome-extensions enable %s\n' "$uuid"
