import { documentationSyncCommand } from "@/commands/release/documentation-sync";
import { readReleaseProductContext, type ReleaseEndpointReader } from "@/commands/release/product-context";
import { releaseNotesCommand } from "@/commands/release/release-notes";
import type { ReleaseNotesFilesystem } from "@/commands/release/release-notes-filesystem";
import type { ReleaseProductContext } from "@/domains/release/product-context";
import type { ReleaseData } from "@/domains/release/release-data";
import { GIT_ROOT_COMMAND } from "@/lib/git/root";
import {
  RELEASE_ENDPOINT_OWNERSHIP_CASE,
  type ReleaseEndpointFile,
  type ReleaseEndpointSource,
  type ReleaseEndpointSourceScenario,
} from "@testing/generators/release/product-context";
import { GIT_TEST_SUBCOMMANDS } from "@testing/harnesses/git-test-constants";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";

const IN_MEMORY_PRODUCT_DIRECTORY = "/release-product";
const RELEASE_ENDPOINT_COMMIT_MESSAGE = "release endpoint";

/** The release command whose pre-agent failure the unresolved-path case observes. */
export const RELEASE_ENDPOINT_COMMAND = {
  DOCUMENTATION_SYNC: "documentation-sync",
  RELEASE_NOTES: "release-notes",
} as const;

export type ReleaseEndpointCommand = (typeof RELEASE_ENDPOINT_COMMAND)[keyof typeof RELEASE_ENDPOINT_COMMAND];

export interface ReleaseEndpointSourceObservation {
  readonly context: ReleaseProductContext;
  readonly error: unknown;
  readonly producerInvocations: number;
  readonly auditorInvocations: number;
}

export async function observeReleaseEndpointSources(
  scenario: ReleaseEndpointSourceScenario,
  command: ReleaseEndpointCommand = RELEASE_ENDPOINT_COMMAND.DOCUMENTATION_SYNC,
): Promise<ReleaseEndpointSourceObservation> {
  const endpointReader = createInMemoryReleaseEndpointReader(scenario.endpoints);
  const readProductContext = async (productDir: string, releaseData: ReleaseEndpointSourceScenario["releaseData"]) =>
    await readReleaseProductContext(productDir, releaseData, { endpointReader });
  let context: ReleaseProductContext = [];
  let error: unknown;
  let producerInvocations = 0;
  let auditorInvocations = 0;
  const countProducer = async () => {
    producerInvocations += 1;
  };
  const countAuditor = async () => {
    auditorInvocations += 1;
  };
  try {
    if (scenario.kind !== RELEASE_ENDPOINT_OWNERSHIP_CASE.UNRESOLVED) {
      context = await readProductContext(IN_MEMORY_PRODUCT_DIRECTORY, scenario.releaseData);
    } else if (command === RELEASE_ENDPOINT_COMMAND.RELEASE_NOTES) {
      await releaseNotesCommand({
        productDir: IN_MEMORY_PRODUCT_DIRECTORY,
        config: {},
        releaseData: scenario.releaseData,
        readProductContext,
        agentRunner: { run: countProducer },
        faithfulnessAuditor: countAuditor,
        filesystem: unreachableReleaseNotesFilesystem(),
      });
    } else {
      await documentationSyncCommand({
        productDir: IN_MEMORY_PRODUCT_DIRECTORY,
        agentRunner: { run: countProducer },
        faithfulnessAuditor: countAuditor,
      }, {
        readProductContext,
        resolveReleaseData: async () => scenario.releaseData,
        resolveDocumentationConfig: async () => ({}),
        stageDocumentation: async () => ({
          workingDirectory: IN_MEMORY_PRODUCT_DIRECTORY,
          documents: [],
          cleanup: async () => undefined,
        }),
        readDocument: async () => {
          throw new Error("Unresolved endpoint property must not read staged documentation");
        },
        promoteDocumentation: async () => undefined,
      });
    }
  } catch (caught) {
    error = caught;
  }
  return { context, error, producerInvocations, auditorInvocations };
}

/**
 * One release endpoint committed to a git repository, the release data whose product context it
 * supplies, and the uncommitted content the working tree carries once the endpoint is committed.
 */
export interface ReleaseEndpointContextInput {
  readonly endpoints: readonly ReleaseEndpointSource[];
  readonly releaseData: ReleaseData;
  readonly workingTreeFiles: readonly ReleaseEndpointFile[];
}

/**
 * Commits the release endpoint to a temporary git repository, writes the working-tree content
 * without committing it, and reads the release product context at the committed endpoint through
 * the production assembly and its default git endpoint reader. The context is an observation; the
 * linked test decides what it means.
 */
export async function readReleaseEndpointContext(
  scenario: ReleaseEndpointContextInput,
): Promise<ReleaseProductContext> {
  const endpoint = singleReleaseEndpoint(scenario);
  const observations: ReleaseProductContext[] = [];
  await withGitWorktreeEnv(async (env) => {
    for (const file of endpoint.files) await env.writeTracked(file.path, file.content);
    await env.commit(RELEASE_ENDPOINT_COMMIT_MESSAGE);
    const releaseRef = await env.runGit([GIT_TEST_SUBCOMMANDS.REV_PARSE, GIT_ROOT_COMMAND.HEAD]);
    for (const file of scenario.workingTreeFiles) await env.writeUntracked(file.path, file.content);
    observations.push(await readReleaseProductContext(env.productDir, { ...scenario.releaseData, releaseRef }));
  });
  const context = observations.at(0);
  if (context === undefined) throw new Error("Release endpoint context read produced no observation");
  return context;
}

/** The one endpoint a committed-context read materializes: the release ref, with no previous tag. */
function singleReleaseEndpoint(scenario: ReleaseEndpointContextInput): ReleaseEndpointSource {
  const endpoint = scenario.endpoints.at(0);
  if (
    endpoint === undefined || scenario.endpoints.length > 1 || scenario.releaseData.previousTag !== null
    || endpoint.ref !== scenario.releaseData.releaseRef
  ) {
    throw new Error("A committed release endpoint context reads exactly the release ref with no previous tag");
  }
  return endpoint;
}

/** A filesystem boundary the unresolved-path case must fail before reaching. */
function unreachableReleaseNotesFilesystem(): ReleaseNotesFilesystem {
  const unreachable = (): never => {
    throw new Error("Unresolved endpoint property must not reach the release-notes filesystem");
  };
  return {
    readArtifact: unreachable,
    createArtifactStage: unreachable,
    promoteArtifact: unreachable,
    canonicalizePath: unreachable,
    isSymbolicLink: unreachable,
    isFile: unreachable,
  };
}

function createInMemoryReleaseEndpointReader(
  endpointSources: readonly ReleaseEndpointSource[],
): ReleaseEndpointReader {
  const sourcesByRef = new Map(endpointSources.map((source) => [source.ref, source]));
  return {
    listPaths: async (_productDir, ref) => endpointSource(sourcesByRef, ref).files.map(({ path }) => path),
    readText: async (_productDir, ref, path) =>
      endpointSource(sourcesByRef, ref).files.find((file) => file.path === path)?.content ?? null,
  };
}

function endpointSource(
  sourcesByRef: ReadonlyMap<string, ReleaseEndpointSource>,
  ref: string,
): ReleaseEndpointSource {
  const source = sourcesByRef.get(ref);
  if (source === undefined) throw new Error(`Release endpoint source is absent for ${ref}`);
  return source;
}
