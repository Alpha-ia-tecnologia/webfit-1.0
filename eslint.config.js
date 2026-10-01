import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

// ESLint do app web (React 19 + Vite). Rode com `npm run lint:react`.
// Os tipos continuam em `npm run lint` (tsc); aqui só regras sem informação de tipo, para ser rápido.
export default defineConfig([
  globalIgnores(["dist/", "mobile/", "node_modules/", "test-results/", "playwright-report/", "blob-report/", "coverage/", ".local/"]),
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended, jsxA11y.flatConfigs.recommended],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
]);
