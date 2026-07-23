import {
  CONFIG_FILE_FORMAT,
  CONFIG_FILE_READ_KIND,
  configFileForFormat,
  type ConfigFileFormat,
  resolveConfig,
  resolveConfigFromReadResult,
  serializeConfigFileSections,
} from "@/config/index";
import { METHODOLOGY_SECTION, type MethodologyConfig, methodologyConfigDescriptor } from "@/config/methodology";
import { resolveMethodologyConfig } from "@/config/methodology-placement";
import { productionRegistry } from "@/config/registry";
import type { Config, Result } from "@/config/types";
import { harnessEnvironmentConfigDescriptor } from "@/domains/agent-environment/config";
import {
  generatedHarnessMethodologyConfig,
  generatedHarnessMethodologyWithUnknownFieldsConfig,
  generatedInvalidMethodologyConfigs,
  generatedMethodologySection,
  generatedSimilarHarnessMethodologyFieldConfig,
} from "@testing/generators/config/descriptors";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

export interface MethodologyResolutionObservation {
  readonly methodology: Record<string, unknown>;
  readonly result: Result<Config>;
}

export interface MethodologyFormatObservation {
  readonly format: ConfigFileFormat;
  readonly parsed: Result<Config> | undefined;
  readonly serialized: Result<string>;
}

export interface MethodologyFormatsObservation {
  readonly expected: Result<MethodologyConfig>;
  readonly formats: readonly MethodologyFormatObservation[];
  readonly methodology: Record<string, unknown>;
}

export interface InvalidMethodologyObservation {
  readonly field: string;
  readonly result: Result<Config>;
}

export async function observeMethodologyDefaultsResolveFromProductionRegistry(): Promise<Result<Config>> {
  return withTestEnv({}, ({ productDir }) => resolveConfig(productDir, productionRegistry));
}

export async function observeExplicitMethodologyConfigResolves(): Promise<MethodologyResolutionObservation> {
  const methodology = generatedMethodologySection();
  const result = await withTestEnv(
    { [METHODOLOGY_SECTION]: methodology },
    ({ productDir }) => resolveConfig(productDir, [methodologyConfigDescriptor]),
  );
  return { methodology, result };
}

export function observeMethodologyConfigFormatsResolveEquivalently(): MethodologyFormatsObservation {
  const methodology = generatedMethodologySection();
  const config = { [METHODOLOGY_SECTION]: methodology };
  const expected = methodologyConfigDescriptor.validate(methodology);
  const formats = Object.values(CONFIG_FILE_FORMAT).map((format): MethodologyFormatObservation => {
    const serialized = serializeConfigFileSections(format, config);
    if (!serialized.ok) return { format, parsed: undefined, serialized };
    const parsed = resolveConfigFromReadResult({
      kind: CONFIG_FILE_READ_KIND.OK,
      file: configFileForFormat("", format, serialized.value),
    }, [methodologyConfigDescriptor]);
    return { format, parsed, serialized };
  });
  return { expected, formats, methodology };
}

export async function observeMalformedMethodologyConfigRejections(): Promise<readonly InvalidMethodologyObservation[]> {
  const observations: InvalidMethodologyObservation[] = [];
  for (const scenario of generatedInvalidMethodologyConfigs()) {
    const result = await withTestEnv(
      scenario.config,
      ({ productDir }) => resolveConfig(productDir, [methodologyConfigDescriptor]),
    );
    observations.push({ field: scenario.field, result });
  }
  return observations;
}

export async function observeHarnessEnvironmentMethodologyRejection(): Promise<Result<Config>> {
  return withTestEnv(
    generatedHarnessMethodologyConfig(),
    ({ productDir }) => resolveConfig(productDir, [harnessEnvironmentConfigDescriptor]),
  );
}

export async function observeMethodologyResolverHarnessUnknownFieldRejection(): Promise<Result<MethodologyConfig>> {
  return withTestEnv(
    generatedHarnessMethodologyWithUnknownFieldsConfig(),
    ({ productDir }) => resolveMethodologyConfig(productDir),
  );
}

export async function observeMethodologyResolverSimilarHarnessField(): Promise<Result<MethodologyConfig>> {
  return withTestEnv(
    generatedSimilarHarnessMethodologyFieldConfig(),
    ({ productDir }) => resolveMethodologyConfig(productDir),
  );
}
