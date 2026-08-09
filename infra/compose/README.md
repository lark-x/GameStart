# Persistent local stack

The Compose file runs the complete persistent development stack:

- PostgreSQL, Redis and MinIO with named data volumes;
- a repeat-safe `migrate`/seed job;
- API and Worker containers with restart policies and health checks;
- an Nginx Web container that proxies `/v1`, `/health` and `/ready` to the API.

## Windows one-command workflow

From the repository root, start Docker Desktop, create `.env`, and run:

```powershell
Copy-Item .env.example .env
.\scripts\persistent-up.ps1
```

The first run builds the application image and applies all pending migrations. Check the stack with:

```powershell
.\scripts\persistent-status.ps1
```

Open the application at <http://127.0.0.1:4173>. The API is also exposed at <http://127.0.0.1:3000>.

Stop the stack without deleting data:

```powershell
.\scripts\persistent-down.ps1
```

The scripts validate Docker Desktop, Compose and `.env` before doing anything. `down -v` is intentionally not used by the stop script because it deletes local databases, Redis data, MinIO objects and media files.

## Configuration

Keep `INTEGRATION_SECRET_KEY` stable. It encrypts model API keys saved through the settings page. Set `IMAGE_GENERATION_ENABLED=true` only after configuring a default workflow and ComfyUI connection in the Web settings. ComfyUI may run separately on the Windows host at `http://127.0.0.1:8188`; when ComfyUI is containerized, use `http://host.docker.internal:8188` from the application stack.

The `migrate` service exits successfully after migrations and seed data are applied; API, Worker and Web wait for their required dependencies before starting.