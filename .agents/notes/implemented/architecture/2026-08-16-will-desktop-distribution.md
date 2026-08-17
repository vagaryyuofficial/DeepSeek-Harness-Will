# Agent Note: Will desktop distribution — a downstream loopback shell with owned data and verified native releases

Status: implemented

English | [中文](2026-08-16-will-desktop-distribution.zh.md)

## Problem

The Will distribution needs double-click Windows and macOS applications around the official DeepSeek Harness Web profile. Users must not install Node.js, closing the window must not kill an active task, and desktop-only preferences must not mutate upstream profile files. The Windows distribution also needs a portable-data mode, and both platforms need an independent update lane for the official `@deepseek-ai/dsh` package.

The upstream [GUI layering and RPC protocol note](2026-07-19-gui-layering-and-rpc-protocol.md) reserves a future direct Electron IPC carrier. That provider is not implemented yet. Building a private substitute in the derivative would duplicate the protocol boundary and make upstream synchronization expensive.

Source execution inside the monorepo can inherit peer packages through workspace symlinks even when a packaged production dependency graph is incomplete. A package can also contain the expected executable and entry file yet still fail at the first ESM import, Node loader requirement, or Electron readiness transition. Native installers therefore need runtime and full-shell execution checks, while public release tags need operating-system trust chains rather than asking users to bypass platform security.

## Decision

`apps/will-desktop` is a downstream application shell, not a new core package. Its repository and release artifacts retain the DeepSeek Harness Will project name, while the installed application, operating-system surfaces, and desktop shell use the bilingual display name `Deepseek Harness Will — 组装未来`. It starts the bundled `@deepseek-ai/dsh web` entry in a child process bound to an ephemeral `127.0.0.1` port and loads that exact origin in a context-isolated Electron window. The preload adds only distribution surfaces: platform-native chrome, themes, balance, `soul.md`, plugin operations, a persistent native terminal, updates, paths, preferences, and notifications. Native mode removes every Will CSS token so the official appearance remains the default.

The desktop manifest explicitly declares the complete required workspace peer closure as production dependencies. Its build gate walks runtime dependencies and optional dependencies, rejects every required workspace peer absent from the desktop manifest, and exempts peers only when their manifests explicitly mark them optional. electron-builder unpacks production `node_modules` into the real `app.asar.unpacked` file tree, and the host resolves bundled dsh and pnpm entries from that tree instead of depending on archive traversal or monorepo links. Every bundled or overlay dsh launch places the Node option `--expose-internals` before the dsh entry script so the packaged Cordis/HMR loader path can initialize. The ESM main entry calls `void boot().catch(...)`; `boot()` awaits `app.whenReady()` internally, so module evaluation does not remain suspended on a top-level readiness await.

Renderer IPC is accepted only when the sender origin equals the current Harness origin. The renderer has no Node integration. Secrets stay in the main process; the balance channel returns only sanitized currency rows. Plugins retain the upstream trust model and require a visible arbitrary-code warning before install.

The shell selects one data root before Electron readiness. Installed mode explicitly keeps the existing `DeepSeek Harness Will` directory below Electron's per-user `appData` root instead of deriving it from the new display name; portable mode keeps `DeepSeek-Harness-Will-Data` beside the executable. Beneath that root, Will owns its preferences, persona source and patch, runtime shims, and agent overlays. dsh receives a separate `DSH_HOME` under the same root. Will never overwrites dsh's profile patch. Harness commands and the main-process terminal both use the user's home directory as their stable default working directory instead of inheriting a launcher-dependent directory such as `/`. The terminal selects PowerShell on Windows and the login shell on macOS, survives renderer reload and close-to-tray, broadcasts output over IPC, and keeps a bounded replay buffer for reconnection.

The bundled agent runs under Electron with `ELECTRON_RUN_AS_NODE=1`. Release builds additionally carry a checksum-verified standalone Node/npm distribution for the target architecture. Agent updates install `@deepseek-ai/dsh@latest` into staging, verify `dsh --version`, rotate `current` and `previous`, and restart; a failed restart restores the previous overlay. Windows client updates use metadata from the configured GitHub Release provider but neither download nor install without explicit user confirmation. macOS client updates remain a manual DMG replacement flow.

