import js from "@eslint/js";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["**/dist/", "**/coverage/", "test-results/", "playwright-report/", ".venv/", "course/", "docs/"]),
  js.configs.recommended,
  tseslint.configs.recommended,
  { rules: { complexity: ["error", 15] } },
  {
    files: ["frontend/src/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat.recommended, jsxA11y.flatConfigs.recommended],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["scripts/**", "e2e/**", "*.config.{js,ts}", "frontend/*.config.ts"],
    languageOptions: { globals: globals.node },
  },
]);
