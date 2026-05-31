import { runVerifyPipeline } from "@/domains/audit/verify";

export async function runVerifyCommand(
  filePath: string,
  productDir: string,
  writeLine: (line: string) => void,
): Promise<0 | 1> {
  const result = await runVerifyPipeline(filePath, productDir);
  if (result.exitCode === 0) {
    writeLine(result.verdict ?? "");
  } else {
    for (const line of result.lines) {
      writeLine(line);
    }
  }
  return result.exitCode;
}
