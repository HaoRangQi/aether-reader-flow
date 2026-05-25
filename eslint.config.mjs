import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Third-party bundled assets — not our code.
    "public/pdf.worker.min.mjs",
    "public/**/*.min.js",
    "public/**/*.min.mjs",
    "node_modules/**",
    "test-results/**",
    "playwright-report/**",
  ]),
]);

export default eslintConfig;
