import assert from "node:assert/strict";
import test from "node:test";

import { promptForExplicitChatImageIntent } from "./auto-image-intent.ts";

test("only accepts explicit image requests with an affirmative or visual reply", () => {
  assert.match(
    promptForExplicitChatImageIntent("请画一张雨夜咖啡馆的插画", "好的，我会生成一张雨夜咖啡馆的场景图。") ?? "",
    /雨夜咖啡馆/,
  );
  assert.match(
    promptForExplicitChatImageIntent("Generate an image of a mountain cabin", "Sure, a misty dawn scene.") ?? "",
    /mountain cabin/,
  );
  assert.equal(promptForExplicitChatImageIntent("Tell me a story set in a cafe", "A quiet cafe waits in the rain."), undefined);
  assert.equal(promptForExplicitChatImageIntent("Please generate an image", "I cannot generate images here."), undefined);
});
