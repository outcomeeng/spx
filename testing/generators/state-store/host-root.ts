import * as fc from "fast-check";

const PATH_SEGMENT_CHARACTERS = [..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-"] as const;
const HOME_VARIABLE = "HOME";

export type HostEnvironmentValues = Readonly<Record<string, string | undefined>>;

export interface HostRootScenario {
  readonly accountHome: string;
  readonly environment: HostEnvironmentValues;
  readonly xdgStateHome: string | undefined;
}

function pathSegment(): fc.Arbitrary<string> {
  return fc.array(fc.constantFrom(...PATH_SEGMENT_CHARACTERS), { minLength: 1, maxLength: 12 }).map((chars) =>
    chars.join("")
  );
}

function absolutePath(): fc.Arbitrary<string> {
  return fc.array(pathSegment(), { minLength: 1, maxLength: 4 }).map((segments) => `/${segments.join("/")}`);
}

function relativePath(): fc.Arbitrary<string> {
  return fc.array(pathSegment(), { minLength: 1, maxLength: 4 }).map((segments) => segments.join("/"));
}

function scenario(
  stateHome: fc.Arbitrary<string | undefined>,
  xdgVariable: string,
): fc.Arbitrary<HostRootScenario> {
  return fc.tuple(absolutePath(), fc.option(absolutePath(), { nil: undefined }), stateHome).map((
    [accountHome, home, xdgStateHome],
  ) => ({
    accountHome,
    environment: { [HOME_VARIABLE]: home, [xdgVariable]: xdgStateHome },
    xdgStateHome,
  }));
}

export function arbitraryHostRootScenario(xdgVariable: string): fc.Arbitrary<HostRootScenario> {
  return scenario(
    fc.oneof(absolutePath(), relativePath(), fc.constant(""), fc.constant(undefined)),
    xdgVariable,
  );
}

export function arbitraryAbsoluteStateHomeScenario(xdgVariable: string): fc.Arbitrary<HostRootScenario> {
  return scenario(absolutePath(), xdgVariable);
}

export function arbitraryUnusableStateHomeScenario(xdgVariable: string): fc.Arbitrary<HostRootScenario> {
  return scenario(fc.oneof(relativePath(), fc.constant(""), fc.constant(undefined)), xdgVariable);
}
