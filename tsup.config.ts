import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig } from "tsup";

import { BUILD_IDENTITY_DEFINE_KEY, readBuildIdentity } from "./src/lib/build-identity";
import { defaultGitDependencies } from "./src/lib/git/root";

const PACKAGE_MANIFEST = new URL("package.json", import.meta.url);
const PRODUCT_DIR = fileURLToPath(new URL(".", import.meta.url));

function packageVersion(): string {
  const manifest: unknown = JSON.parse(readFileSync(PACKAGE_MANIFEST, "utf8"));
  if (
    typeof manifest !== "object" || manifest === null || !("version" in manifest)
    || typeof manifest.version !== "string"
  ) {
    throw new Error(`${fileURLToPath(PACKAGE_MANIFEST)} declares no string version`);
  }
  return manifest.version;
}

// The version `spx --version` reports is stamped into dist/ here, from the git state of the
// checkout being built, so the executable never reads git to decide it.
export default defineConfig(async () => ({
  define: {
    [BUILD_IDENTITY_DEFINE_KEY]: JSON.stringify(
      await readBuildIdentity(packageVersion(), PRODUCT_DIR, defaultGitDependencies),
    ),
  },
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
}));
