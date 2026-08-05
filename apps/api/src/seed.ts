import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import { applyMigrations, createPostgresSqlClient } from "../../../packages/database/src/index.ts";
import { loadAppConfig } from "../../../packages/config/src/index.ts";

export async function seedPersistentDatabase(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Promise<void> {
  const config = loadAppConfig(environment);
  if (config.database.url.length === 0) throw new Error("DATABASE_URL is required for database seed");
  const database = await createPostgresSqlClient({ connectionString: config.database.url });
  try {
    await applyMigrations(database);
    const sqlPath = new URL("../../../packages/database/seed/dev.sql", import.meta.url);
    await database.query(await readFile(fileURLToPath(sqlPath), "utf8"));
  } finally {
    await database.close();
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await seedPersistentDatabase().then(
    () => console.log("Development database seed applied"),
    (error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    },
  );
}
