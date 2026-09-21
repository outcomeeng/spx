import { documentationSyncCommand } from "@/commands/release/documentation-sync";
import { readReleaseProductContext, type ReleaseEndpointReader } from "@/commands/release/product-context";
import { releaseNotesCommand } from "@/commands/release/release-notes";
import type { ReleaseNotesFilesystem } from "@/commands/release/release-notes-filesystem";
import type { ReleaseProductContext } from "@/domains/release/product-context";
import {
  RELEASE_ENDPOINT_OWNERSHIP_CASE,
  type ReleaseEndpointSource,
  type ReleaseEndpointSourceScenario,
} from "@testing/generators/release/product-context";

const IN_MEMORY_PRODUCT_DIRECTORY = "/release-product";

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
