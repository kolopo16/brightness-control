#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")/.."

staging=$(mktemp -d)
trap 'rm -rf -- "$staging"' EXIT
install -m 644 schemas/*.xml "$staging/"
glib-compile-schemas --strict "$staging"
python3 -m json.tool metadata.json > /dev/null
bash -n install.sh tools/check.sh
gjs -m tests/ddc.test.js
printf 'Schema, metadata, shell scripts, and DDC parser checks passed.\n'
