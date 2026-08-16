# Agent Note：Will 桌面发行版——下游回环壳、独占数据与事务式更新

Status: implemented

[English](2026-08-16-will-desktop-distribution.md) | 中文

## Problem

Will 发行版需要把官方 DeepSeek Harness Web profile 封装为双击即用的 Windows 与 macOS 应用。用户不能被要求安装 Node.js，关闭窗口不能终止正在执行的任务，桌面偏好也不能修改上游 profile 文件。Windows 发行版还需要便携数据模式，两个平台都需要独立更新官方 `@deepseek-ai/dsh` package 的通道。

上游 [GUI 分层与 RPC 协议笔记](2026-07-19-gui-layering-and-rpc-protocol.md)预留了未来的 Electron 原生 IPC 载体，但该 provider 尚未实现。在衍生版中自行建设私有替代品会重复协议边界，并显著增加同步上游的成本。

## Decision

`apps/will-desktop` 是下游应用壳，不是新的核心 package。仓库与发行产物保留 DeepSeek Harness Will 项目名，安装后的应用、操作系统界面与桌面壳则使用双语显示名 `Deepseek Harness Will — 组装未来`。它在子进程中启动内置 `@deepseek-ai/dsh web` 入口，绑定 `127.0.0.1` 临时端口，再由启用上下文隔离的 Electron 窗口加载这一精确 origin。preload 只加入发行版界面：分平台原生窗口栏、皮肤、余额、`soul.md`、插件操作、持久原生终端、更新、路径、偏好和通知。原生模式会移除全部 Will CSS token，因此官方外观始终是默认值。

只有 sender origin 与当前 Harness origin 完全相同，renderer IPC 才会受理。renderer 不启用 Node integration。密钥留在主进程；余额通道只返回净化后的币种数据。插件沿用上游信任模型，安装前必须显示任意代码执行警告。

应用在 Electron ready 之前选择唯一数据根。安装模式显式保留 Electron 每用户 `appData` 根目录下原有的 `DeepSeek Harness Will` 目录，而不会根据新显示名派生路径；便携模式继续使用 exe 同目录的 `DeepSeek-Harness-Will-Data`。Will 在该根目录下独占偏好、人设源及 patch、运行时 shim 和 agent overlay。dsh 在同一根下使用独立 `DSH_HOME`。Will 永不覆盖 dsh profile patch。

内置 agent 通过 `ELECTRON_RUN_AS_NODE=1` 在 Electron 下运行。发行包还携带与目标架构匹配、经 checksum 校验的独立 Node/npm。agent 更新先把 `@deepseek-ai/dsh@latest` 安装到 staging，执行 `dsh --version`，再轮换 `current` 与 `previous` 并重启；新版本启动失败时恢复上一 overlay。Windows 客户端更新使用已配置 GitHub Release provider 的元数据，但未经用户明确确认不会下载或安装。项目没有 Apple 签名与公证身份，因此 macOS 客户端采用手动更新。发行流水线产出未签名的 Windows exe、Apple Silicon DMG 和 Intel DMG。

原生终端由主进程而非 Web 页面持有。Windows 选择 PowerShell，macOS 选择登录 Shell；终端在应用项目目录中运行，可跨 renderer 重载和关闭到托盘持续存在，通过 IPC 广播输出，并保留有界回放缓冲区供重新连接。

## Alternatives considered

- 在本地实现预留的进程内 Electron IPC 载体。否决：上游 provider 定型前这样做会分叉协议与 client 组合边界。
- 直接修改官方 Web UI。否决：每次上游 UI 变化都会产生合并冲突，也无法再证明原生模式未经修改。
- 原地更新工作区安装。否决：中途失败的 npm 安装可能让桌面应用无法启动，而且不能确定性回退。
- 把便携偏好写入应用 archive。否决：打包资源不可变，也会把用户状态与发行文件混在一起。
- 让 renderer 持有终端。否决：renderer 重载会终止或遗留进程，并扩大 renderer 权限。

## Consequences

- 衍生版与上游的差异面较小，主要集中在 `apps/will-desktop`。
- 用户在两个平台上看到的应用名均为 `Deepseek Harness Will — 组装未来`；稳定的仓库名、发行文件名、应用 id 与数据目录标识可避免链接失效或旧状态丢失。
- 当前桌面流量仍经过本机回环 socket。直接 IPC 迁移继续由上游 GUI 分层笔记治理；本笔记不取代它。
- Windows 便携模式可以真正移动，但用户必须同时保留 exe 与其旁边的数据目录。macOS 使用安装模式的应用数据目录。
- Apple Silicon 与 Intel 使用各自的原生 DMG 和内置 Node 运行时。在签名自动更新可用之前，macOS 用户通过新版 DMG 替换应用。
- agent overlay 只保留一个上一版本；没有 overlay 时，内置版本是最终 fallback。
- 插件安装和 agent 更新需要网络访问，并会执行受信任 package 的代码。
- 本决策不提供逐文件变更还原或 Codex/Claude 自动迁移；它们需要显式 host API，而不是 renderer 侧文件系统捷径。
