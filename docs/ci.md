# Coverage and CI commands

- Coverage command: `npm run ci:coverage` (c8 wraps `npm run test:unit`, emits `coverage/lcov.info` and text summary).
- Workflow: `.github/workflows/test.yml` runs coverage on ubuntu after the main test matrix and uploads `coverage/lcov.info` as an artifact; optional Codecov upload if `CODECOV_TOKEN` is set.
- Local parity: run `npm run lint`, `npm run test:unit`, `npm run test:bd-cli`, `npm run test:integration`, and `npm run ci:coverage` for reports.
