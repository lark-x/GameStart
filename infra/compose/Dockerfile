FROM node:24.15.0-alpine AS app-runtime

WORKDIR /app

COPY . .

RUN corepack enable \
  && pnpm install --frozen-lockfile --prod=false \
  && mkdir -p /app/data/media /app/data/sqlite \
  && chown -R node:node /app \
  && chmod 770 /app/data /app/data/media /app/data/sqlite

USER node

FROM app-runtime AS web-build

RUN pnpm --filter @living-network/web build

FROM nginx:1.27.4-alpine AS web

COPY infra/compose/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/apps/web/dist /usr/share/nginx/html