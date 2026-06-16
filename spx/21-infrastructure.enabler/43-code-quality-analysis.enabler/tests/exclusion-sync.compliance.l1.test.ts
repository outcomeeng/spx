import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  createFixtureExclusionEntrypointDeps,
  gitListCachedFixtureFilesArgs,
  gitShowPropertiesIndexArgs,
  runFixtureExclusionCheck,
} from "@/lib/sonarqube-cloud/check-fixture-exclusions";
import {
  checkFixtureExclusions,
  computeFixtureExclusionDrift,
  EXCLUSION_CHECK_EXIT,
  SONAR_EXCLUSIONS_KEY,
} from "@/lib/sonarqube-cloud/exclusions";
import {
  arbitraryFixturePath,
  arbitraryFixturePathSet,
  arbitraryNonFixturePath,
} from "@testing/generators/sonarqube-cloud/exclusions";

describe("computeFixtureExclusionDrift", () => {
  it("reports clean exactly when the exclusion entries equal the tracked fixture files", () => {
    fc.assert(
      fc.property(arbitraryFixturePathSet(), (tracked) => {
        const drift = computeFixtureExclusionDrift({
          trackedFixtureFiles: tracked,
          exclusionEntries: tracked,
        });
        expect(drift.missing).toEqual([]);
        expect(drift.extra).toEqual([]);
      }),
    );
  });

  it("names a tracked fixture file absent from the exclusions as missing, and only it", () => {
    fc.assert(
      fc.property(arbitraryFixturePathSet(), (tracked) => {
        fc.pre(tracked.length >= 2);
        const [dropped, ...kept] = tracked;
        const drift = computeFixtureExclusionDrift({
          trackedFixtureFiles: tracked,
          exclusionEntries: kept,
        });
        expect(drift.missing).toEqual([dropped]);
        expect(drift.extra).toEqual([]);
      }),
    );
  });

  it("names a fixture-scoped exclusion entry with no tracked file as extra", () => {
    fc.assert(
      fc.property(arbitraryFixturePathSet(), arbitraryFixturePath(), (tracked, extra) => {
        fc.pre(!tracked.includes(extra));
        const drift = computeFixtureExclusionDrift({
          trackedFixtureFiles: tracked,
          exclusionEntries: [...tracked, extra],
        });
        expect(drift.extra).toEqual([extra]);
        expect(drift.missing).toEqual([]);
      }),
    );
  });

  it("never reports an exclusion entry outside the fixture root as drift", () => {
    fc.assert(
      fc.property(arbitraryFixturePathSet(), arbitraryNonFixturePath(), (tracked, outside) => {
        const drift = computeFixtureExclusionDrift({
          trackedFixtureFiles: tracked,
          exclusionEntries: [...tracked, outside],
        });
        expect(drift.missing).toEqual([]);
        expect(drift.extra).toEqual([]);
      }),
    );
  });
});

describe("checkFixtureExclusions", () => {
  it("is ok with no drift when the parsed exclusions cover exactly the tracked fixtures", () => {
    fc.assert(
      fc.property(arbitraryFixturePathSet(), (tracked) => {
        const result = checkFixtureExclusions({
          readProperties: () => `${SONAR_EXCLUSIONS_KEY}=${tracked.join(",")}\n`,
          listTrackedFixtureFiles: () => tracked,
        });
        expect(result.ok).toBe(true);
        expect(result.drift.missing).toEqual([]);
        expect(result.drift.extra).toEqual([]);
      }),
    );
  });

  it("is not ok and names the offending paths when the exclusions omit a tracked fixture", () => {
    fc.assert(
      fc.property(arbitraryFixturePathSet(), (tracked) => {
        fc.pre(tracked.length >= 2);
        const [dropped, ...kept] = tracked;
        const result = checkFixtureExclusions({
          readProperties: () => `${SONAR_EXCLUSIONS_KEY}=${kept.join(",")}\n`,
          listTrackedFixtureFiles: () => tracked,
        });
        expect(result.ok).toBe(false);
        expect(result.drift.missing).toEqual([dropped]);
      }),
    );
  });

  it("is not ok and names the extra path when the exclusions list a non-tracked fixture", () => {
    fc.assert(
      fc.property(arbitraryFixturePathSet(), arbitraryFixturePath(), (tracked, extra) => {
        fc.pre(!tracked.includes(extra));
        const result = checkFixtureExclusions({
          readProperties: () => `${SONAR_EXCLUSIONS_KEY}=${[...tracked, extra].join(",")}\n`,
          listTrackedFixtureFiles: () => tracked,
        });
        expect(result.ok).toBe(false);
        expect(result.drift.extra).toEqual([extra]);
      }),
    );
  });
});

describe("createFixtureExclusionEntrypointDeps", () => {
  it("reads the properties file and tracked fixtures from the git index snapshot", () => {
    fc.assert(
      fc.property(arbitraryFixturePath(), (fixturePath) => {
        const propertiesText = `${SONAR_EXCLUSIONS_KEY}=${fixturePath}\n`;
        const gitCalls: string[][] = [];
        const deps = createFixtureExclusionEntrypointDeps({
          execGit: (args) => {
            gitCalls.push([...args]);
            return gitCalls.length === 1 ? propertiesText : `${fixturePath}\0`;
          },
          writeError: () => undefined,
        });
        expect(deps.readProperties()).toBe(propertiesText);
        expect(deps.listTrackedFixtureFiles()).toEqual([fixturePath]);
        expect(gitCalls).toEqual([gitShowPropertiesIndexArgs(), gitListCachedFixtureFilesArgs()]);
      }),
    );
  });
});

describe("runFixtureExclusionCheck", () => {
  it("maps a clean check to the clean exit code and writes no drift report", () => {
    fc.assert(
      fc.property(arbitraryFixturePathSet(), (tracked) => {
        const reports: string[] = [];
        const exitCode = runFixtureExclusionCheck({
          readProperties: () => `${SONAR_EXCLUSIONS_KEY}=${tracked.join(",")}\n`,
          listTrackedFixtureFiles: () => tracked,
          writeError: (message) => reports.push(message),
        });
        expect(exitCode).toBe(EXCLUSION_CHECK_EXIT.CLEAN);
        expect(reports).toEqual([]);
      }),
    );
  });

  it("maps drift to the drift exit code and names missing and extra paths", () => {
    fc.assert(
      fc.property(arbitraryFixturePathSet(), arbitraryFixturePath(), (tracked, extra) => {
        fc.pre(tracked.length >= 2);
        fc.pre(!tracked.includes(extra));
        const [dropped, ...kept] = tracked;
        const reports: string[] = [];
        const exitCode = runFixtureExclusionCheck({
          readProperties: () => `${SONAR_EXCLUSIONS_KEY}=${[...kept, extra].join(",")}\n`,
          listTrackedFixtureFiles: () => tracked,
          writeError: (message) => reports.push(message),
        });
        expect(exitCode).toBe(EXCLUSION_CHECK_EXIT.DRIFT);
        expect(reports).toHaveLength(1);
        expect(reports[0]).toContain(dropped);
        expect(reports[0]).toContain(extra);
      }),
    );
  });
});
