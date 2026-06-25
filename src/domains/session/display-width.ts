/**
 * Terminal display-width helpers for session text rendering.
 *
 * @module session/display-width
 */

interface CodePointRange {
  readonly start: number;
  readonly end: number;
}

const CONTROL_CODE_MAX = 0x1F;
const DELETE_CODE = 0x7F;
const C1_CONTROL_MIN = 0x80;
const C1_CONTROL_MAX = 0x9F;
const ZERO_WIDTH_JOINER = 0x200D;

const ZERO_WIDTH_RANGES: readonly CodePointRange[] = [
  { start: 0x0300, end: 0x036F },
  { start: 0x1AB0, end: 0x1AFF },
  { start: 0x1DC0, end: 0x1DFF },
  { start: 0x20D0, end: 0x20FF },
  { start: 0xFE00, end: 0xFE0F },
  { start: 0xFE20, end: 0xFE2F },
  { start: 0xE0100, end: 0xE01EF },
];

const WIDE_RANGES: readonly CodePointRange[] = [
  { start: 0x1100, end: 0x115F },
  { start: 0x231A, end: 0x231B },
  { start: 0x2329, end: 0x232A },
  { start: 0x23E9, end: 0x23EC },
  { start: 0x23F0, end: 0x23F0 },
  { start: 0x23F3, end: 0x23F3 },
  { start: 0x25FD, end: 0x25FE },
  { start: 0x2614, end: 0x2615 },
  { start: 0x2648, end: 0x2653 },
  { start: 0x267F, end: 0x267F },
  { start: 0x2693, end: 0x2693 },
  { start: 0x26A1, end: 0x26A1 },
  { start: 0x26AA, end: 0x26AB },
  { start: 0x26BD, end: 0x26BE },
  { start: 0x26C4, end: 0x26C5 },
  { start: 0x26CE, end: 0x26CE },
  { start: 0x26D4, end: 0x26D4 },
  { start: 0x26EA, end: 0x26EA },
  { start: 0x26F2, end: 0x26F3 },
  { start: 0x26F5, end: 0x26F5 },
  { start: 0x26FA, end: 0x26FA },
  { start: 0x26FD, end: 0x26FD },
  { start: 0x2705, end: 0x2705 },
  { start: 0x270A, end: 0x270B },
  { start: 0x2728, end: 0x2728 },
  { start: 0x274C, end: 0x274C },
  { start: 0x274E, end: 0x274E },
  { start: 0x2753, end: 0x2755 },
  { start: 0x2757, end: 0x2757 },
  { start: 0x2795, end: 0x2797 },
  { start: 0x27B0, end: 0x27B0 },
  { start: 0x27BF, end: 0x27BF },
  { start: 0x2B1B, end: 0x2B1C },
  { start: 0x2B50, end: 0x2B50 },
  { start: 0x2B55, end: 0x2B55 },
  { start: 0x2E80, end: 0x303E },
  { start: 0x3040, end: 0xA4CF },
  { start: 0xAC00, end: 0xD7A3 },
  { start: 0xF900, end: 0xFAFF },
  { start: 0xFE10, end: 0xFE19 },
  { start: 0xFE30, end: 0xFE6F },
  { start: 0xFF00, end: 0xFF60 },
  { start: 0xFFE0, end: 0xFFE6 },
  { start: 0x1F004, end: 0x1F004 },
  { start: 0x1F0CF, end: 0x1F0CF },
  { start: 0x1F18E, end: 0x1F18E },
  { start: 0x1F191, end: 0x1F19A },
  { start: 0x1F200, end: 0x1F202 },
  { start: 0x1F210, end: 0x1F23B },
  { start: 0x1F240, end: 0x1F248 },
  { start: 0x1F250, end: 0x1F251 },
  { start: 0x1F300, end: 0x1F64F },
  { start: 0x1F680, end: 0x1F6FF },
  { start: 0x1F900, end: 0x1F9FF },
  { start: 0x20000, end: 0x3FFFD },
];

const ZERO_WIDTH_COLUMNS = 0;
const NARROW_COLUMNS = 1;
const WIDE_COLUMNS = 2;

function isInRange(codePoint: number, range: CodePointRange): boolean {
  return codePoint >= range.start && codePoint <= range.end;
}

function isControlCode(codePoint: number): boolean {
  return codePoint <= CONTROL_CODE_MAX || codePoint === DELETE_CODE
    || (codePoint >= C1_CONTROL_MIN && codePoint <= C1_CONTROL_MAX);
}

function codePointWidth(codePoint: number): number {
  if (isControlCode(codePoint) || codePoint === ZERO_WIDTH_JOINER) {
    return ZERO_WIDTH_COLUMNS;
  }
  if (ZERO_WIDTH_RANGES.some((range) => isInRange(codePoint, range))) {
    return ZERO_WIDTH_COLUMNS;
  }
  if (WIDE_RANGES.some((range) => isInRange(codePoint, range))) {
    return WIDE_COLUMNS;
  }
  return NARROW_COLUMNS;
}

/**
 * Returns the terminal display columns occupied by plain text.
 */
export function visibleWidth(text: string): number {
  let width = ZERO_WIDTH_COLUMNS;
  for (const symbol of Array.from(text)) {
    width += codePointWidth(symbol.codePointAt(0) ?? ZERO_WIDTH_COLUMNS);
  }
  return width;
}

/**
 * Takes the longest prefix whose terminal display width fits `maxColumns`.
 */
export function takeVisibleColumns(text: string, maxColumns: number): string {
  if (maxColumns <= ZERO_WIDTH_COLUMNS) {
    return "";
  }

  let width = ZERO_WIDTH_COLUMNS;
  let result = "";
  for (const symbol of Array.from(text)) {
    const nextWidth = codePointWidth(symbol.codePointAt(0) ?? ZERO_WIDTH_COLUMNS);
    if (width + nextWidth > maxColumns) {
      break;
    }
    result += symbol;
    width += nextWidth;
  }
  return result;
}
