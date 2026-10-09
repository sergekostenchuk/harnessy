#!/bin/sh
# Переходник Electron на TypeScript-ядро Harnessy.
harnessy_script_dir=$(CDPATH= cd "$(dirname "$0")" && pwd -P) || exit 1
cd "$harnessy_script_dir/.." || exit 1
exec node packages/api/bin/harnessy.ts
