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
| Web     |            80 | configurable via `WEB_PORT` |

Override the Web host port with `WEB_PORT=<port>` in `.env` or on the command
line. To expose Redis and API on the host for local debugging, use the dev
overlay:

```sh
docker compose -f infra/compose/docker-compose.yml \
               -f infra/compose/docker-compose.dev.yml up -d
```

## Windows one-command workflow

From the repository root, start Docker Desktop, create `.env`, and run:

```powershell
Copy-Item .env.example .env
.\scripts\persistent-up.ps1
```

The first run builds the application image and applies all pending V2 SQLite migrations through the API. Check the stack with:

```powershell
.\scripts\persistent-status.ps1
```

Open the application at <http://127.0.0.1:4173> (or whichever port you set via `WEB_PORT`).

Stop the stack without deleting data:

```powershell
.\scripts\persistent-down.ps1
```

The scripts validate Docker Desktop, Compose and `.env` before doing anything. `down -v` is intentionally not used by the stop script because it deletes SQLite, Redis data and media files.

## Configuration

Set `V2_SCENE_GENERATION_ENABLED=true` only after configuring `LLM_BASE_URL`, `LLM_MODEL` and the required protocol credentials. Set `V2_ASSET_GENERATION_ENABLED=true` only after configuring `COMFYUI_BASE_URL`. ComfyUI may run separately on the host; from the application stack use `http://host.docker.internal:8188` where required.

The API owns forward SQLite migrations; the Worker waits for API readiness and never migrates the database.
