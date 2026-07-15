import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2022",
  outDir: "dist",
  external: [
    "execa",
    // dependency-cruiser loads local compiler tooling dynamically and must stay
    // external as an installed runtime dependency.
    "dependency-cruiser",
    // @typescript-eslint/parser pulls in typescript-estree + debug, which use dynamic
    // require() for Node built-ins ('tty', 'fs', 'path'). Must stay external.
    "@typescript-eslint/parser",
    "@typescript-eslint/visitor-keys",
    "@typescript-eslint/typescript-estree",
    "eslint-visitor-keys",
    // The Ink terminal UI and its React renderer are runtime dependencies; keep
    // them external rather than bundling the React reconciler into dist/.
    "react",
    "ink",
    // The TypeScript journal-streaming run loads the Vitest Node API through a
    // dynamic import that resolves only when a run actually starts; keep it
    // external so the heavy Node API (and its optional `@vitest/ui` import) is
    // never bundled into dist/.
    "vitest",
    "vitest/node",
    "@vitest/ui",
  ],
});
