# Read Recorder

PROVIDES a Vitest worker-side recorder that observes the files its worker reads while a test module runs and leaves their absolute paths in the module's metadata
SO THAT the reporter of `spx/41-test.enabler/21-typescript-test.enabler/32-journal-reporter.enabler`, which sees no file a test opens at run time,
CAN append a test module's scope carrying every file the module opened, without reading any file itself

## Assertions

### Scenarios

- Given a real Vitest module that reads one data file at run time with the recorder registered in its worker, when the module finishes, then the absolute path of that data file appears in the module's metadata ([test](tests/read-recorder.scenario.l2.test.ts))

### Compliance

- ALWAYS: the recorder's only effect is the module's metadata — it writes no file, journal event, or output and alters no value a test reads ([test](tests/read-recorder.compliance.l2.test.ts))
