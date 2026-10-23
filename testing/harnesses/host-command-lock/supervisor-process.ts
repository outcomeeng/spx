/**
 * Entry point of the supervisor process the host-command-lock evidence starts, signals, and kills.
 *
 * It runs the production library over the dilated clock and a quiet load source, writes the
 * terminal result as the final standard-error line when the run produces one, and exits with the
 * run's exit code. An optional kill ordinal makes the process SIGKILL itself at the holder-record
 * write with that ordinal, through the library's injected filesystem.
 */
import { createHostCommandLock, defaultFilesystem, LOCK_ENV, type RunRequest } from "@/lib/host-command-lock";
import { dilatedDeps } from "@testing/harnesses/host-command-lock/host-command-lock";

const REQUEST_ARGUMENT_INDEX = 2;
const KILL_ORDINAL_ARGUMENT_INDEX = 3;
const NO_KILL = 0;

const request = JSON.parse(process.argv[REQUEST_ARGUMENT_INDEX]) as RunRequest;
const killOrdinal = Number(process.argv[KILL_ORDINAL_ARGUMENT_INDEX] ?? NO_KILL);
const lockPath = process.env[LOCK_ENV.PATH_OVERRIDE] as string;

let recordWrites = 0;
const filesystem = {
  ...defaultFilesystem,
  writeHolderRecord: (...args: Parameters<typeof defaultFilesystem.writeHolderRecord>) => {
    recordWrites += 1;
    if (recordWrites === killOrdinal) process.kill(process.pid, "SIGKILL");
    return defaultFilesystem.writeHolderRecord(...args);
  },
};

const lock = createHostCommandLock({ ...dilatedDeps(lockPath), filesystem });
const { exitCode, result } = await lock.run(request);
if (result !== undefined) process.stderr.write(`${JSON.stringify(result)}\n`);
process.exit(exitCode);
