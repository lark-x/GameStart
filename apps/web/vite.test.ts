import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const config = readFileSync(new URL("./vite.config.ts", import.meta.url), "utf8");
const entry = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const adminView = readFileSync(new URL("./src/views/AdminView.vue", import.meta.url), "utf8");
const apiTypes = readFileSync(new URL("./src/api.d.ts", import.meta.url), "utf8");

test("Vite configuration uses the ESM-safe root and Vue entry rewrite", () => {
  assert.match(config, /fileURLToPath/);
  assert.doesNotMatch(config, /__dirname/);
  assert.match(entry, /id="app"/);
  assert.match(entry, /src\/main-vue\.ts/);
  assert.match(adminView, /createRelationship/);
  assert.match(adminView, /createWorldEvent/);
  assert.match(adminView, /updateRelationship/);
  assert.match(adminView, /updateWorldEvent/);
  assert.match(adminView, /candidate\.id === store\.currentWorldId/);
  assert.match(adminView, /v-model="newRelationship\.relationshipType"/);
  assert.match(adminView, /v-model="newEvent\.eventKey"/);
  assert.match(apiTypes, /class ApiClient/);
  assert.match(apiTypes, /getWorldCalendar/);
});
