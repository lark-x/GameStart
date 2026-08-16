#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

export const FEATURE_FIRST_SCOPE_MESSAGE =
  "Task/scope governance is temporarily disabled during the feature-first phase; dependency boundaries remain enforced separately.";

export function scopeGovernanceStatus() {
  return {
    enabled: false,
    errors: [],
    message: FEATURE_FIRST_SCOPE_MESSAGE,
  };
}

export function main() {
  console.log(scopeGovernanceStatus().message);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
