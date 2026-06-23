import { webcrypto } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CONFIG_FILE_FORMAT,
  CONFIG_FILENAMES,
  DEFAULT_CONFIG_FILENAME,
  type DescriptorSectionDigest,
  digestDescriptorSection,
  resolveConfig,
  serializeConfigFileSections,
} from "@/config/index";
import { PATH_FILTER_CONFIG_FIELDS } from "@/config/primitives/path-filter";
import { TESTING_CONFIG_FIELDS, TESTING_SECTION, testingConfigDescriptor } from "@/test/config";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { WEB_CRYPTO_SHA256_ALGORITHM } from "@testing/harnesses/crypto";
import type { Config } from "@testing/harnesses/spec-tree/spec-tree";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

const sha256ByteLength = 32;

function expectDigest(value: unknown): DescriptorSectionDigest {
  const result = digestDescriptorSection(value, TESTING_SECTION);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
}

function expectResolvedTestingSection(config: Awaited<ReturnType<typeof resolveConfig>>): unknown {
  expect(config.ok).toBe(true);
  if (!config.ok) {
    throw new Error(config.error);
  }
  return config.value[TESTING_SECTION];
}

function serializeSections(
  format: typeof CONFIG_FILE_FORMAT.JSON | typeof CONFIG_FILE_FORMAT.TOML,
  config: Config,
): string {
  const serialized = serializeConfigFileSections(format, config);
  expect(serialized.ok).toBe(true);
  if (!serialized.ok) {
    throw new Error(serialized.error);
  }
  return serialized.value;
}

function hexFromBytes(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

describe("descriptor section digest compliance", () => {
  it("hashes the UTF-8 bytes of canonical descriptor JSON with SHA-256", async () => {
    const filter = sampleConfigTestValue(CONFIG_TEST_GENERATOR.pathFilter());
    const digest = expectDigest({
      [TESTING_CONFIG_FIELDS.PASSING_SCOPE]: filter,
    });
    const encoded = new TextEncoder().encode(digest.canonicalJson);
    const expected = await webcrypto.subtle.digest(WEB_CRYPTO_SHA256_ALGORITHM, encoded);

    expect(digest.sha256).toBe(hexFromBytes(expected));
    expect(digest.sha256).toHaveLength(expected.byteLength * 2);
    expect(expected).toHaveProperty("byteLength", sha256ByteLength);
  });

  it("changes the digest when the resolved descriptor section changes", () => {
    const firstMarker = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const secondMarker = sampleConfigTestValue(
      CONFIG_TEST_GENERATOR.key().filter((value) => value !== firstMarker),
    );
    const first = expectDigest({
      [TESTING_CONFIG_FIELDS.PASSING_SCOPE]: { [PATH_FILTER_CONFIG_FIELDS.INCLUDE]: [firstMarker] },
    });
    const second = expectDigest({
      [TESTING_CONFIG_FIELDS.PASSING_SCOPE]: { [PATH_FILTER_CONFIG_FIELDS.INCLUDE]: [secondMarker] },
    });

    expect(second.sha256).not.toBe(first.sha256);
  });

  it("computes digest from resolved descriptor defaults when the config section is absent", async () => {
    await withTestEnv({}, async ({ productDir }) => {
      const resolved = await resolveConfig(productDir, [testingConfigDescriptor]);
      const digest = expectDigest(expectResolvedTestingSection(resolved));

      expect(digest).toEqual(expectDigest(testingConfigDescriptor.defaults));
    });
  });

  it("ignores raw config formatting and unrelated descriptor sections for equivalent resolved sections", async () => {
    const filter = sampleConfigTestValue(CONFIG_TEST_GENERATOR.pathFilter());
    const unrelatedSection = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const unrelatedField = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const config: Config = {
      [TESTING_SECTION]: {
        [TESTING_CONFIG_FIELDS.PASSING_SCOPE]: filter,
      },
    };
    const configWithUnrelatedSection: Config = {
      ...config,
      [unrelatedSection]: {
        [unrelatedField]: sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar()),
      },
    };
    const digests: string[] = [];

    await withTestEnv(config, async ({ productDir }) => {
      const resolved = await resolveConfig(productDir, [testingConfigDescriptor]);
      digests.push(expectDigest(expectResolvedTestingSection(resolved)).sha256);
    });

    await withTestEnv({}, async ({ productDir, writeRaw }) => {
      await rm(join(productDir, DEFAULT_CONFIG_FILENAME));
      await writeRaw(
        CONFIG_FILENAMES.json,
        serializeSections(CONFIG_FILE_FORMAT.JSON, configWithUnrelatedSection),
      );
      const resolved = await resolveConfig(productDir, [testingConfigDescriptor]);
      digests.push(expectDigest(expectResolvedTestingSection(resolved)).sha256);
    });

    await withTestEnv({}, async ({ productDir, writeRaw }) => {
      await rm(join(productDir, DEFAULT_CONFIG_FILENAME));
      await writeRaw(
        CONFIG_FILENAMES.toml,
        serializeSections(CONFIG_FILE_FORMAT.TOML, configWithUnrelatedSection),
      );
      const resolved = await resolveConfig(productDir, [testingConfigDescriptor]);
      digests.push(expectDigest(expectResolvedTestingSection(resolved)).sha256);
    });

    expect(digests).toEqual([digests[0], digests[0], digests[0]]);
  });
});
