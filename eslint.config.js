import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/.tools/**",
      "**/.turbo/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      // A `const` helper may not be *called* above its own line. A function declaration is
      // hoisted, so `functions: false` keeps that idiom; everything else is a
      // `ReferenceError` waiting for the one code path that reaches it — which is how a
      // filter in the Database took a whole screen down while typechecking, linting and
      // passing every unit test (the owner's round 22).
      "no-use-before-define": [
        "error",
        { functions: false, classes: true, variables: true, typedefs: false },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: 'JSXOpeningElement[name.name="select"]',
          message:
            "No dropdowns. Use TileGrid, Stepper, LatchButton, or PickerPage.",
        },
      ],
    },
  },
  {
    files: ["packages/domain/src/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "@meditaur/application", message: "Domain cannot depend on application." },
            { name: "@meditaur/db", message: "Domain cannot depend on adapters." },
            { name: "@meditaur/audio-web", message: "Domain cannot depend on adapters." },
            { name: "@meditaur/ui", message: "Domain cannot depend on UI." },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/application/src/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "@meditaur/db", message: "Application talks to ports, not Dexie." },
            { name: "@meditaur/audio-web", message: "Application talks to ports, not Web Audio." },
            { name: "@meditaur/ui", message: "Application cannot depend on UI." },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/db/src/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "@meditaur/application", message: "Adapters implement domain ports; do not import application." },
            { name: "@meditaur/audio-web", message: "Persistence adapter cannot depend on audio." },
            { name: "@meditaur/ui", message: "Persistence adapter cannot depend on UI." },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    ignores: ["apps/web/src/composition.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@meditaur/db",
              message: "Call MeditaurApp via @/composition. REST/gRPC will use the same facade.",
            },
          ],
        },
      ],
    },
  },
  {
    // The rule's own backlog, from the run that turned it on (the owner's round 22). Each
    // site is a helper *called* from a callback that runs after render, so it is safe today —
    // but it is one call away from the crash the rule exists to stop, and the whole point of
    // turning the rule on was that the crashing call looked exactly this harmless from far
    // away. It is a **ratchet**: reorder the helper as the file is touched, and take the file
    // out of this list when its last site is gone. The Database's own grid is not here; that is
    // the file the crash shipped in, and it is guarded.
    files: [
      "apps/web/src/features/database/DatabaseRecord.tsx",
      "apps/web/src/features/database/database-tables.ts",
      "apps/web/src/features/runner/Runner.tsx",
      "packages/application/src/create-app.ts",
    ],
    rules: {
      "no-use-before-define": "off",
    },
  },
  {
    files: ["tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
