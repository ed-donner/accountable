// ESLint for the TypeScript and JavaScript: the frontend, the end-to-end tests
// and the npm scripts. Prettier owns the formatting, so its config comes last
// to turn off any rule that would argue with it.

import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  // The course material, past contributions and design mockups aren't the app's code.
  globalIgnores(["course/", "community_contributions/", "docs/", "**/dist/", "**/coverage/"]),
  {
    files: ["**/*.{js,mjs,ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    rules: {
      complexity: ["error", 15],
    },
  },
  {
    files: ["frontend/src/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat.recommended, jsxA11y.flatConfigs.recommended],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["frontend/vite.config.ts", "e2e/**", "scripts/**", "eslint.config.js"],
    languageOptions: { globals: globals.node },
  },
  {
    // Playwright reads a fixture's first parameter, and one with no dependencies
    // must be written as ({}, use).
    files: ["e2e/**"],
    rules: { "no-empty-pattern": ["error", { allowObjectPatternsAsParameters: true }] },
  },
  prettier,
]);
