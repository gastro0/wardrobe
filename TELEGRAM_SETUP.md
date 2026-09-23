# «Форма» в Telegram

Приложение открывается как Telegram Mini App. У каждого пользователя свои вещи,
фотографии, образы, профиль и город. Бот служит точкой входа через кнопку меню
и кнопку приложения в профиле. Для этого не нужен постоянно запущенный процесс
бота, webhook или обработчик `/start`. Ответов на сообщения в чате пока нет.

## 1. Создать бота

Бот проекта уже создан: [@W4rdrobeBot](https://t.me/W4rdrobeBot).
Его username указан в файлах-примерах настроек. Следующие шаги создания нужны
только при замене бота.

1. Откройте проверенного [@BotFather](https://t.me/BotFather).
2. Отправьте `/newbot`, задайте название и username, заканчивающийся на `bot`.
3. Сохраните токен в менеджере паролей. Не отправляйте его в чат, не добавляйте
   в исходники, URL приложения или переменные с префиксом `NEXT_PUBLIC_` / `VITE_`.

Для настройки понадобятся username бота, токен и аккаунт Cloudflare с Workers,
D1 и хранилище фотографий Supabase (либо R2). Отдельный домен необязателен: подойдёт HTTPS-адрес Worker на `workers.dev`.
Локальный адрес `127.0.0.1` не подходит для открытия приложения с телефона.

## 2. Подготовить Cloudflare

### Вариант без R2: Supabase Storage

В этом варианте Workers и D1 работают на Cloudflare, фотографии — в Supabase.
R2 подключать не требуется. Бесплатные квоты ограничены: перед запуском проверяйте
[Supabase Free](https://supabase.com/pricing) и [Workers Free](https://developers.cloudflare.com/workers/platform/pricing/).
Бесплатность всей сборки нужно подтвердить после размещения замером CPU в Workers.

1. Создайте отдельный проект Supabase на тарифе Free. Скопируйте Project URL.
2. В Storage создайте bucket `wardrobe-photos`: **Public выключен**, максимальный
   размер файла 8 МБ, допустимые типы `image/jpeg`, `image/png`, `image/webp`.
   Не добавляйте политики доступа для `anon` или `authenticated`: файлы получает только сервер.
3. В Settings → API Keys создайте серверный **Secret key** (`sb_secret_...`).
   Не используйте Publishable key. Ключи и токен бота не отправляйте в чат.
4. Скопируйте `wrangler.supabase.example.json` в `wrangler.telegram.json`, если файла
   ещё нет; иначе аккуратно обновите существующий. Укажите URL проекта и ID D1.
   Удалите `r2_buckets` при переходе с R2. Секреты в JSON не записывайте.

После создания D1 (существующую базу повторно создавать не нужно):

```powershell
npx.cmd wrangler d1 migrations apply DB --remote --config wrangler.telegram.json
npm.cmd run build
npx.cmd wrangler deploy --config dist/server/wrangler.json
npx.cmd wrangler secret put SUPABASE_SECRET_KEY --config wrangler.telegram.json
npx.cmd wrangler secret put TELEGRAM_BOT_TOKEN --config wrangler.telegram.json
```

Команды `secret put` запрашивают значения интерактивно. До установки секретов приложение
не готово к использованию. Затем выполните раздел 3 ниже.
Все фотографии выдаются через `/api/images/:id` с проверкой Telegram-сессии и владельца;
браузер не получает ключ Supabase или публичную ссылку. При ошибке загрузки запись вещи
не создаётся. Данные существующего R2/локального хранилища автоматически не переносятся:
не переключайте провайдера для заполненного гардероба без отдельного переноса фото.

Для локальной работы с диском используйте стандартную конфигурацию без
`wrangler.telegram.json` и `PHOTO_STORAGE=r2` в `.dev.vars`; файлы сохраняются
в `.wrangler/state`. Если используете конфигурацию Supabase локально, задайте
`PHOTO_STORAGE=supabase` и секрет в `.dev.vars`: этот режим требует интернет.

### Альтернативный вариант: R2

Подключение R2 требует оформления подписки с платёжным способом даже для бесплатной квоты.
Для выбранного варианта Supabase этот раздел пропустите.

Команды выполняются из корня проекта в PowerShell. Они создают ресурсы в вашем
Cloudflare-аккаунте; выполняйте их, когда готовы размещать приложение.

```powershell
npx.cmd wrangler login
npx.cmd wrangler d1 create forma-wardrobe
npx.cmd wrangler r2 bucket create forma-wardrobe-photos
Copy-Item wrangler.telegram.example.json wrangler.telegram.json
```

В `wrangler.telegram.json` замените `REPLACE_WITH_DATABASE_ID` на ID созданной
базы. Username `W4rdrobeBot` уже указан. При необходимости
измените имя Worker и ресурсов. Файл исключён из Git. Не записывайте в него токен.
Vite автоматически использует этот файл, если он существует.

Если переносите существующий гардероб, используйте соответствующую D1 и приватный
R2 с данными либо отдельно перенесите их. Новая база будет пустой. Локальные данные
из `.wrangler/state` автоматически на сервер не загружаются. Публичный доступ
к R2 включать не нужно: фотографии выдаёт защищённый `/api/images/:id`.

```powershell
npx.cmd wrangler d1 migrations apply DB --remote --config wrangler.telegram.json
npm.cmd run build
npx.cmd wrangler deploy --config dist/server/wrangler.json
npx.cmd wrangler secret put TELEGRAM_BOT_TOKEN --config wrangler.telegram.json
```

Последняя команда запросит токен интерактивно. До его установки приложение
показывает сообщение о настройке и не открывает данные. После изменения исходников
повторите сборку и deploy. Не редактируйте сгенерированный `dist/server/wrangler.json`.
`ALLOW_LOCAL_DEVELOPMENT` в опубликованном приложении должен оставаться `false`.

## 3. Подключить приложение к боту

Используйте HTTPS-адрес опубликованного Worker, например
`https://forma-wardrobe.<ваш-поддомен>.workers.dev`.

1. В BotFather: `/mybots` → ваш бот → **Bot Settings** → **Configure Mini App**.
   Включите Main Mini App и задайте HTTPS-адрес. Появится кнопка запуска в профиле.
2. Командой `/setmenubutton` выберите бота, задайте тот же адрес и подпись
   **Открыть гардероб**. Приложение будет доступно из меню личного чата.
3. Откройте бота и нажмите кнопку. Настройте профиль и добавьте вещь.
4. Откройте приложение с другого Telegram-аккаунта: у него должен быть новый
   профиль и собственный гардероб. Примеры вещей явно помечены и не сохраняются.

После настройки Main Mini App ссылка запуска: `https://t.me/W4rdrobeBot?startapp`.
Обычная reply-клавиатура `web_app` не используется: для входа нужен `initData.user`,
передаваемый при запуске через меню, Main Mini App или inline-кнопку.

## Существующая личная коллекция

По умолчанию все Telegram-пользователи получают новые независимые гардеробы.
Старые записи `private-wardrobe` сохраняются и никому автоматически не выдаются.
Чтобы связать их с владельцем, установите серверный секрет `TELEGRAM_OWNER_ID`
с вашим **числовым Telegram ID**, не username:

```powershell
npx.cmd wrangler secret put TELEGRAM_OWNER_ID --config wrangler.telegram.json
```

Узнать свой ID можно из ответа `POST /api/telegram/session` после успешного входа:
поле `telegramId` содержит ID, проверенный сервером. Не копируйте `initData`,
cookies или токен в чат. Задайте привязку до добавления новых вещей владельцем:
она переключает его с `telegram:ID` на `private-wardrobe`, а не объединяет коллекции.
Если уже появились записи в обеих коллекциях, нужен отдельный перенос.
Менять ID на чужой нельзя: это передаст доступ к старой коллекции этому аккаунту.

## Локальная разработка

Без `wrangler.telegram.json` локальная конфигурация разрешает прежний предпросмотр
только на `localhost` / `127.0.0.1` / `::1`, только без токена бота. Она сохраняет
старую локальную коллекцию. На публичном адресе этот обход не действует.

Для разработки с Telegram скопируйте `.dev.vars.example` в `.dev.vars`, заполните
токен и username локально. `.dev.vars` исключён из Git. Используйте `npm.cmd run dev`
и HTTPS-доступ к нему либо отдельный тестовый Worker и тестового бота. Обычный
браузер без Telegram не сможет войти при настроенном токене — это ожидаемо.
Для production секреты задаются через Wrangler, а не через `.dev.vars`.

## Как защищены данные и что проверить

- Сервер проверяет HMAC-SHA-256 для `initData`, срок запуска до 5 минут и ID пользователя.
- Затем выдаёт подписанную сессию на 12 часов в `HttpOnly; Secure; SameSite=None;
  Partitioned` cookie. Она привязана к адресу приложения. При новой авторизации
  cookie заменяется, в том числе при смене Telegram-аккаунта.
- Перезагрузка уже открытого приложения допускает старые данные запуска только
  при ещё действующей сессии того же пользователя, без продления её срока.
- Все API, включая фотографии и погоду, требуют сессию. Изменяющие запросы
  проверяют Origin. ID владельца из браузерного заголовка или тела не принимается.
- `TELEGRAM_OWNER_ID` — единственное явное исключение для старой коллекции.
- В Telegram Web нужны cookies. При блокировке приложение объяснит, как открыть
  его в мобильном Telegram. Сессии и токен не помещаются в URL фотографий.

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
# В отдельном терминале: npm.cmd start
npm.cmd run test:e2e
```

Серверные тесты проверяют подписи, истечение сессии, доступ к чужим вещам,
фотографиям и образам на изолированной D1/R2. Браузерные тесты используют подмену
Telegram SDK и API; они не заменяют проверку настоящего бота на Android, iOS и
Telegram Web после публикации. Проверьте вход, смену аккаунта, фотографию,
сохранение образа, клавиатуру, кнопку «Назад» и смену темы.

Документация: [Telegram Mini Apps](https://core.telegram.org/bots/webapps),
[кнопка меню](https://core.telegram.org/bots/webapps#launching-mini-apps-from-the-menu-button),
[проверка входа](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app),
[Cloudflare Vite API](https://developers.cloudflare.com/workers/vite-plugin/reference/api/).
