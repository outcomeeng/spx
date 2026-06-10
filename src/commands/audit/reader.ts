import { readFile } from "node:fs/promises";

import { type AuditVerdict, parseAuditVerdictXml } from "@/domains/audit/reader";

export async function readVerdictFile(filePath: string): Promise<AuditVerdict> {
  let xml: string;
  try {
    xml = await readFile(filePath, "utf-8");
  } catch (cause) {
    throw new Error(`Failed to read verdict file: ${filePath}`, { cause });
  }

  return parseAuditVerdictXml(xml, filePath);
}
