# pi-chinese-branch-summary

[English](./README.md) | 简体中文

**pi-chinese-branch-summary** 是面向 [Pi Coding Agent](https://github.com/earendil-works/pi) 的中文会话分支回溯摘要扩展。

通过监听 Pi 内核官方的 `session_before_tree` 生命周期事件，在分支切换与回溯时将默认硬编码的英文摘要提示词替换为结构严格同构的中文保真模板。

---

## 🌟 背景与痛点

在 Pi Coding Agent 的交互模式中使用 `/tree` 切换并回溯分支会话时，Pi 内核默认使用英文提示词（`BRANCH_SUMMARY_PROMPT`）驱动模型生成 `<summary>` 节点。

这会在中文开发和写作场景下导致：
1. **上下文语境割裂**：中文会话历史中强行夹杂英文元数据结构（`## Goal`、`## Progress` 等）；
2. **后续生成漂移**：后续模型在基于英文分支摘要进行会话续写时，极易诱发语言风格抖动与欧化翻译腔。

---

## 🚀 核心特性

- **结构严格保真**：中文提示词与 Pi 核心源码内置模板逐行逐字段一对一映射，保证生成的摘要结构与 Pi 的会话上下文加载器（Context Loader）完全同构；
- **全量原生复用**：仅置换提示词模板，100% 复用 Pi 内核的 Token 预算截断（`reserveTokens`）、重试机制、模型鉴权与流式输出；
- **零外部依赖**：纯原生 TypeScript 实现，不引入任何第三方运行时 npm 包；
- **原生极速单测**：配备基于 Node.js 内置 Test Runner 的单元测试套件，执行反馈耗时毫秒级。

---

## 📦 安装与配置

### 方式 A：全局安装（推荐，本机所有项目生效）

在当前用户的 Pi 全局扩展目录中建立软链接：

```bash
mkdir -p ~/.pi/agent/extensions
ln -sf /path/to/pi-chinese-branch-summary/extensions/chinese-branch-summary.ts ~/.pi/agent/extensions/chinese-branch-summary.ts
```

### 方式 B：项目级安装（通过 Pi Package 声明）

在项目根目录的 `.pi/settings.json` 中添加：

```json
{
  "packages": [
    "/path/to/pi-chinese-branch-summary"
  ]
}
```

---

## 🔬 工作原理

Pi 核心源码（`packages/coding-agent/src/core/agent-session.ts`）在用户确认 `/tree` 分支切换时会广播 `session_before_tree` 事件：

```text
/tree 交互选择目标分支
       │
       ▼
_extensionRunner.emit("session_before_tree", preparation)
       │
       ▼
chineseBranchSummaryExtension 拦截并返回：
{
    replaceInstructions: true,
    customInstructions: CHINESE_BRANCH_SUMMARY_PROMPT
}
       │
       ▼
generateBranchSummary(entries, { replaceInstructions: true, ... })
       │
       ▼
Pi 内核彻底覆盖默认英文模板，驱动模型生成全中文结构化摘要
```

---

## 🧪 运行测试

使用 Node.js 原生测试运行器直接执行：

```bash
node --test --experimental-strip-types tests/*.test.ts
```

---

## 📄 开源许可证

本项目基于 [MIT 许可证](./LICENSE) 开源。
