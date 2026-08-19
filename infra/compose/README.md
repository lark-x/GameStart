# Persistent local stack

The Compose file runs the complete persistent development stack:

- V2 SQLite, Redis and a reusable media volume;
- V2 API and Worker containers sharing SQLite and media volumes;
- an Nginx Web container that proxies `/api/v2` to the V2 API.

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

Open the application at <http://127.0.0.1:4173>. The API is also exposed at <http://127.0.0.1:3003>.

Stop the stack without deleting data:

```powershell
.\scripts\persistent-down.ps1
```

The scripts validate Docker Desktop, Compose and `.env` before doing anything. `down -v` is intentionally not used by the stop script because it deletes SQLite, Redis data and media files.

## Configuration

Set `V2_SCENE_GENERATION_ENABLED=true` only after configuring `LLM_BASE_URL`, `LLM_MODEL` and the required protocol credentials. Set `V2_ASSET_GENERATION_ENABLED=true` only after configuring `COMFYUI_BASE_URL`. ComfyUI may run separately on the host; from the application stack use `http://host.docker.internal:8188` where required.

The API owns forward SQLite migrations; the Worker waits for API readiness and never migrates the database.
