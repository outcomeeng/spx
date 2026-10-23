/**
 * Lock path mapping: each environment class resolves to the declared location or a failure before start.
 */

import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  LOCAL_STATE_SEGMENTS,
  LOCK_ENV,
  LOCK_FILE_SEGMENTS,
  resolveLockPath,
  RESULT_STATUS,
} from "@/lib/host-command-lock";
import {
  arbitraryAbsoluteDirectory,
  arbitraryRelativeDirectory,
} from "@testing/generators/host-command-lock/host-command-lock";
import { sampleGeneratedValue } from "@testing/generators/sample";

describe("orchestration lock path mapping", () => {
  it("maps an absolute override to that path", () => {
    const override = sampleGeneratedValue(arbitraryAbsoluteDirectory());

    expect(resolveLockPath({ [LOCK_ENV.PATH_OVERRIDE]: override })).toEqual({ ok: true, path: override });
  });

  it("maps an empty override to a failure before start", () => {
    const result = resolveLockPath({ [LOCK_ENV.PATH_OVERRIDE]: "" });

    expect(result.ok).toBe(false);
  });

  it("maps a relative override to a failure before start", () => {
    const override = sampleGeneratedValue(arbitraryRelativeDirectory());

    const result = resolveLockPath({ [LOCK_ENV.PATH_OVERRIDE]: override });

    expect(result).toEqual({ ok: false, status: RESULT_STATUS.INVALID_ARGUMENTS });
  });

  it("maps an unset override with an absolute state home to the state home location", () => {
    const stateHome = sampleGeneratedValue(arbitraryAbsoluteDirectory());

    expect(resolveLockPath({ [LOCK_ENV.STATE_HOME]: stateHome })).toEqual({
      ok: true,
      path: join(stateHome, ...LOCK_FILE_SEGMENTS),
    });
  });

  it("maps an unset override and state home to the home location", () => {
    const home = sampleGeneratedValue(arbitraryAbsoluteDirectory());

    expect(resolveLockPath({ [LOCK_ENV.HOME]: home })).toEqual({
      ok: true,
      path: join(home, ...LOCAL_STATE_SEGMENTS, ...LOCK_FILE_SEGMENTS),
    });
  });

  it("maps a relative state home to the home location", () => {
    const home = sampleGeneratedValue(arbitraryAbsoluteDirectory());
    const stateHome = sampleGeneratedValue(arbitraryRelativeDirectory());

    expect(resolveLockPath({ [LOCK_ENV.STATE_HOME]: stateHome, [LOCK_ENV.HOME]: home })).toEqual({
      ok: true,
      path: join(home, ...LOCAL_STATE_SEGMENTS, ...LOCK_FILE_SEGMENTS),
    });
  });
});
