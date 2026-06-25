import type { CliCommandResult } from "@/config/types";
import { EPIPE_CODE } from "@/lib/process-lifecycle";

export const CLI_STREAM_REPORT = {
  LINE_SEPARATOR: "\n",
} as const;

export async function reportCliResult(result: CliCommandResult): Promise<void> {
  const stream = result.exitCode === 0 ? process.stdout : process.stderr;
  const completed = await writeStreamOutput(stream, `${result.output}${CLI_STREAM_REPORT.LINE_SEPARATOR}`);
  if (completed) process.exit(result.exitCode);
}

export function writeStreamOutput(stream: NodeJS.WriteStream, output: string): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    stream.write(output, (error?: Error | null) => {
      if (error === undefined || error === null) {
        resolve(true);
        return;
      }
      if ((error as NodeJS.ErrnoException).code === EPIPE_CODE) {
        resolve(false);
        return;
      }
      reject(error);
    });
  });
}
