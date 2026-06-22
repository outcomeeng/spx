import type { Result } from "@/config/types";

/**
 * The registered delivery backends. `local` persists a marker-addressed surface
 * to a `.spx/` file; `github-pr` upserts a pull-request comment. Each non-local
 * backend's construction is decided in its own ADR; this module decides only
 * which kind the environment binds.
 */
export const DELIVERY_BACKEND = {
  LOCAL: "local",
  GITHUB_PR: "github-pr",
} as const;

export type DeliveryBackendKind = (typeof DELIVERY_BACKEND)[keyof typeof DELIVERY_BACKEND];

export const DELIVERY_BACKEND_ORDER: readonly DeliveryBackendKind[] = [
  DELIVERY_BACKEND.LOCAL,
  DELIVERY_BACKEND.GITHUB_PR,
];

export const DELIVERY_BACKEND_ERROR = {
  UNKNOWN_BACKEND: "unknown delivery backend",
} as const;

/**
 * A pure snapshot of the parts of the environment that decide which delivery
 * backend binds. The edge reads the process environment into this shape; the
 * library never reads the environment itself.
 */
export interface DeliveryEnvironment {
  /** The explicit backend selector, when set. */
  readonly backendOverride?: string;
  /** Whether the delivery runs under continuous integration. */
  readonly continuousIntegration: boolean;
  /** Whether the continuous-integration run targets a GitHub pull request. */
  readonly githubPullRequest: boolean;
}

/** Whether `value` names a registered delivery backend. */
export function isDeliveryBackendKind(value: string): value is DeliveryBackendKind {
  return (DELIVERY_BACKEND_ORDER as readonly string[]).includes(value);
}

/**
 * Resolve the bound delivery backend from an environment snapshot. An explicit
 * `backendOverride` wins when it names a registered backend and is rejected
 * otherwise; absent an override, a continuous-integration GitHub pull request
 * binds `github-pr` and every other environment binds `local`.
 */
export function resolveDeliveryBackend(env: DeliveryEnvironment): Result<DeliveryBackendKind> {
  if (env.backendOverride !== undefined) {
    if (!isDeliveryBackendKind(env.backendOverride)) {
      return {
        ok: false,
        error: `${DELIVERY_BACKEND_ERROR.UNKNOWN_BACKEND}: ${env.backendOverride} (registered: ${
          DELIVERY_BACKEND_ORDER.join(", ")
        })`,
      };
    }
    return { ok: true, value: env.backendOverride };
  }
  if (env.continuousIntegration && env.githubPullRequest) {
    return { ok: true, value: DELIVERY_BACKEND.GITHUB_PR };
  }
  return { ok: true, value: DELIVERY_BACKEND.LOCAL };
}
