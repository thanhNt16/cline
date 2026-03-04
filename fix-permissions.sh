#!/bin/bash
# Fix root-owned generated directories that block the build

PROJECT="/Users/harrynguyen/Desktop/01_Active_Projects/Other_Projects/cellock/cline"

sudo chown -R "$(whoami)" \
  "$PROJECT/src/generated" \
  "$PROJECT/src/shared/proto" \
  "$PROJECT/webview-ui/build" \
  ~/.cache/buf

echo "Done. Now run: npm run package && npx vsce package --allow-package-all-secrets"
