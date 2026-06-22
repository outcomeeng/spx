import type { Result } from "@/config/types";
import type { DeliveryBackend, DeliveryRequest } from "@/lib/result-delivery";

/**
 * A recording {@link DeliveryBackend} for result-delivery tests: it captures each
 * delivered request in order and reports success, so a test can verify what the
 * delivery routed to its injected backend — the resolved kind, the addressing, and
 * the unchanged body — over the real library code paths rather than a mock.
 */
export class RecordingDeliveryBackend implements DeliveryBackend {
  readonly requests: DeliveryRequest[] = [];

  async deliver(request: DeliveryRequest): Promise<Result<void>> {
    this.requests.push(request);
    return { ok: true, value: undefined };
  }
}
