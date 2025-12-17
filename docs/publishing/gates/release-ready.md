# Gate: Release readiness (Marketplace)

Date: 2025-12-17

This gate is the final checklist before publishing the first public Marketplace release.

## Prerequisite gates

- [x] Automation ready: `docs/publishing/gates/automation-ready.md`
- [x] Package ready: `docs/publishing/gates/package-ready.md`
- [x] UX + accessibility evaluated: `docs/publishing/gates/ux-a11y-ready.md`
- [ ] Credentials ready: `docs/publishing/gates/credentials-ready.md`

## Release decision

- Status: **not ready to publish** (credentials gate not satisfied).
- Once credentials are configured, publish by pushing `v0.1.0` (must match `package.json#version`).

