# Автотесты Forma Wardrobe

Отдельный npm-проект в папке `autotests` со своими зависимостями и lock-файлом.
Приложение находится в родительской папке; тесты читают его исходники, миграции
и примеры фотографий, не копируя их. Зависимости приложения нужны для сборки
тестируемых модулей, поэтому установите оба проекта:

```powershell
# Из корня репозитория
npm.cmd ci
npm.cmd --prefix autotests ci
```

## Запуск из папки autotests

```powershell
cd autotests
npm.cmd test
npm.cmd run test:wardrobe
npm.cmd run test:looks
npm.cmd run test:photo-alpha
npm.cmd run test:photos
npm.cmd run test:e2e
```

`npm.cmd test` проверяет гардероб, API, Telegram, хранение фотографий, погоду,
случайные образы и коллаж. Проверка маски фотографии запускается отдельно через
`test:photo-alpha`. `test:photos` проверяет обработку изображений в браузере;
заранее подготовьте модель командой `npm.cmd run images:prepare` из корня.
Для проверки собранного worker используйте
`npm.cmd run test:photos -- --production-worker` после сборки приложения.
Результаты обработки сохраняются в игнорируемую папку `.artifacts/photo-test/`.

Для `test:e2e` нужен запущенный сайт с актуальными изменениями. Из корня
репозитория выполните `npm.cmd run build`, затем `npm.cmd start` в отдельном
терминале. По умолчанию тесты открывают `http://127.0.0.1:8787`.
Адрес можно задать через `E2E_BASE_URL`, браузер — через `E2E_BROWSER`
(для `test:photos` — `PHOTO_TEST_BROWSER`). В Windows автоматически находятся
Chrome и Edge; также поддерживается Chromium, установленный Playwright.
Для установки этого браузера из `autotests` выполните
`node node_modules/playwright-core/cli.js install chromium`.
GitHub Actions устанавливает Chromium вместе с системными зависимостями Linux.

## Структура и изоляция

- `scripts/` — модульные и серверные интеграционные проверки, обработка фото.
- `e2e/wardrobe.test.mjs` — браузерные сценарии для мобильного и широкого экрана.
- `e2e/pages.mjs` — Page Object с действиями и локаторами.
- `e2e/fixture.mjs` — подмена API и Telegram SDK.
- `project.mjs` — пути к приложению, независимые от текущей папки терминала.

Серверные проверки работают с временными D1/R2, браузерные подменяют `/api/`.
Пользовательский гардероб и фотографии не изменяются.

Из корня сохранены команды `npm.cmd test`, `npm.cmd run test:wardrobe`,
`npm.cmd run test:looks`, `npm.cmd run test:photos` и `npm.cmd run test:e2e`:
они передают запуск в этот проект. Проверка типов и сборка приложения остаются
в корне: `npm.cmd run typecheck`, `npm.cmd run build`.
