# Agent Note: Downstream CI isolates upstream-only automation and private applications

Status: implemented

English | [中文](2026-08-17-downstream-ci-isolation.zh.md)

## Problem

The repository retains upstream workflows so synchronization can preserve their validation, but several jobs assume the official `deepseek-harness/deepseek-harness` repository, its GitHub App credentials, and its real-API secret. Running those jobs unchanged in a downstream repository produces failures that cannot validate a pull request. The dsh npm release family also selects every `apps/*` manifest, which incorrectly treats the private Will desktop application as an upstream `@deepseek-ai` package.

## Decision

The Issue lifecycle and Issue policy jobs run only in `deepseek-harness/deepseek-harness`, where their repository configuration and GitHub App exist. A downstream repository runs the real-API E2E job only when its `DSH_ENABLE_REAL_API_E2E` repository variable is `true`; the existing secret preflight still requires `DEEPSEEK_API_KEY_EXTERNAL`, and fork and Dependabot pull requests remain excluded. The required Linux jobs and independent native Windows job select the official repository's custom runners only in that repository; downstream repositories use `ubuntu-latest` and `windows-2025` with bounded worker counts. Keyless static, unit, snapshot, packaging, Windows, and macOS checks therefore remain runnable without organization-owned runner labels.

Release-family discovery treats a manifest with `private: true` as a workspace-only application and excludes it before namespace and shared-version validation. Private applications therefore remain buildable workspace members without entering version bumps, npm tarballs, publish ordering, or tags owned by the dsh family.

## Alternatives considered

- **Delete the inherited workflows.** Rejected because keeping them makes upstream synchronization and comparison explicit, while repository guards express exactly where they are valid.
- **Copy the upstream GitHub App credentials and API key into every downstream repository.** Rejected because downstream maintainers do not control the upstream App or Project, and a real-API key is an optional operational cost rather than a prerequisite for keyless pull-request validation.
- **Require downstream maintainers to reproduce the upstream custom-runner labels.** Rejected because correctness validation must remain runnable on standard GitHub-hosted capacity, while the official repository can retain its faster pools.
- **Rename the Will desktop package into the `@deepseek-ai` namespace.** Rejected because it is private, is released as an Electron application rather than an npm package, and is owned by the downstream project.

## Consequences

- Upstream-only jobs report as skipped in the downstream repository instead of reporting unrelated failures.
- A downstream maintainer can enable real-API E2E deliberately by setting the repository variable and secret; a missing secret still fails visibly after opt-in.
- Downstream pull requests consume more runner time than the official custom pools, but they do not remain queued for unavailable organization-owned labels.
- `private: true` is the release boundary for product assemblies that share the pnpm workspace but do not belong to an npm release family.
- A mistakenly private publishable package is omitted rather than rejected by the publish workflow, so code review must treat the `private` flag as a release decision.
