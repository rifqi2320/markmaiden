# MarkMaiden

MarkMaiden is a live markdown and Mermaid editor with lightweight sharing. The current use case is simple:

- write markdown locally in the browser
- render it live with Mermaid support
- save the draft as a small file-backed shortlink
- reopen the shared note later through the shortlink

## Architecture

- `apps/frontend`: React + Vite editor and preview UI
- `apps/backend`: Express API that stores uploaded files in Postgres and returns shortlinks
- `postgres`: persistence for shortlinks
- `proxy`: Nginx reverse proxy with a `2 MB` `client_max_body_size`

Backend limits:

- max `1 MB` file per shortlink
- max `1000` stored shortlinks
- when a new shortlink pushes the table above `1000`, the oldest rows are deleted

## Workspace

This repo is a `pnpm` monorepo.

```bash
pnpm install
pnpm dev
pnpm build
```

`pnpm dev` runs the frontend and backend locally. The Vite dev server proxies `/api` to `http://localhost:3000`.

## Docker Compose

```bash
docker compose up --build
```

The app is exposed at `http://localhost:12001`.

Services:

- frontend static app
- backend API
- postgres database
- reverse proxy
