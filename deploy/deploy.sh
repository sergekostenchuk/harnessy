#!/bin/zsh
# deploy.sh — сборка и заливка сайта harness.autoiflow.com (только страницы; карта и данные — отдельно).
# Что: build.py → out/site → /harness/site на NL99. Зачем: одна команда после правки мастера.
set -euo pipefail
HERE=${0:a:h}
python3 "$HERE/build.py"
COPYFILE_DISABLE=1 tar -C "$HERE/out/site" -cf - sketches | ssh -o BatchMode=yes -o IdentitiesOnly=yes -i ~/.ssh/id_ed25519 root@160.202.133.166 \
  'tar -C /harness/site -xf - 2>/dev/null; find /harness/site -name "._*" -delete; chown -R www-data:www-data /harness/site; ls -la /harness/site/sketches'
echo "залито: https://harnessy.ai/"
