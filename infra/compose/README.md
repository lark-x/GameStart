# Persistent local stack

The Compose file runs the complete persistent development stack:

- V2 SQLite, Redis and a reusable media volume;
- V2 API and Worker containers sharing SQLite and media volumes;
- an Nginx Web container that proxies `/api/v2` to the V2 API.

## Port strategy

Only the Web container publishes a host port. Redis and API are exposed
exclusively on the internal Docker network — the host never needs to reach
them directly because Nginx proxies `/api/v2/*` to `api:3003`.

| Service | Container port | Host port |
| ------- | ------------: | --------: |
| Redis   |          6379 |    —      |
| API     |          3003 |    —      |
| Worker  |           n/a |    —      |
| Web     |            80 | dynamic via `pnpm deploy` or configurable via `WEB_PORT` |

To expose Redis and API on the host for local debugging, use the dev overlay:

```sh
docker compose -f infra/compose/docker-compose.yml \
               -f infra/compose/docker-compose.dev.yml up -d
```

## One-command deployment workflow

From the repository root, start Docker Desktop and run:

```bash
pnpm deploy
```

Check deployment status:

```bash
pnpm deploy:status
```

Open the application at the printed URL (e.g. <http://127.0.0.1:18000>).

Stop the stack without deleting data:

```bash
pnpm deploy:stop
```

The scripts validate Docker Desktop, Compose and `.env` before doing anything. `down -v` is intentionally not used by the stop script because it deletes SQLite, Redis data and media files.

## Configuration

Set `V2_SCENE_GENERATION_ENABLED=true` only after configuring `LLM_BASE_URL`, `LLM_MODEL` and the required protocol credentials. Set `V2_ASSET_GENERATION_ENABLED=true` only after configuring `COMFYUI_BASE_URL`. ComfyUI may run separately on the host; from the application stack use `http://host.docker.internal:8188` where required.

The API owns forward SQLite migrations; the Worker waits for API readiness and never migrates the database.
