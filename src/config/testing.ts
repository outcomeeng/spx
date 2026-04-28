import * as fc from "fast-check";

import type { ConfigDescriptor, Result } from "@/config/types";
import { KIND_REGISTRY, SPEC_TREE_SECTION, type SpecTreeKindCategory } from "@/spec/config";

export const CONFIG_TEST_FIELDS = {
  TOKEN: "token",
  MODE: "mode",
} as const;

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
    readonly suffix: string;
  };
};

export type GeneratedResolutionScope = {
  readonly projectDirectory: string;
  readonly nestedDirectory: string;
};

export const CONFIG_TEST_GENERATOR = {
  key: arbitraryConfigKey,
  scalar: arbitraryConfigScalar,
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
  return fc.stringMatching(/[a-z][a-z0-9]{5,16}/).filter((key) => key !== SPEC_TREE_SECTION);
}

function arbitraryConfigScalar(): fc.Arbitrary<string> {
  return fc.uuid();
}

function arbitraryProjectRoot(): fc.Arbitrary<string> {
  return fc.uuid().map((id) => `/${id}`);
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
        suffix: `.${kind}`,
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
