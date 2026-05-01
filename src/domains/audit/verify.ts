import { validatePaths } from "./paths";
import { readVerdictFile } from "./reader";
import { validateSemantics } from "./semantic";
import { validateStructure } from "./structural";

export interface VerifyOutput {
  readonly lines: readonly string[];
  readonly exitCode: 0 | 1;
  readonly verdict?: string;
}

export async function runVerifyPipeline(
  filePath: string,
  projectRoot: string,
): Promise<VerifyOutput> {
  let verdict;
  try {
    verdict = await readVerdictFile(filePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { lines: [`reader: ${message}`], exitCode: 1 };
  }

  const structuralDefects = validateStructure(verdict);
  if (structuralDefects.length > 0) {
    return { lines: structuralDefects.map((d) => `structural: ${d}`), exitCode: 1 };
  }

  const semanticDefects = validateSemantics(verdict);
  if (semanticDefects.length > 0) {
    return { lines: semanticDefects.map((d) => `semantic: ${d}`), exitCode: 1 };
  }

  const pathDefects = validatePaths(verdict, projectRoot);
  if (pathDefects.length > 0) {
    return { lines: pathDefects.map((d) => `paths: ${d}`), exitCode: 1 };
  }

  return { lines: [], exitCode: 0, verdict: verdict.header?.verdict };
}
