import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const repoRoot = path.join(fileURLToPath(new URL(".", import.meta.url)), "../..");

export default defineConfig({
  root: repoRoot,
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
