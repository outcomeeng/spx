/**
 * Composed session output markers.
 *
 * The plain-string marker formatter lives in `domains/session/types`, which stays free of path
 * aliases because a lint rule imports its registry through jiti. This module holds the composed
 * form, so a descriptor writing a marker to the terminal states which part of it is the product's
 * own tag and which part is a value read from argv or the filesystem.
 *
 * @module domains/session/output-marker
 */

import { authoredText, externalValue, terminal, type TerminalText } from "@/lib/terminal-text/terminal-text";

import type { SessionOutputMarker } from "./types";

/**
 * Composes a marker for terminal-destined text. The marker name is product-owned vocabulary, while
 * the value is a session id or a resolved path, so only the value carries the escaping decision.
 */
export function composeSessionOutputMarker(marker: SessionOutputMarker, value: string): TerminalText {
  return terminal`<${authoredText(marker)}>${externalValue(value)}</${authoredText(marker)}>`;
}
