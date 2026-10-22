# Выпуск desktop-приложения

Публичный репозиторий релизов: https://github.com/sergekostenchuk/harnessy-releases (слово владельца 23.10.2026, «да, делай»); в `electron-builder.yml` и `updates.js` стоит `harnessy-releases`.

Секреты GitHub Actions приватного репозитория: `CSC_LINK` — base64 сертификата Developer ID Application `.p12`, `CSC_KEY_PASSWORD` — его пароль, `APPLE_API_KEY` — base64 файла App Store Connect `.p8`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, `HARNESSY_RELEASE_TOKEN` — fine-grained token с `Contents: read/write` **только** для подтверждённого репозитория релизов. Локально `APPLE_API_KEY` указывает на файл `.p8`; остальные четыре переменные для подписи перечислены в `signing.js`. Значения не добавляются в git и не печатаются в отчёте.

Первый подписанный тег имеет версию `vX.Y.Z-beta.N`, совпадающую с `ui/desktop/package.json`, и должен быть аннотированным: описание тега становится списком изменений GitHub Release. Без тега workflow не публикует. Сборка без переменных подписи останавливается до упаковки. `beta` получает пробные и стабильные версии, `latest` — только стабильные. Предыдущие версии остаются в публичных Releases для отката.
