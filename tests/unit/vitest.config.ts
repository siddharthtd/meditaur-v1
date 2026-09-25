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
  // The app is written in `.tsx`, and a unit test may import one: without this the esbuild
  // transform emits `React.createElement` and every such import dies with "React is not
  // defined", which is a landmine rather than a decision.
  esbuild: { jsx: "automatic" },
});
