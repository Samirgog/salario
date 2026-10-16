# Полная настройка Salario с нуля

Порядок ниже важен: сначала создаются ресурсы и аккаунты, затем их секреты передаются CLI, после этого применяются миграции и публикуется приложение.

## 0. Установка

Нужны Node.js 20+, npm, Supabase CLI и GitHub-репозиторий. На macOS:

```bash
brew install supabase/tap/supabase
node --version
supabase --version
```

Docker для этой инструкции не нужен: миграции применяются к удалённому Supabase-проекту.

## 1. Создать Supabase-проект

1. Откройте [database.new](https://database.new) и нажмите **New project**.
2. Выберите организацию, задайте имя, пароль базы данных и регион.
3. Дождитесь статуса **Healthy**.
4. Откройте **Project Settings → General** и скопируйте **Reference ID** — строку вида `xvljpkujuwroxcuvossw`.
5. Откройте **Project Settings → API** и сохраните **Project URL**, **anon/publishable key** и **service_role key**. Последний нужен только Edge Functions и не должен попасть во frontend.

## 2. Подключить локальный проект

```bash
cd /Users/samir/Documents/projects/salario
supabase logout
unset SUPABASE_ACCESS_TOKEN
supabase login
supabase projects list
```

Если `supabase projects list` возвращает `403`, проблема в аккаунте или правах. Для `supabase link` нужен доступ к проекту и чтение `Project Settings`, `API Keys`, `API Key Secrets`. Попросите владельца организации добавить вас с ролью Owner/Admin либо выдать доступ к проекту.

После этого:

```bash
supabase link --project-ref <REFERENCE_ID>
```

Подставьте Reference ID, а не URL, название проекта или organization ID. CLI попросит пароль базы данных, заданный при создании проекта.

## 3. Применить миграции

```bash
supabase db push
```

Миграции `0003_enable_pgcrypto.sql` и `0004_crud_workflow.sql` обязательны: первая включает `pgcrypto` для кодов приглашений, вторая добавляет CRUD для списков, подборок, позиций и целей копилки.

Проверьте таблицы в Dashboard → **Database → Tables**. Если появится ошибка о существующей политике или типе:

```bash
supabase migration list
```

Не удаляйте таблицы вручную и не запускайте `DROP SCHEMA`.

## 4. Создать Telegram-бота

Этот шаг выполняется **до** настройки `BOT_TOKEN`: токен появляется только после создания бота.

1. В Telegram откройте `@BotFather`.
2. Отправьте `/newbot`.
3. Задайте имя, например `Salario Family`.
4. Задайте username, заканчивающийся на `bot`, например `salario_family_bot`.
5. Сохраните выданный BotFather токен вида `123456789:AA...` — это `BOT_TOKEN`.
6. Отправьте `/newapp`, выберите созданного бота и задайте Mini App.
7. Запишите short name, например `family`.

Нужные значения:

```text
BOT_USERNAME=salario_family_bot
APP_SHORT_NAME=family
BOT_TOKEN=123456789:AA...
```

`BOT_USERNAME` указывается без `@`. URL Mini App будет добавлен после публикации на GitHub Pages; для локальной проверки используется HTTPS-туннель.

## 5. Локальный `.env`

```bash
cp .env.example .env
```

Заполните `.env`:

```env
VITE_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key-from-project-settings>
VITE_BOT_USERNAME=salario_family_bot
VITE_APP_SHORT_NAME=family
VITE_BASE_PATH=/salario/
```

`BOT_TOKEN`, `service_role key` и JWT secret сюда не добавляются.

```bash
npm install
npm run typecheck
npm test
npm run build
```

## 6. Edge Function

Теперь, когда бот создан и токен получен, задайте секреты:

```bash
supabase secrets set \
  BOT_TOKEN='123456789:AA...' \
  ADMIN_SERVICE_ROLE_KEY='service-role-key-from-project-settings' \
  PROJECT_JWT_SECRET='jwt-secret-from-project-settings' \
  ALLOWED_ORIGIN='https://<github-user>.github.io'
supabase functions deploy auth-telegram
supabase secrets list
```

`SUPABASE_URL` и служебные переменные Supabase Edge Functions получает автоматически. Service role key в браузер не передаётся.

`auth-telegram` специально настроена с `verify_jwt = false` в `supabase/config.toml`: на момент первого запроса JWT пользователя ещё не существует. Telegram-подпись проверяется внутри самой функции. Поэтому после изменения конфигурации нужно заново выполнить `supabase functions deploy auth-telegram`.

## 7. Локальный запуск через HTTPS

```bash
npm run dev -- --host 0.0.0.0
```

В другом терминале:

```bash
cloudflared tunnel --url http://localhost:5173
```

Скопируйте HTTPS-адрес `https://....trycloudflare.com`, затем обновите origin и функцию:

```bash
supabase secrets set ALLOWED_ORIGIN='https://....trycloudflare.com'
supabase functions deploy auth-telegram
```

В BotFather выполните `/setmenubutton`, выберите бота и укажите этот HTTPS URL. После изменения меню заново откройте Mini App.

## 8. GitHub Pages

1. Создайте GitHub-репозиторий и отправьте код в ветку `main`.
2. В GitHub откройте **Settings → Pages** и выберите **GitHub Actions**.
3. В **Settings → Secrets and variables → Actions** добавьте:
   - Variable `VITE_SUPABASE_URL` — Project URL;
   - Variable `VITE_BOT_USERNAME` — username без `@`;
   - Variable `VITE_APP_SHORT_NAME` — short name;
   - Secret `VITE_SUPABASE_ANON_KEY` — anon key.
4. Workflow `.github/workflows/deploy.yml` соберёт сайт.
5. URL будет `https://<github-user>.github.io/<repository-name>/`.
6. Этот URL укажите в BotFather для Mini App и Menu Button.
7. Для production обновите origin:

```bash
supabase secrets set ALLOWED_ORIGIN='https://<github-user>.github.io'
supabase functions deploy auth-telegram
```

## 9. Realtime

В Dashboard откройте **Database → Publications → supabase_realtime** и добавьте `lists`, `list_sections`, `list_items`, `savings_goals`, `savings_contributions`.

## 10. Проверка

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

В Telegram проверьте открытие Mini App, авторизацию, создание семьи, приглашение второго аккаунта и синхронизацию списков.

## Текущая схема авторизации и семьи

Frontend теперь вызывает `auth-telegram`, получает JWT, подписанный `SUPABASE_JWT_SECRET`, и использует его для запросов Supabase. Для создания семьи, приглашений и списков применяются RPC из миграции `0002_household_workflow.sql`.

После применения миграции можно сгенерировать типы:

```bash
supabase gen types typescript --linked > src/types/database.ts
```

После этого протестируйте authentication flow на двух Telegram-аккаунтах: первый создаёт семью и ссылку, второй открывает Mini App, вставляет код после `invite_` и вступает в семью.
