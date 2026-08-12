import { v2GenerationMigrations } from "../platform/index.ts";
import { v2GenerationJobMigrations } from "./migrations.ts";

(v2GenerationMigrations as { migrations: readonly typeof v2GenerationJobMigrations[number][] }).migrations = v2GenerationJobMigrations;

export * from "./migrations.ts";
export * from "./asset-repository.ts";
export * from "./repository.ts";
