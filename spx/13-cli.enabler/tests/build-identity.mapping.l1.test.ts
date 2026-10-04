import { describe, expect, it } from "vitest";

import { readBuildIdentity } from "@/lib/build-identity";
import { defaultGitDependencies } from "@/lib/git/root";
import {
  buildStates,
  describeBuildState,
  expectedBuildIdentity,
  sampleBuildVersions,
} from "@testing/generators/cli/build-identity";
import { withBuildCheckout } from "@testing/harnesses/cli/build-identity";

describe("Mapping: each build state maps to its stamped build identity", () => {
  it.each(buildStates().map((state) => [describeBuildState(state), state] as const))(
    "%s",
    async (_title, state) => {
      const versions = sampleBuildVersions();
      await withBuildCheckout(state, versions, async (checkout) => {
        const identity = await readBuildIdentity(versions.packageVersion, checkout.dir, defaultGitDependencies);

        expect(checkout.headCommit === null).toBe(!state.insideCheckout);
        expect(identity).toBe(expectedBuildIdentity(versions.packageVersion, state, checkout.headCommit));
      });
    },
  );
});
