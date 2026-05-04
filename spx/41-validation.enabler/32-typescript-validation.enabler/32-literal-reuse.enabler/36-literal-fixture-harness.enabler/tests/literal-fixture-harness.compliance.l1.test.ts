import { existsSync } from "node:fs";
import { join as joinPath } from "node:path";

import { describe, expect, it } from "vitest";

import type { Config } from "@/config/types";
import { detectTypeScript, TYPESCRIPT_MARKER } from "@/validation/discovery/index";
import { withLiteralFixtureEnv } from "@testing/harnesses/literal/harness";

const EMPTY_CONFIG: Config = {};

describe("withLiteralFixtureEnv compliance", () => {
  it("writes the discovery marker at the path bound to TYPESCRIPT_MARKER and detectTypeScript reports present", async () => {
    await withLiteralFixtureEnv(EMPTY_CONFIG, async (env) => {
      await env.writeTsConfigMarker();
      const markerPath = joinPath(env.projectDir, TYPESCRIPT_MARKER);
      expect(existsSync(markerPath)).toBe(true);
      const detection = detectTypeScript(env.projectDir);
      expect(detection.present).toBe(true);
    });
  });
});
