import type { Result } from "@/config/types";

import { type DeliveryBackendKind, type DeliveryEnvironment, resolveDeliveryBackend } from "./backend-selection";

/**
 * One delivery: a rendered body addressed by a marker within a result scope. The
 * body and marker are opaque — spx names no result kind and reads neither.
 */
export interface DeliveryRequest {
  /** The result scope the surface belongs to; a safe scope token. */
  readonly scope: string;
  /** Addresses one upsertable surface within the scope; opaque to spx. */
  readonly marker: string;
  /** The rendered body, delivered to the backend unchanged. */
  readonly body: string;
}

/** The injected backend port every delivery routes through. */
export interface DeliveryBackend {
  /** Deliver one request, creating the surface or updating it in place per marker. */
  deliver(request: DeliveryRequest): Promise<Result<void>>;
}

/**
 * Resolves the injected backend implementation for a resolved kind, or
 * `undefined` when that backend has no implementation in this environment.
 */
export type DeliveryBackendResolver = (kind: DeliveryBackendKind) => DeliveryBackend | undefined;

export const DELIVERY_ERROR = {
  BACKEND_UNAVAILABLE: "delivery backend has no injected implementation",
} as const;

/**
 * Resolve the backend from the environment and route the request through the
 * backend's injected implementation, adding only the addressing the backend
 * needs. The body is handed to the backend unchanged.
 */
export async function deliverResult(
  request: DeliveryRequest,
  env: DeliveryEnvironment,
  resolveBackend: DeliveryBackendResolver,
): Promise<Result<void>> {
  const kind = resolveDeliveryBackend(env);
  if (!kind.ok) return kind;
  const backend = resolveBackend(kind.value);
  if (backend === undefined) {
    return { ok: false, error: `${DELIVERY_ERROR.BACKEND_UNAVAILABLE}: ${kind.value}` };
  }
  return backend.deliver(request);
}
