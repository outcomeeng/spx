import {
  DEFAULT_DOCUMENTATION_SYNC_COMMAND_DEPENDENCIES,
  documentationSyncCommand,
} from "@/commands/release/documentation-sync";
import { readReleaseProductContext } from "@/commands/release/product-context";
import type { ReleaseProductContext } from "@/domains/release/product-context";
import { GIT_ROOT_COMMAND } from "@/lib/git/root";
import {
  RELEASE_ENDPOINT_OWNERSHIP_CASE,
  RELEASE_OWNERSHIP_COMMIT_SUBJECT,
  RELEASE_OWNERSHIP_FIXTURE_CONTENT,
  type ReleaseEndpointRepositoryScenario,
  releaseOwnershipNodeSpec,
  releaseOwnershipSourceContent,
  releaseOwnershipSourceImport,
  sampleReleaseOwnershipFixture,
} from "@testing/generators/release/product-context";
import { GIT_TEST_SUBCOMMANDS } from "@testing/harnesses/git-test-constants";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";

export interface ReleaseEndpointRepositoryObservation {
  readonly context: ReleaseProductContext;
  readonly error: unknown;
  readonly producerInvocations: number;
  readonly auditorInvocations: number;
}

export async function observeReleaseEndpointRepository(
  scenario: ReleaseEndpointRepositoryScenario,
): Promise<ReleaseEndpointRepositoryObservation> {
  let observation: ReleaseEndpointRepositoryObservation | undefined;
  await withGitWorktreeEnv(async (env) => {
    const fixture = sampleReleaseOwnershipFixture();
    await env.writeTracked(fixture.productPath, RELEASE_OWNERSHIP_FIXTURE_CONTENT.PRODUCT);
    await env.writeTracked(fixture.tsconfigPath, RELEASE_OWNERSHIP_FIXTURE_CONTENT.TYPESCRIPT_CONFIG);
    await materializeEndpointHistory(env, scenario);
    const releaseRef = await env.runGit([GIT_TEST_SUBCOMMANDS.REV_PARSE, GIT_ROOT_COMMAND.HEAD]);
    const previousTag = scenario.kind === RELEASE_ENDPOINT_OWNERSHIP_CASE.MULTIPLE_CANDIDATES
      ? null
      : scenario.tag;
    const releaseData = {
      ...scenario.releaseData,
      releaseRef,
      previousTag,
      changedPaths: [fixture.sourcePath],
    };
    let context: ReleaseProductContext = [];
    let error: unknown;
    let producerInvocations = 0;
    let auditorInvocations = 0;
    try {
      if (scenario.kind === RELEASE_ENDPOINT_OWNERSHIP_CASE.UNRESOLVED) {
        await documentationSyncCommand({
          productDir: env.productDir,
          agentRunner: {
            run: async () => {
              producerInvocations += 1;
            },
          },
          faithfulnessAuditor: async () => {
            auditorInvocations += 1;
          },
        }, {
          ...DEFAULT_DOCUMENTATION_SYNC_COMMAND_DEPENDENCIES,
          resolveReleaseData: async () => releaseData,
          resolveDocumentationConfig: async () => ({}),
        });
      } else {
        context = await readReleaseProductContext(env.productDir, releaseData);
      }
    } catch (caught) {
      error = caught;
    }
    observation = { context, error, producerInvocations, auditorInvocations };
  });
  if (observation === undefined) throw new Error("Release endpoint repository produced no observation");
  return observation;
}

type GitWorktreeEnvironment = Parameters<Parameters<typeof withGitWorktreeEnv>[0]>[0];

async function materializeEndpointHistory(
  env: GitWorktreeEnvironment,
  scenario: ReleaseEndpointRepositoryScenario,
): Promise<void> {
  switch (scenario.kind) {
    case RELEASE_ENDPOINT_OWNERSHIP_CASE.CROSS_ENDPOINT:
      await materializeCrossEndpointHistory(env, scenario);
      return;
    case RELEASE_ENDPOINT_OWNERSHIP_CASE.MULTIPLE_CANDIDATES:
      await materializeMultipleCandidateHistory(env, scenario);
      return;
    case RELEASE_ENDPOINT_OWNERSHIP_CASE.DELETED:
      await materializeDeletedPathHistory(env, scenario);
      return;
    case RELEASE_ENDPOINT_OWNERSHIP_CASE.UNRESOLVED:
      await materializeUnresolvedPathHistory(env, scenario);
  }
}

