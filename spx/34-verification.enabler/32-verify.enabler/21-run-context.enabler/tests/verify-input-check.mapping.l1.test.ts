import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { VERIFY_INPUT_CHECK_RESULT } from "@/domains/verify/verify";
import { CONTENT_NORMALIZATION, UNIVERSAL_NEWLINE_DIGEST_VERSION } from "@/lib/verification-input";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  CHECK_FILE_RELATION,
  CHECK_NORMALIZATION_SPELLINGS,
  expectedEqualUnder,
  referenceDigestUnder,
  VERIFY_CONTENT_IDENTITY_TEST_GENERATOR,
} from "@testing/generators/verify/content-identity";
import { observeInputCheck, parseInputCheckReport } from "@testing/harnesses/verify/content-identity";

describe("verify input check mapping", () => {
  const relations = Object.values(CHECK_FILE_RELATION);

  for (const spelled of CHECK_NORMALIZATION_SPELLINGS) {
    for (const relation of relations) {
      it(`reports the result of checking a ${relation} file under ${spelled ?? "an omitted normalization"}`, async () => {
        const scenario = sampleGeneratedValue(VERIFY_CONTENT_IDENTITY_TEST_GENERATOR.checkFileScenario(relation));
        const normalization = spelled ?? CONTENT_NORMALIZATION.NONE;

        const observation = await observeInputCheck({
          recordedBytes: scenario.recorded.bytes,
          checkedFile: { path: scenario.path, bytes: scenario.checked.bytes },
          ...(spelled === undefined ? {} : { contentNormalization: spelled }),
        });

        expect(new Set(Object.values(observation.roots)).size).toBe(Object.keys(observation.roots).length);
        expect(observation.checkFileReads).toStrictEqual([resolve(observation.roots.invocationDir, scenario.path)]);
        expect(observation.command.exitCode).toBe(
          expectedEqualUnder(relation, normalization) ? VERIFY_CLI_EXIT_CODE.OK : VERIFY_CLI_EXIT_CODE.ERROR,
        );
        const report = parseInputCheckReport(observation.command.output);
        expect(report.result).toBe(
          expectedEqualUnder(relation, normalization)
            ? VERIFY_INPUT_CHECK_RESULT.EQUAL
            : VERIFY_INPUT_CHECK_RESULT.DIFFERENT,
        );
        expect(report.expected).toBe(referenceDigestUnder(normalization, scenario.recorded));
        expect(report.observed).toBe(referenceDigestUnder(normalization, scenario.checked));
        expect(report.normalization).toBe(normalization);
        expect(report.normalizationVersion).toBe(
          normalization === CONTENT_NORMALIZATION.UTF8_UNIVERSAL_NEWLINES
            ? UNIVERSAL_NEWLINE_DIGEST_VERSION
            : undefined,
        );
        expect(report.source).toBe(observation.startReport.input.source);
      });
    }
  }
});
