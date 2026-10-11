#!/bin/zsh
# Запуск оболочки Harnessy. Берёт Electron из node_modules этой папки, иначе — из Workbench (~/ASVP/UI/asvh-workbench).
cd "${0:a:h}" || exit 1
E=./node_modules/.bin/electron; [ -x "$E" ] || E=~/ASVP/UI/asvh-workbench/node_modules/.bin/electron
[ -x "$E" ] || { echo "Electron не найден: выполните npm install в $(pwd)"; exit 1; }
exec "$E" .
