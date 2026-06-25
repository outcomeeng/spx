import type { CliCommandResult } from "@/config/types";
import type { CliIo } from "@/interfaces/cli/product-context";

export const CLI_STREAM_REPORT = {
  LINE_SEPARATOR: "\n",
} as const;

export function reportCliResult(result: CliCommandResult, io: CliIo): void {
  const output = `${result.output}${CLI_STREAM_REPORT.LINE_SEPARATOR}`;
  if (result.exitCode === 0) io.writeStdout(output);
  else io.writeStderr(output);
  io.setExitCode(result.exitCode);
}
