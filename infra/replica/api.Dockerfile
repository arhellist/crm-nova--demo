# api.Dockerfile — образ read-only backend для контура реплики.
#
# Почему образ собирается из этого же репозитория: backend обязан запускаться тем же кодом,
# что прошёл CI, и не иметь строки подключения к primary внутри (INV-001). Секреты приходят
# только переменными окружения контейнера (security/secrets-and-config.md).
#
# Сборка: docker compose -f infra/replica/docker-compose.yml build api

FROM node:20-alpine AS build

WORKDIR /app

# Сначала только манифесты: слой зависимостей кэшируется между сборками.
COPY package.json package-lock.json ./
RUN npm ci

# Исходники и конфиг TypeScript: `npm run build` кладёт JS в dist/.
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

# Процесс не работает от root.
USER node

EXPOSE 8080

# Health-проверка не ходит в БД: /health отвечает 200 и при недоступной реплике (A11.6).
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server/index.js"]
