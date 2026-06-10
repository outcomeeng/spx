import { existsSync } from "node:fs";

import { readVerdictFile } from "@/commands/audit/reader";
import type { AuditVerdict } from "@/domains/audit/reader";
import { runVerifyPipeline } from "@/domains/audit/verify";
import type { VerifyOutput } from "@/domains/audit/verify";

export async function runVerifyFilePipeline(
  filePath: string,
  productDir: string,
): Promise<VerifyOutput> {
  let verdict: AuditVerdict;
  try {
    verdict = await readVerdictFile(filePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { lines: [`reader: ${message}`], exitCode: 1 };
  }

  return runVerifyPipeline(verdict, productDir, { fileExists: existsSync });
}

export async function runVerifyCommand(
  filePath: string,
  productDir: string,
  writeLine: (line: string) => void,
): Promise<0 | 1> {
  const result = await runVerifyFilePipeline(filePath, productDir);
  if (result.exitCode === 0) {
    writeLine(result.verdict ?? "");
  } else {
    for (const line of result.lines) {
      writeLine(line);
    }
  }
  return result.exitCode;
}
