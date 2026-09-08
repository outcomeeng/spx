import { join } from "node:path";

import type { HostedRelease, PackagePublication } from "@/domains/release/publication";
import { SIGTERM_NAME } from "@/lib/process-lifecycle";
import { createGithubReleasePublisher, GITHUB_RELEASE } from "@/lib/release-publication/github-release-publisher";
import { createNpmPackagePublisher, NPM_PUBLICATION } from "@/lib/release-publication/npm-package-publisher";
import {
  type ReleasePublicationRunner,
  type ReleasePublicationRunOptions,
  type ReleasePublicationRunResult,
  runReleasePublicationCommand,
} from "@/lib/release-publication/runner";
import type { PublicationRetryScenario, PublicationScenario } from "@testing/generators/release/publication";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const RUNNER_TEMP_PREFIX = "spx-publication-runner-";
const ABSENT_EXECUTABLE = "absent-publication-executable";
const NODE_EVAL_FLAG = "-e";
const SELF_SIGNAL_SCRIPT = "process.kill(process.pid, process.argv[1]);";
const EXIT_WITH_CODE_SCRIPT = "process.exit(Number(process.argv[1]));";

/**
 * Runs the production publication runner against an executable path that does not exist,
 * so the subprocess cannot be spawned. The returned promise is the observation.
 */
export function runAbsentPublicationExecutable(): Promise<ReleasePublicationRunResult> {
  return withTempDir(
    RUNNER_TEMP_PREFIX,
    (dir) => runReleasePublicationCommand(join(dir, ABSENT_EXECUTABLE), [], { cwd: dir }),
  );
}

/**
 * Runs the production publication runner on a child that terminates itself with SIGTERM,
 * so the subprocess ends without an exit code. The returned promise is the observation.
 */
export function runSignalTerminatedPublicationCommand(): Promise<ReleasePublicationRunResult> {
  return withTempDir(RUNNER_TEMP_PREFIX, (dir) =>
    runReleasePublicationCommand(
      process.execPath,
      [NODE_EVAL_FLAG, SELF_SIGNAL_SCRIPT, SIGTERM_NAME],
      { cwd: dir },
    ));
}

/** Runs the production publication runner on a child that exits with the given code. */
export function runExitingPublicationCommand(
  exitCode: number,
): Promise<ReleasePublicationRunResult> {
  return withTempDir(RUNNER_TEMP_PREFIX, (dir) =>
    runReleasePublicationCommand(
      process.execPath,
      [NODE_EVAL_FLAG, EXIT_WITH_CODE_SCRIPT, String(exitCode)],
      { cwd: dir },
    ));
}

export interface RecordedReleasePublicationCommand {
  readonly command: string;
  readonly args: readonly string[];
  readonly options: ReleasePublicationRunOptions;
}

export interface NpmPackagePublisherObservation {
  readonly inspected: PackagePublication | null;
  readonly unverified: PackagePublication | null;
  readonly missing: PackagePublication | null;
  readonly inspectRequests: readonly RecordedReleasePublicationCommand[];
  readonly unverifiedRequests: readonly RecordedReleasePublicationCommand[];
  readonly missingRequests: readonly RecordedReleasePublicationCommand[];
  readonly publishRequests: readonly RecordedReleasePublicationCommand[];
}

export interface GithubReleasePublisherObservation {
  readonly exactRequests: readonly RecordedReleasePublicationCommand[];
  readonly missingRequests: readonly RecordedReleasePublicationCommand[];
  readonly staleRequests: readonly RecordedReleasePublicationCommand[];
}

