import * as fc from "fast-check";

import type { ConfigFileReadResult } from "@/config/index";
import type { ConfigDescriptor, Result } from "@/config/types";
import {
  KIND_REGISTRY,
  SPEC_TREE_CONFIG_FIELDS,
  SPEC_TREE_SECTION,
  type SpecTreeKindCategory,
} from "@/lib/spec-tree/config";

export const CONFIG_TEST_FIELDS = {
  TOKEN: "token",
  MODE: "mode",
} as const;

const ENVIRONMENT_SENTINEL_PREFIX = "SPX_TEST_SENTINEL_";

type GeneratedTokenSection = {
  readonly [CONFIG_TEST_FIELDS.TOKEN]: string;
};

type GeneratedModeSection = {
  readonly [CONFIG_TEST_FIELDS.MODE]: string;
};

type GeneratedDescriptorOptions = {
  readonly minLength: number;
  readonly maxLength: number;
};

export type GeneratedEnvironmentSentinel = {
  readonly key: string;
  readonly value: string;
};

export type GeneratedInvalidSpecTreeConfig = {
  readonly config: Record<string, unknown>;
  readonly error: string;
  readonly offendingKind: string;
};

export type GeneratedTokenDescriptor = {
  readonly section: string;
  readonly defaults: GeneratedTokenSection;
  readonly descriptor: ConfigDescriptor<GeneratedTokenSection>;
};

export type GeneratedModeDescriptor = {
  readonly section: string;
  readonly defaults: GeneratedModeSection;
  readonly override: GeneratedModeSection;
  readonly invalid: GeneratedModeSection;
  readonly descriptor: ConfigDescriptor<GeneratedModeSection>;
};

export type GeneratedKindOverride = {
  readonly kind: string;
  readonly definition: {
    readonly category: SpecTreeKindCategory;
    readonly label: string;
    readonly suffix: string;
    readonly aliases: readonly string[];
  };
};

export type GeneratedResolutionScope = {
  readonly projectDirectory: string;
  readonly nestedDirectory: string;
};

export const CONFIG_TEST_GENERATOR = {
  absentConfigFileReadResult: arbitraryAbsentConfigFileReadResult,
  emptyConfig: arbitraryEmptyConfig,
  environmentSentinel: arbitraryEnvironmentSentinel,
  invalidSpecTreeConfig: arbitraryInvalidSpecTreeConfig,
  key: arbitraryConfigKey,
  resultValueKey: arbitraryResultValueKey,
  scalar: arbitraryConfigScalar,
  specTreeKindField: arbitrarySpecTreeKindField,
  specTreeUnknownKindError: arbitrarySpecTreeUnknownKindError,
  specTreeDefaultsConfig: arbitrarySpecTreeDefaultsConfig,
  specTreeSubsetConfig: arbitrarySpecTreeSubsetConfig,
  tempPrefix: arbitraryTempPrefix,
  tokenDescriptorPair: arbitraryTokenDescriptorPair,
  tokenDescriptor: arbitraryTokenDescriptor,
  tokenDescriptors: arbitraryTokenDescriptors,
  modeDescriptor: arbitraryModeDescriptor,
  kindOverride: arbitraryKindOverride,
  projectRoot: arbitraryProjectRoot,
  resolutionScope: arbitraryResolutionScope,
} as const;

export function sampleConfigTestValue<T>(arbitrary: fc.Arbitrary<T>): T {
  const [value] = fc.sample(arbitrary, { numRuns: 1 });
  if (value === undefined) {
    throw new Error("Config test generator returned no sample");
  }
  return value;
}

function arbitraryConfigKey(): fc.Arbitrary<string> {
  return fc.stringMatching(/^[a-z][a-z0-9]{5,16}$/).filter((key) => key !== SPEC_TREE_SECTION);
}

function arbitraryConfigScalar(): fc.Arbitrary<string> {
  return fc.uuid();
}

function arbitraryEmptyConfig(): fc.Arbitrary<Record<string, unknown>> {
  return fc.constant({});
}

function arbitraryResultValueKey(): fc.Arbitrary<string> {
  return fc.constant("value");
}

