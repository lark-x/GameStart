import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import { applyMigrations, createPostgresSqlClient, createSqlRepositories } from "../../../packages/database/src/index.ts";
import { loadAppConfig } from "../../../packages/config/src/index.ts";
import {
  createComfyUiSettings,
  createImageWorkflowTemplate,
  importImageWorkflow,
  type JsonObject,
} from "../../../packages/domain/src/index.ts";

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
    const workflowPath = new URL(
      "../../../packages/database/seed/workflows/comfy-anima-v1.canvas.json",
      import.meta.url,
    );
    const imported = importImageWorkflow(
      JSON.parse(await readFile(fileURLToPath(workflowPath), "utf8")) as JsonObject,
    );
    const repositories = createSqlRepositories(database);
    await repositories.imageWorkflowTemplates.save(createImageWorkflowTemplate({
      id: "comfy-anima",
      version: "v1",
      workflow: imported.workflow,
      positivePromptPath: imported.positivePromptPath,
      ...(imported.negativePromptPath === undefined ? {} : { negativePromptPath: imported.negativePromptPath }),
      ...(imported.seedPath === undefined ? {} : { seedPath: imported.seedPath }),
    }));
    const existingSettings = await repositories.comfyUiSettings.get();
    if (existingSettings?.defaultWorkflowVersion === undefined) {
      await repositories.comfyUiSettings.save(createComfyUiSettings({
        id: "default",
        baseUrl: existingSettings?.baseUrl ?? config.comfyui.baseUrl,
        timeoutMs: existingSettings?.timeoutMs ?? config.comfyui.timeoutMs,
        defaultWorkflowVersion: "comfy-anima@v1",
        autoImageIntentEnabled: existingSettings?.autoImageIntentEnabled ?? false,
        updatedAt: new Date().toISOString(),
      }));
    }
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
