#!/bin/sh
# Переходник Electron на TypeScript-ядро Harnessy; допускает ссылку на файл или каталог.
harnessy_script_path=$0
while [ -L "$harnessy_script_path" ]; do
  harnessy_script_dir=$(CDPATH= cd "$(dirname "$harnessy_script_path")" && pwd -P) || exit 1
  harnessy_script_link=$(readlink "$harnessy_script_path") || exit 1
  case "$harnessy_script_link" in
    /*) harnessy_script_path=$harnessy_script_link ;;
    *) harnessy_script_path=$harnessy_script_dir/$harnessy_script_link ;;
  esac
done
harnessy_script_dir=$(CDPATH= cd "$(dirname "$harnessy_script_path")" && pwd -P) || exit 1
cd "$harnessy_script_dir/../.." || exit 1
exec node packages/api/bin/harnessy.ts
