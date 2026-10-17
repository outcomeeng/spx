# Read Recorder

PROVIDES a Vitest worker-side recorder that observes the files its worker reads while a test module runs and leaves their absolute paths in the module's metadata
SO THAT the reporter of `spx/41-test.enabler/21-typescript-test.enabler/32-journal-reporter.enabler`, which sees no file a test opens at run time,
CAN append a test module's scope carrying every file the module opened, without reading any file itself

## Assertions

### Scenarios

- Given a real Vitest module that reads one data file at run time with the recorder registered in its worker, when the module finishes, then the absolute path of that data file appears in the module's metadata ([test](tests/read-recorder.scenario.l2.test.ts))
- Given a real Vitest module that reads a data file through a named `node:fs` import binding, when the module finishes, then the absolute path of that data file appears in the module's metadata ([test](tests/read-recorder.scenario.l2.test.ts))

### Properties

- For every sequence of file reads a module performs, including repeated reads and reads after a working-directory change, the module's metadata holds the sorted list of the unique absolute paths read, each resolved against the worker's working directory at the time of its read with symbolic links resolved, with an observed path that does not resolve to an existing file dropped while the read that targeted it fails unchanged, and holds no entry when the module read no file ([test](tests/read-recorder.property.l1.test.ts), [test](tests/read-recorder.scenario.l2.test.ts))

### Compliance

- ALWAYS: the recorder's only effect is the module's metadata — it writes no file, journal event, or output and alters no value a test reads ([test](tests/read-recorder.compliance.l2.test.ts))
- ALWAYS: every wrapped `node:fs` read entry point delegates to the original function with the original arguments and returns its result unchanged, and a read that fails fails with the same error ([test](tests/read-recorder.compliance.l1.test.ts))
- ALWAYS: restoring the recorder returns every wrapped `node:fs` function, and every named binding of the `node:fs` module, to its original value ([test](tests/read-recorder.compliance.l1.test.ts))
- ALWAYS: the recorder lives in a TypeScript test-language module under `src/test/languages/`, and its metadata key and setup-file path are exported from a constants module that holds no worker-side behavior, so the reporter names the recorder without importing its worker code ([audit])
