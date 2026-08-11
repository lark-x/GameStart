import { applyMigrations, createPostgresSqlClient } from "../../../packages/database/src/index.ts";
import { loadAppConfig } from "../../../packages/config/src/index.ts";
import { pathToFileURL } from "node:url";

export async function migratePersistentDatabase(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Promise<void> {
  const config = loadAppConfig(environment);
  if (config.database.url.length === 0) throw new Error("DATABASE_URL is required for migration");
  const database = await createPostgresSqlClient({ connectionString: config.database.url });
  try {
    const result = await applyMigrations(database);
    if (result.applied.length > 0) {
      console.log(`Applied migrations: ${result.applied.join(", ")}`);
    } else {
      console.log("No pending migrations");
    }
    console.log(`Current schema version: ${Math.max(...result.current)}`);
  } finally {
    await database.close();
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await migratePersistentDatabase().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
