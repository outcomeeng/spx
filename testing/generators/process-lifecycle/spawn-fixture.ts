import { constants as osConstants } from "node:os";

import * as fc from "fast-check";

const UNKNOWN_SIGNAL_NAME_MAX_LENGTH = 64;
const NODE_SIGNAL_NAMES: ReadonlySet<string> = new Set(Object.keys(osConstants.signals));

export function arbitraryUnknownSignalName(): fc.Arbitrary<string> {
  return fc
    .string({ minLength: 1, maxLength: UNKNOWN_SIGNAL_NAME_MAX_LENGTH })
    .filter((signalName) => !NODE_SIGNAL_NAMES.has(signalName));
}