function arbitraryProjectRoot(): fc.Arbitrary<string> {
  return fc.uuid().map((id) => `/${id}`);
}

function arbitraryTempPrefix(): fc.Arbitrary<string> {
  return arbitraryConfigKey().map((key) => `${key}-`);
}

function arbitraryEnvironmentSentinel(): fc.Arbitrary<GeneratedEnvironmentSentinel> {
  return fc
    .record({
      key: arbitraryConfigKey(),
      value: arbitraryConfigScalar(),
    })
    .map(({ key, value }) => ({ key: `${ENVIRONMENT_SENTINEL_PREFIX}${key.toUpperCase()}`, value }));
}

function arbitraryAbsentConfigFileReadResult(): fc.Arbitrary<Result<ConfigFileReadResult>> {
  return fc.constant({ ok: true, value: { kind: "absent" } });
}

function arbitrarySpecTreeDefaultsConfig(): fc.Arbitrary<Record<string, unknown>> {
  return fc.constant({ [SPEC_TREE_SECTION]: { [SPEC_TREE_CONFIG_FIELDS.KINDS]: { ...KIND_REGISTRY } } });
}

function arbitrarySpecTreeSubsetConfig(): fc.Arbitrary<Record<string, unknown>> {
  return fc
    .uniqueArray(fc.constantFrom(...Object.keys(KIND_REGISTRY)), {
      minLength: 1,
      maxLength: Object.keys(KIND_REGISTRY).length,
    })
    .map((kinds) => ({
      [SPEC_TREE_SECTION]: {
        [SPEC_TREE_CONFIG_FIELDS.KINDS]: Object.fromEntries(
          kinds.map((kind) => [kind, KIND_REGISTRY[kind as keyof typeof KIND_REGISTRY]]),
        ),
      },
    }));
}

function arbitraryInvalidSpecTreeConfig(): fc.Arbitrary<GeneratedInvalidSpecTreeConfig> {
  return arbitraryConfigKey()
    .filter((kind) => !Object.prototype.hasOwnProperty.call(KIND_REGISTRY, kind))
    .map((offendingKind) => ({
      offendingKind,
      error: `${SPEC_TREE_SECTION}.${SPEC_TREE_CONFIG_FIELDS.KINDS} contains unknown kind "${offendingKind}"`,
      config: {
        [SPEC_TREE_SECTION]: {
          [SPEC_TREE_CONFIG_FIELDS.KINDS]: {
            [offendingKind]: {
              category: KIND_REGISTRY.enabler.category,
              suffix: `.${offendingKind}`,
            },
          },
        },
      },
    }));
}

function arbitrarySpecTreeKindField(): fc.Arbitrary<string> {
  return fc.constant(SPEC_TREE_CONFIG_FIELDS.KINDS);
}

function arbitrarySpecTreeUnknownKindError(): fc.Arbitrary<string> {
  return arbitraryConfigKey()
    .filter((kind) => !Object.prototype.hasOwnProperty.call(KIND_REGISTRY, kind))
    .map((kind) => `${SPEC_TREE_SECTION}.${SPEC_TREE_CONFIG_FIELDS.KINDS} contains unknown kind "${kind}"`);
}

function arbitraryTokenDescriptor(): fc.Arbitrary<GeneratedTokenDescriptor> {
  return fc
    .record({
      section: arbitraryConfigKey(),
      tokenDefault: arbitraryConfigScalar(),
    })
    .map(({ section, tokenDefault }) => buildTokenDescriptor(section, tokenDefault));
}

function arbitraryTokenDescriptors(options: GeneratedDescriptorOptions): fc.Arbitrary<GeneratedTokenDescriptor[]> {
  return fc
    .tuple(
      fc.uniqueArray(arbitraryConfigKey(), {
        minLength: options.minLength,
        maxLength: options.maxLength,
      }),
      fc.array(arbitraryConfigScalar(), {
        minLength: options.minLength,
        maxLength: options.maxLength,
      }),
    )
    .map(([sections, tokenDefaults]) =>
      sections.map((section, index) => buildTokenDescriptor(section, tokenDefaults[index % tokenDefaults.length]))
    );
}

