# Agent Note: Will desktop distribution — a downstream loopback shell with owned data and transactional updates

Status: implemented

English | [中文](2026-08-16-will-desktop-distribution.zh.md)

## Problem

The Will distribution needs double-click Windows and macOS applications around the official DeepSeek Harness Web profile. Users must not install Node.js, closing the window must not kill an active task, and desktop-only preferences must not mutate upstream profile files. The Windows distribution also needs a portable-data mode, and both platforms need an independent update lane for the official `@deepseek-ai/dsh` package.

The upstream [GUI layering and RPC protocol note](2026-07-19-gui-layering-and-rpc-protocol.md) reserves a future direct Electron IPC carrier. That provider is not implemented yet. Building a private substitute in the derivative would duplicate the protocol boundary and make upstream synchronization expensive.

## Decision

`apps/will-desktop` is a downstream application shell, not a new core package. Its repository and release artifacts retain the DeepSeek Harness Will project name, while the installed application, operating-system surfaces, and desktop shell use the bilingual display name `Deepseek Harness Will — 组装未来`. It starts the bundled `@deepseek-ai/dsh web` entry in a child process bound to an ephemeral `127.0.0.1` port and loads that exact origin in a context-isolated Electron window. The preload adds only distribution surfaces: platform-native chrome, themes, balance, `soul.md`, plugin operations, a persistent native terminal, updates, paths, preferences, and notifications. Native mode removes every Will CSS token so the official appearance remains the default.

Renderer IPC is accepted only when the sender origin equals the current Harness origin. The renderer has no Node integration. Secrets stay in the main process; the balance channel returns only sanitized currency rows. Plugins retain the upstream trust model and require a visible arbitrary-code warning before install.

The shell selects one data root before Electron readiness. Installed mode explicitly keeps the existing `DeepSeek Harness Will` directory below Electron's per-user `appData` root instead of deriving it from the new display name; portable mode keeps `DeepSeek-Harness-Will-Data` beside the executable. Beneath that root, Will owns its preferences, persona source and patch, runtime shims, and agent overlays. dsh receives a separate `DSH_HOME` under the same root. Will never overwrites dsh's profile patch.

The bundled agent runs under Electron with `ELECTRON_RUN_AS_NODE=1`. Release builds additionally carry a checksum-verified standalone Node/npm distribution for the target architecture. Agent updates install `@deepseek-ai/dsh@latest` into staging, verify `dsh --version`, rotate `current` and `previous`, and restart; a failed restart restores the previous overlay. Windows client updates use metadata from the configured GitHub Release provider but neither download nor install without explicit user confirmation. macOS client updates are manual because the project has no Apple signing and notarization identity. The release pipeline emits unsigned Windows executables plus Apple Silicon and Intel DMGs.

The native terminal is owned by the main process rather than the Web page. It selects PowerShell on Windows and the login shell on macOS, runs in the application project directory, survives renderer reload and close-to-tray, broadcasts output over IPC, and keeps a bounded replay buffer for reconnection.

## Alternatives considered

- Implement the reserved in-process Electron IPC carrier locally. Rejected because it would fork the protocol and client-composition seams before upstream defines the provider.
- Patch the official Web UI directly. Rejected because every upstream UI change would create a merge conflict and native mode could no longer be proven unmodified.
- Update the workspace installation in place. Rejected because a partial npm install could leave the desktop application unable to start and provides no deterministic rollback.
- Store portable preferences inside the application archive. Rejected because packaged resources are immutable and would mix user state with release files.
- Let the renderer own the terminal. Rejected because renderer reload would terminate or orphan the process and would expand renderer privileges.

## Consequences

- The derivative has a narrow upstream-diff surface concentrated in `apps/will-desktop`.
- Users see `Deepseek Harness Will — 组装未来` as the application name on both platforms, while stable repository, artifact, application-id, and data-directory identifiers avoid broken links and lost existing state.
- Current desktop traffic still traverses a loopback socket. Direct IPC remains a future migration governed by the upstream GUI layering note; this note does not supersede it.
- Windows portable mode is genuinely movable, but users must keep the executable and its sibling data directory together. macOS uses the installed application data directory.
- Apple Silicon and Intel use separate native DMGs and bundled Node runtimes. macOS users must replace the app from a newer DMG until signed automatic updates are available.
- Agent overlay rollback is bounded to one previous version. The bundled version remains the final fallback when no overlay exists.
- Plugin installation and agent updates require network access and execute trusted package code.
- Per-file mutation restore and automated Codex/Claude migration are not provided by this decision; they require explicit host APIs rather than renderer-side filesystem shortcuts.
- Public distribution documentation is fully bilingual and uses source-derived SVG diagrams for capabilities, control-center structure, palettes, platforms, and trust boundaries. Diagram captions must distinguish structural illustrations from runtime screenshots, and the implemented/planned matrix must remain aligned with the desktop contracts.
