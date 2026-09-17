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
