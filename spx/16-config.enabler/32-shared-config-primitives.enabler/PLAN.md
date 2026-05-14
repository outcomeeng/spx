# Plan: Shared Config Primitives

## Purpose

Create the shared structural primitives consumed by config descriptors, starting with path include/exclude filters.

## Governing Specs

- `spx/16-config.enabler/config.md`
- `spx/16-config.enabler/21-descriptor-registration.adr.md`
- `spx/17-file-inclusion.enabler/11-ignore-defaults.pdr.md`

## Implementation Notes

- Add the path-filter primitive under `src/config/` or the established config primitive module.
- Model the primitive as structure only: optional `include` and `exclude` arrays of path patterns.
- Export validator, type, defaults helper if needed, and test-data generator if the testing skill determines one is required.
- Reuse the primitive from validation first without changing existing validation behavior.

## Evidence Required

- Unit or scenario tests cover valid filters, invalid non-array values, invalid path entries, omitted fields, and empty filters.
- Registry-extension evidence proves two descriptors import the same primitive while exposing different policy sections.
- `spx validation all` passes.

## Parallelization

This node should land before descriptor nodes that import the primitive.
