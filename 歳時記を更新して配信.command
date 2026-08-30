#!/bin/bash
cd "$(dirname "$0")"
python3 scripts/sync_saijiki.py
echo ""
echo "何かキーを押すとこのウィンドウを閉じます..."
read -n 1
