export type PrecommitEntrypoint = {
  readonly sourceSuffix: string;
  readonly argvFragment: string;
};

export const PRECOMMIT_ENTRYPOINT = {
  RUN: {
    sourceSuffix: "/run.ts",
    argvFragment: "precommit/run",
  },
  MAIN_CHECKOUT_GATE: {
    sourceSuffix: "/main-checkout-gate.ts",
    argvFragment: "precommit/main-checkout-gate",
  },
  DEPS_INSTALL_GATE: {
    sourceSuffix: "/deps-install-gate.ts",
    argvFragment: "precommit/deps-install-gate",
  },
  INSTALL_HOOKS: {
    sourceSuffix: "/install-hooks.ts",
    argvFragment: "precommit/install-hooks",
  },
  SONARQUBE_CLOUD_EXCLUSIONS: {
    sourceSuffix: "/check-fixture-exclusions.ts",
    argvFragment: "sonarqube-cloud/check-fixture-exclusions",
  },
} as const satisfies Record<string, PrecommitEntrypoint>;

export function isDirectPrecommitEntrypoint(
  importMetaUrl: string,
  argvPath: string | undefined,
  entrypoint: PrecommitEntrypoint,
): boolean {
  if (argvPath === undefined) return false;
  const normalizedArgvPath = argvPath.replaceAll("\\", "/");
  return importMetaUrl.endsWith(entrypoint.sourceSuffix)
    && (
      normalizedArgvPath.endsWith(`/${entrypoint.argvFragment}.ts`)
      || normalizedArgvPath.endsWith(`/${entrypoint.argvFragment}.js`)
    );
}
