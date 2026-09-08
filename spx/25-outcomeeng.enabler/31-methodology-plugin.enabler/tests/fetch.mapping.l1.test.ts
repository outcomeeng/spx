import { describe, expect, it } from "vitest";

import {
  FETCH_ARGUMENT_FLAGS,
  FETCH_ARGUMENT_TERMINATOR,
  FETCH_DEFAULT_REVISION,
  parseFetchArguments,
} from "@/lib/methodology";
import { arbitraryPathSegment } from "@testing/generators/git-name/git-name";
import { arbitraryMethodologyLine, arbitraryMethodologyVersion } from "@testing/generators/methodology/tree";
import { sampleGeneratedValue } from "@testing/generators/sample";

describe("methodology fetch arguments", () => {
  it("maps each argument form to the revision and line the fetch reads, defaulting the revision and stripping a leading terminator", () => {
    const line = sampleGeneratedValue(arbitraryMethodologyLine());
    const revision = sampleGeneratedValue(arbitraryPathSegment());
    const rows: readonly (readonly [readonly string[], { readonly revision: string; readonly line?: string }])[] = [
      [[], { revision: FETCH_DEFAULT_REVISION }],
      [[FETCH_ARGUMENT_FLAGS.LINE, line], { revision: FETCH_DEFAULT_REVISION, line }],
      [[FETCH_ARGUMENT_FLAGS.REVISION, revision], { revision }],
      [[FETCH_ARGUMENT_FLAGS.REVISION, revision, FETCH_ARGUMENT_FLAGS.LINE, line], { revision, line }],
      [[FETCH_ARGUMENT_TERMINATOR, FETCH_ARGUMENT_FLAGS.LINE, line], { revision: FETCH_DEFAULT_REVISION, line }],
    ];
    for (const [argv, expected] of rows) {
      expect(parseFetchArguments(argv), argv.join(" ")).toEqual({ ok: true, value: expected });
    }
  });

  it("maps a patch-versioned line to a failure naming it, and a positional argument to a failure", () => {
    const version = sampleGeneratedValue(arbitraryMethodologyVersion());
    const stray = sampleGeneratedValue(arbitraryPathSegment());

    const patchLine = parseFetchArguments([FETCH_ARGUMENT_FLAGS.LINE, version.text]);
    expect(patchLine.ok).toBe(false);
    if (!patchLine.ok) expect(patchLine.error).toContain(version.text);

    expect(parseFetchArguments([stray]).ok).toBe(false);
  });
});
