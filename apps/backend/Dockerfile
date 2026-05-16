FROM node:22-alpine
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/backend/package.json apps/backend/package.json

RUN corepack enable && pnpm install --filter @markmaiden/backend... --frozen-lockfile

COPY apps/backend apps/backend

WORKDIR /app/apps/backend
EXPOSE 3000
CMD ["pnpm", "start"]
