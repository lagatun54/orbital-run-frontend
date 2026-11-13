# Орбитальный сбор — клиент

Браузерная игра на PixiJS. Клиент собирается и публикуется независимо от
Go-бэкенда; для онлайн-матчей и общего рейтинга ему нужен адрес API.

## Локальный запуск

Нужны Node.js 22 и Python 3. Запустите бэкенд, разрешив origin
`http://localhost:5173` в его `FRONTEND_ORIGIN`, затем выполните:

```sh
npm ci
BACKEND_URL=http://localhost:8080 npm run build
python3 -m http.server 5173 --bind 127.0.0.1 --directory dist
```

Откройте http://localhost:5173. `BACKEND_URL` — HTTP(S) origin без пути,
параметров и завершающего слеша. Если его не задать, доступен локальный режим
без сервера. После изменения адреса нужна повторная сборка.

## Публикация в GitHub Pages

В Settings → Pages выберите GitHub Actions. Workflow Frontend собирает и
публикует сайт из основной ветки. Его также можно запустить вручную.

При публикации клиент использует API по адресу
`https://orbital-run-api.onrender.com`. Чтобы сменить API, задайте
`BACKEND_URL` в Settings → Secrets and variables → Actions → Variables и
запустите workflow заново. Адрес должен использовать HTTPS.

На бэкенде установите `FRONTEND_ORIGIN=https://lagatun54.github.io`.
Для собственного домена укажите его origin без пути. Клиент обращается
к `/ws`, `/api/leaderboard`, `/api/results/{id}` и `/api/local-results`.
