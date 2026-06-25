import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  pickupCommand,
  type PickupDependencies,
  SESSION_INJECTION_MISSING_WARNING_PREFIX,
  SESSION_INJECTION_SECTION_PREFIX,
} from "@/commands/session/pickup";
import { buildSessionFrontMatterContent } from "@/domains/session/create";
import { parseSessionMetadata } from "@/domains/session/list";
import {
  CLAIMABLE_STATUS,
  SESSION_FILE_ENCODING,
  SESSION_FRONT_MATTER,
  SESSION_PRIORITY,
} from "@/domains/session/types";
import {
  arbitraryDomainLiteral,
  arbitrarySourceFilePath,
  arbitrarySpecTreeTestFilePath,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";
import { buildSessionMarkdownBody } from "@testing/harnesses/session/harness";
import { createSessionHarness, type SessionHarness } from "@testing/harnesses/session/harness";
import { createTempDir, removeTempDir } from "@testing/harnesses/with-temp-dir";

let harness: SessionHarness;
let productDir: string;

function sampleText(): string {
  return sampleLiteralTestValue(arbitraryDomainLiteral());
}

function sampleSpecPath(): string {
  return sampleLiteralTestValue(arbitrarySpecTreeTestFilePath());
}

function sampleFilePath(): string {
  return sampleLiteralTestValue(arbitrarySourceFilePath());
}

async function writeProductFile(relativePath: string, content: string): Promise<void> {
  const absolutePath = resolve(productDir, relativePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, SESSION_FILE_ENCODING);
}

describe("pickup auto-injection", () => {
  beforeEach(async () => {
    harness = await createSessionHarness();
    productDir = await createTempDir("spx-session-injection-");
  });

  afterEach(async () => {
    await removeTempDir(productDir);
    await harness.cleanup();
  });

  it("prints every listed file in a delimited stdout section", async () => {
    const sessionId = sampleLiteralTestValue(arbitraryDomainLiteral());
    const specPath = sampleSpecPath();
    const filePath = sampleFilePath();
    const specContent = sampleText();
    const fileContent = sampleText();
    await writeProductFile(specPath, specContent);
    await writeProductFile(filePath, fileContent);
    await harness.writeSession(CLAIMABLE_STATUS, sessionId, { specs: [specPath], files: [filePath] });

    const output = await pickupCommand({ sessionIds: [sessionId], sessionsDir: harness.sessionsDir, cwd: productDir });

    expect(output).toContain(`${SESSION_INJECTION_SECTION_PREFIX}: ${specPath}`);
    expect(output).toContain(specContent);
    expect(output).toContain(`${SESSION_INJECTION_SECTION_PREFIX}: ${filePath}`);
    expect(output).toContain(fileContent);
  });

  it("warns and still claims the session when a listed file is missing", async () => {
    const sessionId = sampleLiteralTestValue(arbitraryDomainLiteral());
    const missingPath = sampleFilePath();
    const warnings: string[] = [];
    await harness.writeSession(CLAIMABLE_STATUS, sessionId, { specs: [missingPath] });

    const output = await pickupCommand({
      sessionIds: [sessionId],
      sessionsDir: harness.sessionsDir,
      cwd: productDir,
      onWarning: (warning) => warnings.push(warning),
    });

    expect(output).toContain(sessionId);
    expect(await harness.isInStatus(CLAIMABLE_STATUS, sessionId)).toBe(false);
    expect(warnings).toContain(`${SESSION_INJECTION_MISSING_WARNING_PREFIX}: ${missingPath}`);
  });

  it("prints no injection section when specs and files are empty", async () => {
    const sessionId = sampleLiteralTestValue(arbitraryDomainLiteral());
    await harness.writeSession(CLAIMABLE_STATUS, sessionId, { specs: [], files: [] });

    const output = await pickupCommand({ sessionIds: [sessionId], sessionsDir: harness.sessionsDir, cwd: productDir });

    expect(output).not.toContain(SESSION_INJECTION_SECTION_PREFIX);
  });

  it("prints no injection section when specs and files are omitted", async () => {
    const sessionId = sampleLiteralTestValue(arbitraryDomainLiteral());
    const content = buildSessionFrontMatterContent([
      `${SESSION_FRONT_MATTER.PRIORITY}: ${SESSION_PRIORITY.HIGH}`,
    ], buildSessionMarkdownBody(sampleText()));
    await harness.writeRawSession(CLAIMABLE_STATUS, sessionId, content);

    const output = await pickupCommand({ sessionIds: [sessionId], sessionsDir: harness.sessionsDir, cwd: productDir });

    expect(output).not.toContain(SESSION_INJECTION_SECTION_PREFIX);
  });

  it("does not read listed files when noInject is enabled", async () => {
    const sessionId = sampleLiteralTestValue(arbitraryDomainLiteral());
    const specPath = sampleSpecPath();
    const specContent = `${sampleText()}\nnoInject fixture body`;
    const injectedPath = resolve(productDir, specPath);
    let injectedReads = 0;
    await writeProductFile(specPath, specContent);
    await harness.writeSession(CLAIMABLE_STATUS, sessionId, { specs: [specPath] });
    const deps: PickupDependencies = {
      mkdir,
      readdir,
      rename,
      readFile: async (path, encoding) => {
        if (path === injectedPath) {
          injectedReads += 1;
        }
        return readFile(path, encoding);
      },
    };

    const output = await pickupCommand({
      sessionIds: [sessionId],
      sessionsDir: harness.sessionsDir,
      cwd: productDir,
      noInject: true,
      deps,
    });

    expect(injectedReads).toBe(0);
    expect(output).not.toContain(specContent);
    expect(output).not.toContain(SESSION_INJECTION_SECTION_PREFIX);
  });
});

describe("parseSessionMetadata — specs and files extraction (P1)", () => {
  it("GIVEN session with specs and files arrays WHEN parsed THEN both arrays extracted", () => {
    const expectedSpecs = ["auto/spec.md", "auto/other.md"];
    const expectedFiles = ["auto/file.ts", "auto/other.ts"];
    const content = buildSessionFrontMatterContent([
      `${SESSION_FRONT_MATTER.SPECS}: ${JSON.stringify(expectedSpecs)}`,
      `${SESSION_FRONT_MATTER.FILES}: ${JSON.stringify(expectedFiles)}`,
    ], buildSessionMarkdownBody("auto-injection arrays"));
    const result = parseSessionMetadata(content);

    expect(result.specs).toEqual(expectedSpecs);
    expect(result.files).toEqual(expectedFiles);
  });

  it("GIVEN session without specs/files WHEN parsed THEN fields are empty arrays", () => {
    const content = buildSessionFrontMatterContent([
      `${SESSION_FRONT_MATTER.PRIORITY}: ${SESSION_PRIORITY.HIGH}`,
    ], buildSessionMarkdownBody("no arrays"));
    const result = parseSessionMetadata(content);

    expect(result.specs).toEqual([]);
    expect(result.files).toEqual([]);
  });

  it("GIVEN session with empty specs/files arrays WHEN parsed THEN returns empty arrays", () => {
    const content = buildSessionFrontMatterContent([
      `${SESSION_FRONT_MATTER.SPECS}: []`,
      `${SESSION_FRONT_MATTER.FILES}: []`,
    ], buildSessionMarkdownBody("empty arrays"));
    const result = parseSessionMetadata(content);

    expect(result.specs).toEqual([]);
    expect(result.files).toEqual([]);
  });

  it("GIVEN session with non-array specs/files WHEN parsed THEN does not throw", () => {
    const content = buildSessionFrontMatterContent([
      `${SESSION_FRONT_MATTER.SPECS}: not-an-array`,
      `${SESSION_FRONT_MATTER.FILES}: 42`,
    ], buildSessionMarkdownBody("non-array values"));

    // Non-array values should not crash — graceful degradation
    expect(() => parseSessionMetadata(content)).not.toThrow();
  });

  it("GIVEN session with mixed-type specs array WHEN parsed THEN only strings kept", () => {
    const expectedSpecs = ["auto-valid.md"];
    const expectedFiles = ["auto-ok.ts"];
    const content = buildSessionFrontMatterContent([
      `${SESSION_FRONT_MATTER.SPECS}: ${JSON.stringify([...expectedSpecs, 123, true, null])}`,
      `${SESSION_FRONT_MATTER.FILES}: ${JSON.stringify([...expectedFiles, 456])}`,
    ], buildSessionMarkdownBody("mixed arrays"));
    const result = parseSessionMetadata(content);

    expect(result.specs).toEqual(expectedSpecs);
    expect(result.files).toEqual(expectedFiles);
  });

  it("GIVEN no front matter WHEN parsed THEN specs and files are empty arrays", () => {
    const result = parseSessionMetadata("# No frontmatter");

    expect(result.specs).toEqual([]);
    expect(result.files).toEqual([]);
  });
});

describe("parseSessionMetadata — specs/files property-based", () => {
  it("GIVEN arbitrary string arrays in YAML WHEN parsed THEN only strings survive", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string(), { maxLength: 5 }),
        (paths) => {
          const content = buildSessionFrontMatterContent([
            `${SESSION_FRONT_MATTER.SPECS}: ${JSON.stringify(paths)}`,
          ], buildSessionMarkdownBody("generated specs"));
          const result = parseSessionMetadata(content);

          expect(result.specs).toEqual(paths);
        },
      ),
    );
  });
});