Non-tag Windows CI packages unsigned artifacts, and non-tag macOS CI packages ad-hoc-signed artifacts for reproducible contributor validation. A `will-v*` tag is a trusted publication boundary: Windows packaging requires Authenticode credentials and verifies all three executable surfaces, while macOS packaging requires a Developer ID Application identity, hardened runtime, notarization, Gatekeeper assessment, and stapling validation. The release job cannot publish until both signed platform jobs succeed.

CI executes the packaged dsh entry and checks an actual Harness Web document from the unpacked dependency tree. It also starts the complete Electron shell with isolated state and a bounded readiness probe for `win-unpacked`, the copied Portable wrapper, an NSIS-installed application, and both native macOS architectures; Windows additionally checks portable data placement plus silent NSIS install and uninstall. These execution checks supplement architecture, version, archive, and signature checks rather than replacing them.

## Alternatives considered

- Implement the reserved in-process Electron IPC carrier locally. Rejected because it would fork the protocol and client-composition seams before upstream defines the provider.
- Patch the official Web UI directly. Rejected because every upstream UI change would create a merge conflict and native mode could no longer be proven unmodified.
- Rely on monorepo symlinks or automatic peer installation to complete the packaged runtime. Rejected because electron-builder follows the production graph, source success can hide missing peers, and package-manager peer behavior is not a release contract.
- Verify only that executables, runtime binaries, and entry files exist. Rejected because structurally complete artifacts can still fail during ESM resolution, Cordis/HMR initialization, Electron readiness, Portable extraction, or NSIS installation.
- Update the workspace installation in place. Rejected because a partial npm install could leave the desktop application unable to start and provides no deterministic rollback.
- Store portable preferences inside the application archive. Rejected because packaged resources are immutable and would mix user state with release files.
- Let the renderer own the terminal. Rejected because renderer reload would terminate or orphan the process and would expand renderer privileges.

## Consequences

- The derivative has a narrow upstream-diff surface concentrated in `apps/will-desktop`.
- Users see `Deepseek Harness Will — 组装未来` as the application name on both platforms, while stable repository, artifact, application-id, and data-directory identifiers avoid broken links and lost existing state.
- Current desktop traffic still traverses a loopback socket. Direct IPC remains a future migration governed by the upstream GUI layering note; this note does not supersede it.
- The explicit production closure and unpacked `node_modules` tree increase release and installed size compared with shipping only the top-level dsh package, in exchange for deterministic packaged module resolution.
- Full-shell and packaged-Harness smoke tests add CI time and temporary disk use, but make the release variants prove executable behavior instead of file presence alone.
- Developer ID, Apple notarization, and Authenticode credentials are external operational dependencies. Contributor CI can validate ad-hoc or unsigned artifacts, but a release tag cannot publish without the platform accounts, certificates, secrets, and notarization service.
- macOS Hardened Runtime deliberately enables `com.apple.security.cs.disable-library-validation` in the main and inherited entitlements so the official agent overlay and native plugins can load from user-owned data directories. This relaxes the in-process library-signature boundary, not the application's Developer ID signature, notarization, or Gatekeeper assessment; renderer origin checks and the explicit plugin trust warning also remain in force.
- Windows portable mode is genuinely movable, but users must keep the executable and its sibling data directory together. macOS uses the installed application data directory.
- Apple Silicon and Intel use separate native DMGs and bundled Node runtimes. macOS users still replace the app from a newer DMG even though public tagged builds are signed and notarized; automatic macOS installation is a separate decision.
- Agent overlay rollback is bounded to one previous version. The bundled version remains the final fallback when no overlay exists.
- Plugin installation and agent updates require network access and execute trusted package code.
- Per-file mutation restore and automated Codex/Claude migration are not provided by this decision; they require explicit host APIs rather than renderer-side filesystem shortcuts.
- Public distribution documentation is fully bilingual and uses source-derived SVG diagrams for capabilities, control-center structure, palettes, platforms, and trust boundaries. Diagram captions must distinguish structural illustrations from runtime screenshots, and the implemented/planned matrix must remain aligned with the desktop contracts.
