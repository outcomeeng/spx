import * as fc from "fast-check";

export const PROPERTY_NUM_RUNS = 16;

// Character pools — defined once, derived sets built from them
const LOWER = [..."abcdefghijklmnopqrstuvwxyz"];
const DIGITS = [..."0123456789"];
const ALPHANUM = [...LOWER, ...DIGITS];
const NODE_NAME = [...LOWER, ...DIGITS, "-"];
const SUBPATH_NAME = [...LOWER, ...DIGITS, "_", "-"];

// Single-character arbitraries
const arbLower = fc.constantFrom(...LOWER);
const arbAlphanum = fc.constantFrom(...ALPHANUM);
const arbNodeNameChar = fc.constantFrom(...NODE_NAME);
const arbSubpathChar = fc.constantFrom(...SUBPATH_NAME);

// Benevolent segment: looks like a real spec-tree node directory name.
// Structure: [a-z][a-z0-9-]{0,10}[a-z0-9](.enabler|.outcome)
export const arbNodeSegmentBenevolent: fc.Arbitrary<string> = fc
  .tuple(
    arbLower,
    fc.string({ unit: arbNodeNameChar, minLength: 0, maxLength: 10 }),
    arbAlphanum,
    fc.constantFrom(".enabler", ".outcome"),
  )
  .map(([first, middle, last, suffix]) => `${first}${middle}${last}${suffix}`);

// Adversarial segment: any flat string the EXCLUDE parser accepts.
// Must be: non-empty after trimming, no leading #, /, ./, no .., no /, \n, \r, \0 anywhere.
export const arbNodeSegmentAdversarial: fc.Arbitrary<string> = fc
  .string({ unit: "grapheme", minLength: 1, maxLength: 40 })
  .map((s) => s.trim())
  .filter(
    (s) =>
      s.length > 0
      && s !== "."
      && !s.startsWith("#")
      && !s.startsWith("/")
      && !s.includes("/")
      && !s.includes("..")
      && !s.startsWith("./")
      && !s.includes("\n")
      && !s.includes("\r")
      && !s.includes("\0"),
  );

// Combined: both benevolent and adversarial modes
export const arbNodeSegment: fc.Arbitrary<string> = fc.oneof(
  arbNodeSegmentBenevolent,
  arbNodeSegmentAdversarial,
);

// Nested segment: parent/child (both benevolent — nested parsing is already tested in scenarios)
export const arbNestedNodeSegment: fc.Arbitrary<string> = fc
  .tuple(arbNodeSegmentBenevolent, arbNodeSegmentBenevolent)
  .map(([parent, child]) => `${parent}/${child}`);

// Benevolent subpath: realistic relative file paths within a node directory
const arbSubpathBenevolent: fc.Arbitrary<string> = fc
  .array(fc.string({ unit: arbSubpathChar, minLength: 1, maxLength: 10 }), {
    minLength: 1,
    maxLength: 3,
  })
  .chain((parts) => fc.constantFrom(".ts", ".js", ".md").map((ext) => parts.join("/") + ext));

// Adversarial subpath: unicode, emoji, spaces — anything legal in a filesystem component.
// No traversal (..) so the generated path is genuinely under its parent segment.
const arbSubpathAdversarial: fc.Arbitrary<string> = fc
  .array(
    fc
      .string({ unit: "grapheme", minLength: 1, maxLength: 20 })
      .filter((s) => s !== "." && s !== ".." && !s.includes("/") && !s.includes("\0")),
    { minLength: 1, maxLength: 4 },
  )
  .map((parts) => parts.join("/"));

// Combined: both benevolent and adversarial modes
export const arbSubpath: fc.Arbitrary<string> = fc.oneof(arbSubpathBenevolent, arbSubpathAdversarial);
