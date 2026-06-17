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
  ],
});
