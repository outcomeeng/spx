import { describe, expect, it } from "vitest";

import { BUILD_IDENTITY_FORMAT, readBuildIdentity } from "@/lib/build-identity";
import { defaultGitDependencies } from "@/lib/git/root";
import {
  BUILD_COMMIT_TAG_RELATION,
  BUILD_WORKING_TREE_STATE,
  buildStates,
  describeBuildState,
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

        if (!state.insideCheckout || checkout.headCommit === null) {
          expect(identity).toBe(
            `${versions.packageVersion}${BUILD_IDENTITY_FORMAT.METADATA_SEPARATOR}${BUILD_IDENTITY_FORMAT.UNKNOWN_METADATA}`,
          );
          return;
        }
        expect(checkout.headCommit).toMatch(/^[0-9a-f]{40}$/);
        const commitMetadata = `${versions.packageVersion}${BUILD_IDENTITY_FORMAT.METADATA_SEPARATOR}${
          checkout.headCommit.slice(0, 9)
        }`;
        if (state.workingTree === BUILD_WORKING_TREE_STATE.MODIFIED) {
          expect(identity).toBe(`${commitMetadata}${BUILD_IDENTITY_FORMAT.DIRTY_SUFFIX}`);
        } else if (state.tagRelation === BUILD_COMMIT_TAG_RELATION.RELEASE_TAG) {
          expect(identity).toBe(versions.packageVersion);
        } else {
          expect(identity).toBe(commitMetadata);
        }
      });
    },
  );
});
