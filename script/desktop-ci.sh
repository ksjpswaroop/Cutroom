#!/bin/bash
set -e

echo "Running Cutroom desktop CI checks..."

echo ""
echo "=== npm test ==="
npm test

echo ""
echo "=== npm run check ==="
npm run check

if command -v cargo &> /dev/null; then
    echo ""
    echo "=== cargo check (src-tauri) ==="
    cd src-tauri
    cargo check
    cd ..
else
    echo ""
    echo "=== cargo not found, skipping Rust checks ==="
fi

echo ""
echo "All desktop CI checks passed."
