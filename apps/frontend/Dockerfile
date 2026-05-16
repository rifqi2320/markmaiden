FROM node:22-alpine AS build
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/frontend/package.json apps/frontend/package.json

RUN corepack enable && pnpm install --filter @markmaiden/frontend... --frozen-lockfile

COPY apps/frontend apps/frontend

RUN pnpm --filter @markmaiden/frontend build

FROM nginx:1.27-alpine AS runtime
COPY docker/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/frontend/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
