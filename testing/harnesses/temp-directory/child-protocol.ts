/**
 * The contract between the temp-directory child-process harness and the child entry script it runs:
 * the modes the child accepts and the observation report the child writes to stdout.
 *
 * @module testing/harnesses/temp-directory/child-protocol
 */

export const TEMP_DIRECTORY_CHILD_MODE = {
  /** Request one directory, write a file inside it, report, and end normally. */
  CREATE: "create",
  /** As `CREATE`, then run Git in the directory with and without the exported ceiling and report both. */
  GIT_PROBE: "git-probe",
} as const;

export type TempDirectoryChildMode = (typeof TEMP_DIRECTORY_CHILD_MODE)[keyof typeof TEMP_DIRECTORY_CHILD_MODE];

/** The exit code and stdout of one Git invocation. */
export interface GitProbeObservation {
  readonly exitCode: number;
  readonly stdout: string;
}

/** What the child observed about its own run, written as one JSON document on stdout. */
export interface TempDirectoryChildReport {
  /** The run root the child's environment named after its request. */
  readonly root?: string;
  /** The directory the child's request returned. */
  readonly directory: string;
  readonly rootExistedWhileRunning: boolean;
  /** Whether the file the child wrote inside the directory existed before the child ended. */
  readonly contentExistedWhileRunning: boolean;
  /** Git run in the directory under the environment the primitive exported. */
  readonly gitUnderExportedEnvironment?: GitProbeObservation;
  /** Git run in the same directory with the exported ceiling removed from the environment. */
  readonly gitWithoutCeiling?: GitProbeObservation;
}
