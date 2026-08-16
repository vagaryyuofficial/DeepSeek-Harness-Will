# Agent Note：Will 桌面发行版——下游回环壳、独占数据与事务式更新

Status: implemented

[English](2026-08-16-will-desktop-distribution.md) | 中文

## Problem

Will 发行版需要把官方 DeepSeek Harness Web profile 封装为双击即用的 Windows 应用。用户不能被要求安装 Node.js，关闭窗口不能终止正在执行的任务，桌面偏好也不能修改上游 profile 文件。发行版还需要便携数据模式，以及两条彼此独立的更新通道：官方 `@deepseek-ai/dsh` package 与 Electron 客户端本体。

上游 [GUI 分层与 RPC 协议笔记](2026-07-19-gui-layering-and-rpc-protocol.md)预留了未来的 Electron 原生 IPC 载体，但该 provider 尚未实现。在衍生版中自行建设私有替代品会重复协议边界，并显著增加同步上游的成本。

## Decision

`apps/will-desktop` 是下游应用壳，不是新的核心 package。它在子进程中启动内置 `@deepseek-ai/dsh web` 入口，绑定 `127.0.0.1` 临时端口，再由启用上下文隔离的 Electron 窗口加载这一精确 origin。preload 只加入发行版界面：原生窗口栏、皮肤、余额、`soul.md`、插件操作、持久 PowerShell、更新、路径、偏好和通知。原生模式会移除全部 Will CSS token，因此官方外观始终是默认值。

只有 sender origin 与当前 Harness origin 完全相同，renderer IPC 才会受理。renderer 不启用 Node integration。密钥留在主进程；余额通道只返回净化后的币种数据。插件沿用上游信任模型，安装前必须显示任意代码执行警告。

应用在 Electron ready 之前选择唯一数据根。安装模式使用 `userData`；便携模式使用 exe 同目录的 `DeepSeek-Harness-Will-Data`。Will 在该根目录下独占偏好、人设源及 patch、运行时 shim 和 agent overlay。dsh 在同一根下使用独立 `DSH_HOME`。Will 永不覆盖 dsh profile patch。

内置 agent 通过 `ELECTRON_RUN_AS_NODE=1` 在 Electron 下运行。发行包还携带经 checksum 校验的独立 Node/npm。agent 更新先把 `@deepseek-ai/dsh@latest` 安装到 staging，执行 `dsh --version`，再轮换 `current` 与 `previous` 并重启；新版本启动失败时恢复上一 overlay。客户端更新使用已配置 GitHub Release provider 的签名元数据，但未经用户明确确认不会下载或安装。目前发行流水线产出的 exe 尚未进行代码签名。

PowerShell 由主进程而非 Web 页面持有。它在应用项目目录中运行，可跨 renderer 重载和关闭到托盘持续存在，通过 IPC 广播输出，并保留有界回放缓冲区供重新连接。

## Alternatives considered

- 在本地实现预留的进程内 Electron IPC 载体。否决：上游 provider 定型前这样做会分叉协议与 client 组合边界。
- 直接修改官方 Web UI。否决：每次上游 UI 变化都会产生合并冲突，也无法再证明原生模式未经修改。
- 原地更新工作区安装。否决：中途失败的 npm 安装可能让桌面应用无法启动，而且不能确定性回退。
- 把便携偏好写入应用 archive。否决：打包资源不可变，也会把用户状态与发行文件混在一起。
- 让 renderer 持有 PowerShell。否决：renderer 重载会终止或遗留进程，并扩大 renderer 权限。

## Consequences

- 衍生版与上游的差异面较小，主要集中在 `apps/will-desktop`。
- 当前桌面流量仍经过本机回环 socket。直接 IPC 迁移继续由上游 GUI 分层笔记治理；本笔记不取代它。
- 便携模式可以真正移动，但用户必须同时保留 exe 与其旁边的数据目录。
- agent overlay 只保留一个上一版本；没有 overlay 时，内置版本是最终 fallback。
- 插件安装和 agent 更新需要网络访问，并会执行受信任 package 的代码。
- 本决策不提供逐文件变更还原或 Codex/Claude 自动迁移；它们需要显式 host API，而不是 renderer 侧文件系统捷径。
