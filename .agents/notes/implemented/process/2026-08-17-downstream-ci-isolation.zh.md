# Agent Note：下游 CI 隔离上游专属自动化与私有应用

Status: implemented

[English](2026-08-17-downstream-ci-isolation.md) | 中文

## Problem

本仓库保留上游工作流，以便同步时继续沿用其验证；但其中若干任务依赖官方 `deepseek-harness/deepseek-harness` 仓库、该仓库的 GitHub App 凭据和真实 API 密钥。这些任务原样运行在下游仓库时只会产生与拉取请求无关的失败。dsh npm 发布族还会选择全部 `apps/*` manifest，因而错误地把私有 Will 桌面应用当作上游 `@deepseek-ai` package。

## Decision

Issue lifecycle 与 Issue policy 任务只在 `deepseek-harness/deepseek-harness` 中运行，因为只有该处具备对应的仓库配置与 GitHub App。下游仓库仅在 `DSH_ENABLE_REAL_API_E2E` 仓库变量为 `true` 时运行真实 API E2E；现有预检仍要求 `DEEPSEEK_API_KEY_EXTERNAL`，fork 与 Dependabot 拉取请求仍被排除。无密钥静态检查、单元测试、快照、打包以及 Windows 与 macOS 检查继续在下游仓库运行。

发布族发现会把 `private: true` manifest 视为仅供工作区使用的应用，并在 namespace 与共享版本验证之前排除。私有应用因此仍是可构建的工作区成员，但不会进入 dsh 发布族负责的版本递增、npm tarball、发布排序或 tag。

## Alternatives considered

- **删除继承的工作流。** 否决：保留工作流可让上游同步与差异比较保持明确，而仓库守卫能准确表达这些工作流在哪个仓库有效。
- **把上游 GitHub App 凭据和 API 密钥复制到每个下游仓库。** 否决：下游维护者并不控制上游 App 或 Project，真实 API 密钥也是可选运营成本，不应成为无密钥拉取请求验证的前提。
- **把 Will 桌面 package 改名到 `@deepseek-ai` namespace。** 否决：它是私有 package，以 Electron 应用而非 npm package 形式发布，并由下游项目拥有。

## Consequences

- 上游专属任务在下游仓库中显示为 skipped，而不是产生无关失败。
- 下游维护者可以通过同时设置仓库变量和 secret 明确启用真实 API E2E；启用后缺少 secret 仍会明确失败。
- 对于共享 pnpm 工作区但不属于 npm 发布族的产品组装，`private: true` 是发布边界。
- 被误标为 private 的可发布 package 会被发布工作流忽略，而不是被拒绝，因此代码评审必须把 `private` 标记视为一项发布决策。
