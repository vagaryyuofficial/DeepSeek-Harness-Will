# Agent Note: Will desktop distribution — a downstream loopback shell with owned data and transactional updates

Status: implemented

English | [中文](2026-08-16-will-desktop-distribution.zh.md)

## Problem

The Will distribution needs a double-click Windows application around the official DeepSeek Harness Web profile. Users must not install Node.js, closing the window must not kill an active task, and desktop-only preferences must not mutate upstream profile files. The distribution also needs a portable-data mode and two independent update lanes: the official `@deepseek-ai/dsh` package and the Electron client itself.

The upstream [GUI layering and RPC protocol note](2026-07-19-gui-layering-and-rpc-protocol.md) reserves a future direct Electron IPC carrier. That provider is not implemented yet. Building a private substitute in the derivative would duplicate the protocol boundary and make upstream synchronization expensive.

## Decision

`apps/will-desktop` is a downstream application shell, not a new core package. It starts the bundled `@deepseek-ai/dsh web` entry in a child process bound to an ephemeral `127.0.0.1` port and loads that exact origin in a context-isolated Electron window. The preload adds only distribution surfaces: native chrome, themes, balance, `soul.md`, plugin operations, persistent PowerShell, updates, paths, preferences, and notifications. Native mode removes every Will CSS token so the official appearance remains the default.

Renderer IPC is accepted only when the sender origin equals the current Harness origin. The renderer has no Node integration. Secrets stay in the main process; the balance channel returns only sanitized currency rows. Plugins retain the upstream trust model and require a visible arbitrary-code warning before install.

The shell selects one data root before Electron readiness. Installed mode uses `userData`; portable mode uses `DeepSeek-Harness-Will-Data` beside the executable. Beneath that root, Will owns its preferences, persona source and patch, runtime shims, and agent overlays. dsh receives a separate `DSH_HOME` under the same root. Will never overwrites dsh's profile patch.

The bundled agent runs under Electron with `ELECTRON_RUN_AS_NODE=1`. Release builds additionally carry a checksum-verified standalone Node/npm distribution. Agent updates install `@deepseek-ai/dsh@latest` into staging, verify `dsh --version`, rotate `current` and `previous`, and restart; a failed restart restores the previous overlay. Client updates use signed metadata from the configured GitHub Release provider but neither download nor install without explicit user confirmation. The release pipeline currently emits unsigned executables.

PowerShell is owned by the main process rather than the Web page. It runs in the application project directory, survives renderer reload and close-to-tray, broadcasts output over IPC, and keeps a bounded replay buffer for reconnection.

## Alternatives considered

- Implement the reserved in-process Electron IPC carrier locally. Rejected because it would fork the protocol and client-composition seams before upstream defines the provider.
- Patch the official Web UI directly. Rejected because every upstream UI change would create a merge conflict and native mode could no longer be proven unmodified.
- Update the workspace installation in place. Rejected because a partial npm install could leave the desktop application unable to start and provides no deterministic rollback.
- Store portable preferences inside the application archive. Rejected because packaged resources are immutable and would mix user state with release files.
- Let the renderer own PowerShell. Rejected because renderer reload would terminate or orphan the process and would expand renderer privileges.

## Consequences

- The derivative has a narrow upstream-diff surface concentrated in `apps/will-desktop`.
- Current desktop traffic still traverses a loopback socket. Direct IPC remains a future migration governed by the upstream GUI layering note; this note does not supersede it.
- Portable mode is genuinely movable, but users must keep the executable and its sibling data directory together.
- Agent overlay rollback is bounded to one previous version. The bundled version remains the final fallback when no overlay exists.
- Plugin installation and agent updates require network access and execute trusted package code.
- Per-file mutation restore and automated Codex/Claude migration are not provided by this decision; they require explicit host APIs rather than renderer-side filesystem shortcuts.
