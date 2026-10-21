import { userInfo } from "node:os";
import { isAbsolute, join } from "node:path";

export const XDG_STATE_HOME_VARIABLE = "XDG_STATE_HOME";

export const HOST_STATE_DIRECTORY = "spx";

export const HOST_STATE_ROOT_SEGMENTS = [".local", "state", HOST_STATE_DIRECTORY] as const;

export interface HostRootDependencies {
  /** The home directory the OS account record names, independent of `HOME`. */
  readonly accountHomeDirectory: () => string;
  readonly environment: (name: string) => string | undefined;
}

export const defaultHostRootDependencies: HostRootDependencies = {
  accountHomeDirectory: () => userInfo().homedir,
  environment: (name) => process.env[name],
};

/**
 * The root through which processes of one OS account on one host meet:
 * `<account-home>/.local/state/spx/`, independent of `HOME`, `XDG_STATE_HOME`,
 * the invocation directory, and every repository.
 */
export function resolveHostRendezvousRoot(
  dependencies: HostRootDependencies = defaultHostRootDependencies,
): string {
  return join(dependencies.accountHomeDirectory(), ...HOST_STATE_ROOT_SEGMENTS);
}

/**
 * The root for host-scoped state no other process needs to find: `$XDG_STATE_HOME/spx/`
 * when `XDG_STATE_HOME` holds an absolute path, otherwise the host rendezvous root.
 */
export function resolveHostStateRoot(
  dependencies: HostRootDependencies = defaultHostRootDependencies,
): string {
  const stateHome = dependencies.environment(XDG_STATE_HOME_VARIABLE);
  if (stateHome !== undefined && stateHome !== "" && isAbsolute(stateHome)) {
    return join(stateHome, HOST_STATE_DIRECTORY);
  }
  return resolveHostRendezvousRoot(dependencies);
}