function arbitraryTokenDescriptorPair(): fc.Arbitrary<readonly [GeneratedTokenDescriptor, GeneratedTokenDescriptor]> {
  return arbitraryTokenDescriptors({ minLength: 2, maxLength: 2 }).map((descriptors) => {
    const [first, second] = descriptors;
    if (first === undefined || second === undefined) {
      throw new Error("Token descriptor pair generator returned an incomplete descriptor set");
    }
    return [first, second] as const;
  });
}

function arbitraryModeDescriptor(): fc.Arbitrary<GeneratedModeDescriptor> {
  return fc
    .record({
      section: arbitraryConfigKey(),
      modes: fc.uniqueArray(arbitraryConfigScalar(), {
        minLength: 3,
        maxLength: 3,
      }),
    })
    .map(({ section, modes }) => {
      const [defaultMode, overrideMode, invalidMode] = modes;
      if (defaultMode === undefined || overrideMode === undefined || invalidMode === undefined) {
        throw new Error("Mode descriptor generator returned an incomplete mode set");
      }

      return buildModeDescriptor(section, defaultMode, overrideMode, invalidMode);
    });
}

function arbitraryKindOverride(category: SpecTreeKindCategory): fc.Arbitrary<GeneratedKindOverride> {
  return arbitraryConfigKey()
    .filter((kind) => !Object.prototype.hasOwnProperty.call(KIND_REGISTRY, kind))
    .map((kind) => ({
      kind,
      definition: {
        category,
        label: kind,
        suffix: `.${kind}`,
        aliases: [],
      },
    }));
}

function arbitraryResolutionScope(): fc.Arbitrary<GeneratedResolutionScope> {
  return fc
    .record({
      projectDirectory: arbitraryConfigKey(),
      nestedDirectory: arbitraryConfigKey(),
    })
    .map(({ projectDirectory, nestedDirectory }) => ({
      projectDirectory,
      nestedDirectory,
    }));
}

function buildTokenDescriptor(section: string, tokenDefault: string): GeneratedTokenDescriptor {
  const defaults = { [CONFIG_TEST_FIELDS.TOKEN]: tokenDefault };
  return {
    section,
    defaults,
    descriptor: {
      section,
      defaults,
      validate(value: unknown): Result<GeneratedTokenSection> {
        if (typeof value !== "object" || value === null) {
          return { ok: false, error: `${section} must be an object` };
        }
        const candidate = value as { readonly [CONFIG_TEST_FIELDS.TOKEN]?: unknown };
        const token = candidate[CONFIG_TEST_FIELDS.TOKEN];
        if (typeof token !== "string") {
          return {
            ok: false,
            error: `${section}.${CONFIG_TEST_FIELDS.TOKEN} must be a string`,
          };
        }
        return {
          ok: true,
          value: { [CONFIG_TEST_FIELDS.TOKEN]: token },
        };
      },
    },
  };
}

function buildModeDescriptor(
  section: string,
  defaultMode: string,
  overrideMode: string,
  invalidMode: string,
): GeneratedModeDescriptor {
  const defaults = { [CONFIG_TEST_FIELDS.MODE]: defaultMode };
  const override = { [CONFIG_TEST_FIELDS.MODE]: overrideMode };
  const invalid = { [CONFIG_TEST_FIELDS.MODE]: invalidMode };
  const allowedModes = new Set([defaultMode, overrideMode]);

  return {
    section,
    defaults,
    override,
    invalid,
    descriptor: {
      section,
      defaults,
      validate(value: unknown): Result<GeneratedModeSection> {
        if (typeof value !== "object" || value === null) {
          return { ok: false, error: `${section} section must be an object` };
        }
        const candidate = value as { readonly [CONFIG_TEST_FIELDS.MODE]?: unknown };
        const mode = candidate[CONFIG_TEST_FIELDS.MODE];
        if (typeof mode !== "string" || !allowedModes.has(mode)) {
          return {
            ok: false,
            error: `${section}.${CONFIG_TEST_FIELDS.MODE} must match a generated descriptor mode`,
          };
        }
        return {
          ok: true,
          value: { [CONFIG_TEST_FIELDS.MODE]: mode },
        };
      },
    },
  };
}
