import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    ".corepack/**",
    ".npm-cache/**",
    ".pnpm-cache/**",
    ".pnpm-store/**",
    ".worker-dist/**",
    "public/stockfish/**",
    "next-env.d.ts",
  ]),
]);
