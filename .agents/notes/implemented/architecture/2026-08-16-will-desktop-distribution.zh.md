# Agent Note: Will 桌面发行版——下游回环壳、独占数据与经验证的原生发行

Status: implemented

[English](2026-08-16-will-desktop-distribution.md) | 中文

## Problem

Will 发行版需要把官方 DeepSeek Harness Web profile 封装为双击即用的 Windows 与 macOS 应用。用户不能被要求安装 Node.js，关闭窗口不能终止正在执行的任务，桌面偏好也不能修改上游 profile 文件。Windows 发行版还需要便携数据模式，两个平台都需要独立更新官方 `@deepseek-ai/dsh` package 的通道。

上游 [GUI 分层与 RPC 协议笔记](2026-07-19-gui-layering-and-rpc-protocol.md)预留了未来的 Electron 原生 IPC 载体，但该 provider 尚未实现。在衍生版中自行建设私有替代品会重复协议边界，并显著增加同步上游的成本。

在 monorepo 中从源码运行时，即使打包后的生产依赖图不完整，也可能通过工作区符号链接继承对等依赖（peer dependency）package。即使包中存在预期的可执行文件和入口文件，也仍可能在首次 ESM import、Node loader 要求或 Electron ready 转换时失败。因此，原生安装包需要运行时与完整壳执行检查，公开发行 tag 还需要操作系统信任链，而不能要求用户绕过平台安全机制。

## Decision

`apps/will-desktop` 是下游应用壳，不是新的核心 package。仓库与发行产物保留 DeepSeek Harness Will 项目名，安装后的应用、操作系统界面与桌面壳则使用双语显示名 `Deepseek Harness Will — 组装未来`。它在子进程中启动内置 `@deepseek-ai/dsh web` 入口，绑定 `127.0.0.1` 临时端口，再由启用上下文隔离的 Electron 窗口加载这一精确 origin。preload 只加入发行版界面：分平台原生窗口栏、皮肤、余额、`soul.md`、插件操作、持久原生终端、更新、路径、偏好和通知。原生模式会移除全部 Will CSS token，因此官方外观始终是默认值。

桌面 manifest 把完整的必需工作区对等依赖闭包显式声明为生产依赖。构建门禁遍历运行时依赖与可选依赖，拒绝桌面 manifest 中缺失的任何必需工作区对等依赖；只有 manifest 明确标记为可选的对等依赖才会被豁免。electron-builder 把生产 `node_modules` 解包到 `app.asar.unpacked` 真实文件树，host 从该文件树解析内置 dsh 与 pnpm 入口，不依赖 archive 遍历或 monorepo 链接。每次启动内置或 overlay dsh 时，都把 Node 选项 `--expose-internals` 放在 dsh 入口脚本之前，使打包后的 Cordis/HMR loader 路径能够初始化。ESM 主入口调用 `void boot().catch(...)`；`boot()` 在内部 await `app.whenReady()`，因此 module 求值不会因顶层 ready await 而保持挂起。

只有 sender origin 与当前 Harness origin 完全相同，renderer IPC 才会受理。renderer 不启用 Node integration。密钥留在主进程；余额通道只返回净化后的币种数据。插件沿用上游信任模型，安装前必须显示任意代码执行警告。

应用在 Electron ready 之前选择唯一数据根。安装模式显式保留 Electron 每用户 `appData` 根目录下原有的 `DeepSeek Harness Will` 目录，而不会根据新显示名派生路径；便携模式继续使用 exe 同目录的 `DeepSeek-Harness-Will-Data`。Will 在该根目录下独占偏好、人设源及 patch、运行时 shim 和 agent overlay。dsh 在同一根下使用独立 `DSH_HOME`。Will 永不覆盖 dsh profile patch。Harness 命令与主进程终端都把用户 home 目录作为稳定的默认工作目录，不再继承 `/` 等随 launcher 变化的目录。终端在 Windows 选择 PowerShell，在 macOS 选择登录 Shell；它可跨 renderer 重载和关闭到托盘持续存在，通过 IPC 广播输出，并保留有界回放缓冲区供重新连接。

内置 agent 通过 `ELECTRON_RUN_AS_NODE=1` 在 Electron 下运行。发行包还携带与目标架构匹配、经 checksum 校验的独立 Node/npm。agent 更新先把 `@deepseek-ai/dsh@latest` 安装到 staging，执行 `dsh --version`，再轮换 `current` 与 `previous` 并重启；新版本启动失败时恢复上一 overlay。Windows 客户端更新使用已配置 GitHub Release provider 的元数据，但未经用户明确确认不会下载或安装。macOS 客户端更新仍采用手动替换 DMG 的流程。

