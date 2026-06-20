import type { Config, SpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";

import type { IgnoreSourceReaderConfig } from "@/lib/file-inclusion/ignore-source";
import {
  FILE_INCLUSION_IGNORE_SOURCE_GENERATOR,
  sampleFileInclusionIgnoreSourceValue,
} from "@testing/generators/file-inclusion/ignore-source";

export {
  arbNestedNodeSegment,
  arbNodeSegment,
  arbSubpath,
  PROPERTY_NUM_RUNS,
} from "@testing/harnesses/spec-tree/generators";

export function integrationConfig(): Config {
  return sampleFileInclusionIgnoreSourceValue(FILE_INCLUSION_IGNORE_SOURCE_GENERATOR.integrationConfig());
}

export function readerConfig(): IgnoreSourceReaderConfig {
  return sampleFileInclusionIgnoreSourceValue(FILE_INCLUSION_IGNORE_SOURCE_GENERATOR.readerConfig());
}

export function commentHeader(): string {
  return sampleFileInclusionIgnoreSourceValue(FILE_INCLUSION_IGNORE_SOURCE_GENERATOR.commentHeader());
}

export function commentIndented(): string {
  return sampleFileInclusionIgnoreSourceValue(FILE_INCLUSION_IGNORE_SOURCE_GENERATOR.commentIndented());
}

export function commentMiddle(): string {
  return sampleFileInclusionIgnoreSourceValue(FILE_INCLUSION_IGNORE_SOURCE_GENERATOR.commentMiddle());
}

export function invalidExcludeEntries(): readonly string[] {
  return sampleFileInclusionIgnoreSourceValue(FILE_INCLUSION_IGNORE_SOURCE_GENERATOR.invalidEntries());
}

export function arbitrarySegmentMax(): number {
  return sampleFileInclusionIgnoreSourceValue(FILE_INCLUSION_IGNORE_SOURCE_GENERATOR.propertyLimits()).SEGMENT_MAX;
}

export function arbitraryQueryMax(): number {
  return sampleFileInclusionIgnoreSourceValue(FILE_INCLUSION_IGNORE_SOURCE_GENERATOR.propertyLimits()).QUERY_MAX;
}

export function spxPath(segment: string, ...rest: string[]): string {
  const rootSegment = sampleFileInclusionIgnoreSourceValue(FILE_INCLUSION_IGNORE_SOURCE_GENERATOR.rootSegment());
  return [rootSegment, segment, ...rest].join("/");
}

export function excludeContents(lines: readonly string[]): string {
  return lines.join("\n");
}

export async function writeExclude(env: SpecTreeEnv, lines: readonly string[]): Promise<void> {
  await env.writeRaw(
    sampleFileInclusionIgnoreSourceValue(FILE_INCLUSION_IGNORE_SOURCE_GENERATOR.excludeFilename()),
    excludeContents(lines),
  );
}

export async function writeExcludeRaw(env: SpecTreeEnv, contents: string): Promise<void> {
  await env.writeRaw(
    sampleFileInclusionIgnoreSourceValue(FILE_INCLUSION_IGNORE_SOURCE_GENERATOR.excludeFilename()),
    contents,
  );
}