export async function observeNpmPackagePublisher(
  scenario: PublicationScenario,
): Promise<NpmPackagePublisherObservation> {
  const inspectRunner = new RecordingReleasePublicationRunner([
    successfulResult(JSON.stringify(npmMetadata(scenario.packagePublication, true))),
  ]);
  const unverifiedRunner = new RecordingReleasePublicationRunner([
    successfulResult(JSON.stringify(npmMetadata(scenario.packagePublication, false))),
  ]);
  const missingRunner = new RecordingReleasePublicationRunner([
    failedResult(NPM_PUBLICATION.NOT_FOUND),
  ]);
  const publishRunner = new RecordingReleasePublicationRunner([successfulResult()]);

  const inspected = await createNpmPackagePublisher({
    productDir: scenario.productDir,
    run: inspectRunner.run,
  }).inspect(scenario.packagePublication);
  const unverified = await createNpmPackagePublisher({
    productDir: scenario.productDir,
    run: unverifiedRunner.run,
  }).inspect(scenario.packagePublication);
  const missing = await createNpmPackagePublisher({
    productDir: scenario.productDir,
    run: missingRunner.run,
  }).inspect(scenario.packagePublication);
  await createNpmPackagePublisher({
    productDir: scenario.productDir,
    run: publishRunner.run,
  }).publish(scenario.packagePublication);

  return {
    inspected,
    unverified,
    missing,
    inspectRequests: inspectRunner.requests,
    unverifiedRequests: unverifiedRunner.requests,
    missingRequests: missingRunner.requests,
    publishRequests: publishRunner.requests,
  };
}

export async function observeGithubReleasePublisher(
  scenario: PublicationRetryScenario,
): Promise<GithubReleasePublisherObservation> {
  const exactRunner = new RecordingReleasePublicationRunner([
    successfulResult(JSON.stringify(githubMetadata(scenario.expectedHostedRelease))),
  ]);
  const missingRunner = new RecordingReleasePublicationRunner([
    failedResult(GITHUB_RELEASE.NOT_FOUND),
    successfulResult(),
  ]);
  const staleRunner = new RecordingReleasePublicationRunner([
    successfulResult(JSON.stringify(githubMetadata(scenario.existingHostedRelease))),
    successfulResult(),
  ]);

  await createGithubReleasePublisher({
    productDir: scenario.productDir,
    run: exactRunner.run,
  }).reconcile(scenario.expectedHostedRelease);
  await createGithubReleasePublisher({
    productDir: scenario.productDir,
    run: missingRunner.run,
  }).reconcile(scenario.expectedHostedRelease);
  await createGithubReleasePublisher({
    productDir: scenario.productDir,
    run: staleRunner.run,
  }).reconcile(scenario.expectedHostedRelease);

  return {
    exactRequests: exactRunner.requests,
    missingRequests: missingRunner.requests,
    staleRequests: staleRunner.requests,
  };
}

class RecordingReleasePublicationRunner {
  readonly requests: RecordedReleasePublicationCommand[] = [];

  constructor(private readonly results: readonly ReleasePublicationRunResult[]) {}

  readonly run: ReleasePublicationRunner = (command, args, options) => {
    const result = this.results.at(this.requests.length);
    this.requests.push({ command, args, options });
    if (result === undefined) {
      throw new Error("Release publication runner received an unexpected command");
    }
    return Promise.resolve(result);
  };
}

function successfulResult(stdout = ""): ReleasePublicationRunResult {
  return { exitCode: 0, stdout, stderr: "" };
}

function failedResult(stderr: string): ReleasePublicationRunResult {
  return { exitCode: 1, stdout: "", stderr };
}

function npmMetadata(
  publication: PackagePublication,
  verified: boolean,
): Readonly<Record<string, unknown>> {
  return {
    [NPM_PUBLICATION.METADATA.NAME]: publication.name,
    [NPM_PUBLICATION.METADATA.VERSION]: publication.version,
    [NPM_PUBLICATION.METADATA.COMMIT]: publication.commit,
    ...(verified
      ? {
        [NPM_PUBLICATION.METADATA.DIST]: {
          [NPM_PUBLICATION.METADATA.ATTESTATIONS]: {
            [NPM_PUBLICATION.METADATA.PROVENANCE]: {
              [NPM_PUBLICATION.METADATA.PREDICATE_TYPE]: NPM_PUBLICATION.SLSA_PROVENANCE_V1,
            },
          },
        },
      }
      : {}),
  };
}

function githubMetadata(release: HostedRelease): Readonly<Record<string, string>> {
  return {
    [GITHUB_RELEASE.METADATA.TAG]: release.tag,
    [GITHUB_RELEASE.METADATA.TITLE]: release.title,
    [GITHUB_RELEASE.METADATA.TARGET]: release.targetCommit,
    [GITHUB_RELEASE.METADATA.BODY]: release.body,
  };
}