非 tag Windows CI 产出未签名产物，非 tag macOS CI 则产出 ad-hoc 签名产物，供贡献者进行可复现验证。`will-v*` tag 是受信任的发布边界：Windows 打包必须提供 Authenticode 凭据，并验证全部三个可执行界面；macOS 打包必须提供 Developer ID Application 身份，并验证 hardened runtime、公证、Gatekeeper 评估和 stapling。两个已签名平台 job 全部成功后，release job 才能发布。

CI 从解包后的依赖树执行已打包 dsh 入口，并检查实际 Harness Web 文档。它还使用隔离状态和有界 ready 探针，分别启动 `win-unpacked`、复制后的 Portable wrapper、经 NSIS 安装的应用以及两个原生 macOS 架构的完整 Electron 壳；Windows 另外检查便携数据位置，并执行 NSIS 静默安装与卸载。这些执行检查用于补充架构、版本、archive 和签名检查，而不是取代它们。

## Alternatives considered

- 在本地实现预留的进程内 Electron IPC 载体。否决：上游 provider 定型前这样做会分叉协议与 client 组合边界。
- 直接修改官方 Web UI。否决：每次上游 UI 变化都会产生合并冲突，也无法再证明原生模式未经修改。
- 依赖 monorepo 符号链接或自动安装对等依赖来补全打包运行时。否决：electron-builder 遵循生产依赖图，源码成功可能掩盖缺失的对等依赖，而且 package manager 的对等依赖行为不是发行契约。
- 只验证可执行文件、运行时二进制和入口文件存在。否决：结构完整的产物仍可能在 ESM 解析、Cordis/HMR 初始化、Electron ready、Portable 解包或 NSIS 安装阶段失败。
- 原地更新工作区安装。否决：中途失败的 npm 安装可能让桌面应用无法启动，而且不能确定性回退。
- 把便携偏好写入应用 archive。否决：打包资源不可变，也会把用户状态与发行文件混在一起。
- 让 renderer 持有终端。否决：renderer 重载会终止或遗留进程，并扩大 renderer 权限。

## Consequences

- 衍生版与上游的差异面较小，主要集中在 `apps/will-desktop`。
- 用户在两个平台上看到的应用名均为 `Deepseek Harness Will — 组装未来`；稳定的仓库名、发行文件名、应用 id 与数据目录标识可避免链接失效或旧状态丢失。
- 当前桌面流量仍经过本机回环 socket。直接 IPC 迁移继续由上游 GUI 分层笔记治理；本笔记不取代它。
- 显式生产依赖闭包与解包后的 `node_modules` 树会比只交付顶层 dsh package 增大发行包体和安装占用，换来打包后确定性的 module 解析。
- 完整壳和打包 Harness 冒烟测试（smoke test）会增加 CI 时间与临时磁盘占用，但可让各发行变体证明可执行行为，而不仅是文件存在。
- Developer ID、Apple 公证与 Authenticode 凭据是外部运营依赖。贡献者 CI 可以验证 ad-hoc 或未签名产物，但发行 tag 缺少平台账号、证书、secret 或公证服务时不能发布。
- macOS Hardened Runtime 在主 entitlements 与继承 entitlements 中有意启用 `com.apple.security.cs.disable-library-validation`，使用户数据目录中的官方 agent overlay 与原生插件可以加载。它放宽的是进程内 library 签名边界，而不是应用的 Developer ID 签名、公证或 Gatekeeper 评估；renderer origin 检查和显式插件信任警告也仍然生效。
- Windows 便携模式可以真正移动，但用户必须同时保留 exe 与其旁边的数据目录。macOS 使用安装模式的应用数据目录。
- Apple Silicon 与 Intel 使用各自的原生 DMG 和内置 Node 运行时。即使公开 tag 构建已经签名并公证，macOS 用户仍通过新版 DMG 替换应用；macOS 自动安装属于另一个决策。
- agent overlay 只保留一个上一版本；没有 overlay 时，内置版本是最终 fallback。
- 插件安装和 agent 更新需要网络访问，并会执行受信任 package 的代码。
- 本决策不提供逐文件变更还原或 Codex/Claude 自动迁移；它们需要显式 host API，而不是 renderer 侧文件系统捷径。
- 公开发行文档采用完整中英文对照，并使用从源码推导的 SVG 说明图展示能力、控制中心结构、主题、平台与信任边界。图片标题必须区分结构示意和运行截图，已实现/规划矩阵也必须持续与桌面 contracts 对齐。
