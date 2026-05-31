/**
 * Property tests for the JSON-prefix input contract declared by
 * `spx/36-session.enabler/11-session-frontmatter.pdr.md`.
 *
 * Tests express the round-trip invariant: every caller-supplied string field
 * survives unchanged from JSON-header input to parsed session-file metadata,
 * regardless of which unicode codepoints the string contains. The invariant
 * fails for any implementation that destroys caller content during parsing
 * (e.g., the YAML-comment truncation that motivates this contract).
 *
 * Spec: spx/36-session.enabler/43-session-store.enabler/session-store.md
 *
 * @module spx/36-session.enabler/43-session-store.enabler/tests/property
 */

import { readFile } from "node:fs/promises";

import * as fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { handoffCommand } from "@/commands/session/handoff";
import { SessionLegacyFrontmatterInputError } from "@/domains/session/errors";
import { parseSessionMetadata } from "@/domains/session/list";
import { arbitraryHandoffHeader, arbitraryLegacyYamlFrontmatterStdin } from "@testing/generators/session/session";
import {
  buildHandoffStdin,
  createSessionGitDeps,
  createSessionHarness,
  SessionHarness,
} from "@testing/harnesses/session/harness";

import { extractSessionFile } from "./helpers";

const PROPERTY_RUN_COUNT = 100;
const TEST_TIMEOUT_MS = 60_000;

const PROPERTY_GIT_DEPS = createSessionGitDeps();

describe("handoff round-trip property", () => {
  let harness: SessionHarness;

  beforeEach(async () => {
    harness = await createSessionHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it(
    "for every JSON header with arbitrary unicode strings, the parsed session metadata equals caller input exactly",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryHandoffHeader(),
          // Body must be non-empty so the `onDisk.endsWith(body)` check is
          // falsifiable — `''.endsWith('')` is vacuously true regardless of
          // what the implementation writes after the YAML frontmatter.
          // `unit: "binary"` covers the full Unicode range (0000-10FFFF) so
          // the round-trip is exercised beyond BMP-only inputs.
          fc.string({ unit: "binary", minLength: 1 }),
          async (header, body) => {
            const stdin = buildHandoffStdin(header, body);

            const { output } = await handoffCommand({
              content: stdin,
              sessionsDir: harness.sessionsDir,
              deps: PROPERTY_GIT_DEPS,
            });

            const onDisk = await readFile(extractSessionFile(output), "utf-8");
            const parsed = parseSessionMetadata(onDisk);

            expect(parsed.priority).toBe(header.priority);
            expect(parsed.goal).toBe(header.goal);
            expect(parsed.next_step).toBe(header.next_step);
            expect(parsed.specs).toEqual([...header.specs]);
            expect(parsed.files).toEqual([...header.files]);
            expect(onDisk.endsWith(body)).toBe(true);
          },
        ),
        { numRuns: PROPERTY_RUN_COUNT },
      );
    },
    TEST_TIMEOUT_MS,
  );
});

describe("handoff legacy YAML rejection property", () => {
  let harness: SessionHarness;

  beforeEach(async () => {
    harness = await createSessionHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it(
    "for every stdin opening with the YAML-frontmatter delimiter, handoff throws SessionLegacyFrontmatterInputError",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryLegacyYamlFrontmatterStdin(),
          async (stdin) => {
            await expect(
              handoffCommand({
                content: stdin,
                sessionsDir: harness.sessionsDir,
                deps: PROPERTY_GIT_DEPS,
              }),
            ).rejects.toBeInstanceOf(SessionLegacyFrontmatterInputError);
          },
        ),
        { numRuns: PROPERTY_RUN_COUNT },
      );
    },
    TEST_TIMEOUT_MS,
  );
});

// Malformed-JSON rejection is covered as a Scenario assertion in
// session-store.scenario.l1.test.ts. A property reformulation here would test
// JSON.parse's rejection behavior (a stdlib invariant), not the parser's
// contract — and would violate the per-file evidence-type contract for a
// .property.l1.test.ts file.