async function materializeCrossEndpointHistory(
  env: GitWorktreeEnvironment,
  scenario: ReleaseEndpointRepositoryScenario,
): Promise<void> {
  const fixture = sampleReleaseOwnershipFixture();
  const earlier = nodePaths(scenario.earlierNodeSlug, 20);
  const later = nodePaths(scenario.laterNodeSlug, 30);
  await writeOwnedSource(env, earlier, fixture.sourcePath, 1);
  await env.commit(RELEASE_OWNERSHIP_COMMIT_SUBJECT.EARLIER);
  await env.runGit([GIT_TEST_SUBCOMMANDS.TAG, scenario.tag]);
  await env.runGit(["rm", earlier.specificationPath, earlier.testPath]);
  await writeOwnedSource(env, later, fixture.sourcePath, 2);
  await env.commit("later ownership");
}

async function materializeMultipleCandidateHistory(
  env: GitWorktreeEnvironment,
  scenario: ReleaseEndpointRepositoryScenario,
): Promise<void> {
  const fixture = sampleReleaseOwnershipFixture();
  const parent = nodePaths(scenario.parentNodeSlug, 20);
  const child = nestedNodePaths(parent.nodeId, scenario.childNodeSlug, 20);
  const peer = nestedNodePaths(parent.nodeId, scenario.peerNodeSlug, 30);
  await env.writeTracked(
    parent.specificationPath,
    releaseOwnershipNodeSpec(scenario.parentNodeSlug),
  );
  await writeOwnedSource(env, child, fixture.sourcePath, 1);
  await writeOwnedSource(env, peer, fixture.sourcePath, 1);
  await env.commit("multiple ownership");
}

async function materializeDeletedPathHistory(
  env: GitWorktreeEnvironment,
  scenario: ReleaseEndpointRepositoryScenario,
): Promise<void> {
  const fixture = sampleReleaseOwnershipFixture();
  const earlier = nodePaths(scenario.earlierNodeSlug, 20);
  await writeOwnedSource(env, earlier, fixture.sourcePath, 1);
  await env.commit(RELEASE_OWNERSHIP_COMMIT_SUBJECT.OWNED_SOURCE);
  await env.runGit([GIT_TEST_SUBCOMMANDS.TAG, scenario.tag]);
  await env.runGit(["rm", fixture.sourcePath, earlier.testPath]);
  await env.commit("deleted source");
}

async function materializeUnresolvedPathHistory(
  env: GitWorktreeEnvironment,
  scenario: ReleaseEndpointRepositoryScenario,
): Promise<void> {
  const fixture = sampleReleaseOwnershipFixture();
  await env.writeTracked(
    fixture.unlinkedTestPath,
    releaseOwnershipSourceImport(fixture.unlinkedTestPath),
  );
  await env.writeTracked(fixture.sourcePath, releaseOwnershipSourceContent(1));
  await env.commit("unresolved source");
  await env.runGit([GIT_TEST_SUBCOMMANDS.TAG, scenario.tag]);
  await env.writeTracked(fixture.sourcePath, releaseOwnershipSourceContent(2));
  await env.commit("still unresolved source");
}

interface OwnershipNodePaths {
  readonly nodeId: string;
  readonly specificationPath: string;
  readonly testPath: string;
}

function nodePaths(slug: string, index: number): OwnershipNodePaths {
  return nestedNodePaths("spx", slug, index);
}

function nestedNodePaths(parentId: string, slug: string, index: number): OwnershipNodePaths {
  const nodeId = `${parentId}/${index}-${slug}.enabler`;
  return {
    nodeId,
    specificationPath: `${nodeId}/${slug}.md`,
    testPath: `${nodeId}/tests/${slug}.scenario.l1.test.ts`,
  };
}

async function writeOwnedSource(
  env: GitWorktreeEnvironment,
  node: OwnershipNodePaths,
  sourcePath: string,
  sourceValue: number,
): Promise<void> {
  const slug = node.specificationPath.slice(node.specificationPath.lastIndexOf("/") + 1, -3);
  await env.writeTracked(
    node.specificationPath,
    releaseOwnershipNodeSpec(slug, `tests/${slug}.scenario.l1.test.ts`),
  );
  await env.writeTracked(node.testPath, releaseOwnershipSourceImport(node.testPath));
  await env.writeTracked(sourcePath, releaseOwnershipSourceContent(sourceValue));
}
