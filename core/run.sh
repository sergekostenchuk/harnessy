#!/bin/sh
# Переходник Electron на TypeScript-ядро Harnessy.
cd "$(dirname "$0")/.." || exit 1
exec node packages/api/bin/harnessy.ts
