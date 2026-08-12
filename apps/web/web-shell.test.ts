import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const client = readFileSync(new URL("./src/api.ts", import.meta.url), "utf8");
const main = readFileSync(new URL("./src/main-vue.ts", import.meta.url), "utf8");
const styles = readFileSync(new URL("./src/tailwind.css", import.meta.url), "utf8");

test("web shell exposes role, feed and asset surfaces", () => {
  assert.match(html, /id="app"/);
  assert.match(main, /createApp/);
  assert.match(client, /\/v1\/actor-sessions\/switch/);
  assert.match(client, /\/v1\/moments/);
  assert.match(client, /\/v1\/sticker-packs/);
  assert.match(client, /\/v1\/conversations/);
  assert.match(client, /\/interactions/);
  assert.match(client, /text\/event-stream/);
  assert.match(client, /\/v1\/relationships/);
  assert.match(client, /\/calendar/);
  assert.match(client, /visual-identity/);
  assert.match(client, /validateWorkflow/);
  assert.match(styles, /@import/);
});
