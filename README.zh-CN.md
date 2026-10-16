# pi-chinese-branch-summary

[English](./README.md) | 简体中文

**pi-chinese-branch-summary** 用于把 [Pi Coding Agent](https://github.com/earendil-works/pi) 写入会话的结构化摘要本地化为中文。Pi 会写两类摘要，两类的模板都硬编码为英文：

- **分支回溯摘要**——使用 `/tree` 回溯分支时写入；通过 `session_before_tree` 事件拦截，内核为该事件提供了「换词档」（可替换提示词）；
- **上下文压缩摘要**——长会话触发压缩（到达阈值或手动 `/compact`）时写入；通过 `session_before_compact` 事件拦截，该事件**没有**换词档，因此扩展需自行生成摘要并把成品交回内核。

---

## 🌟 背景与痛点

Pi 会向会话历史写入两类结构化摘要：

1. **分支摘要**——使用 `/tree` 切换并回溯分支时，内核用硬编码的英文提示词（`BRANCH_SUMMARY_PROMPT`）驱动模型生成 `<summary>` 节点；
2. **压缩摘要**——上下文接近窗口上限或执行 `/compact` 时，内核用硬编码的英文提示词（`SUMMARIZATION_PROMPT`）把较早的历史折叠成检查点摘要。

这会在中文开发和写作场景下导致：

1. **上下文语境割裂**：中文会话历史中强行夹杂英文元数据结构（`## Goal`、`## Progress`、`## Critical Context` 等）；
2. **后续生成漂移**：后续模型在基于英文摘要续写时，极易诱发语言风格抖动与欧化翻译腔。

---

## 🚀 核心特性

- **两类摘要、两种打法**：分支摘要只置换提示词、全量复用内核管线；压缩摘要采用接管式——因为内核没有为压缩提供换词档；
- **结构严格保真**：中文提示词与 Pi 核心源码内置模板逐字段一对一映射，保证生成的摘要结构与 Pi 的上下文加载器完全同构；
- **可复用处全部复用**：分支摘要 100% 复用 Pi 内核的 Token 预算截断（`reserveTokens`）、重试机制、模型鉴权与流式输出；
- **契约字段保真回填**：压缩摘要的 `firstKeptEntryId` / `tokensBefore` 直接取自 preparation，`usage` 必回填，并自维护 `<read-files>` / `<modified-files>` 文件清单块；
- **显式降级**：任何拿不准的情况都退回内核英文默认，并给出 warning 通知——不留静默回退；
- **零外部依赖**：纯原生 TypeScript 实现，不引入任何第三方运行时 npm 包；
- **原生极速单测**：基于 Node.js 内置 Test Runner，执行反馈耗时毫秒级。

---

## 📦 安装与配置

### 方式 A：全局安装（推荐，本机所有项目生效）

在 Pi 全局扩展目录中建立软链接：

```bash
mkdir -p ~/.pi/agent/extensions
ln -sf /path/to/pi-chinese-branch-summary/extensions/chinese-branch-summary.ts ~/.pi/agent/extensions/chinese-branch-summary.ts
ln -sf /path/to/pi-chinese-branch-summary/extensions/chinese-compaction.ts ~/.pi/agent/extensions/chinese-compaction.ts
```

### 方式 B：项目级安装（通过 Pi Package 声明）

在项目根目录的 `.pi/settings.json` 中添加；两个扩展均在 `pi.extensions` 中声明，会一起加载：

```json
{
  "packages": [
    "/path/to/pi-chinese-branch-summary"
  ]
}
```

---

## 🔬 工作原理

### 分支摘要——指令置换

Pi 内核在生成分支摘要前广播 `session_before_tree` 事件：

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
Pi 内核彻底覆盖默认英文模板，生成全中文结构化摘要
```

### 压缩摘要——接管式

压缩没有换词档：内核的结果契约只有 `cancel` 与 `compaction` 两档。因此扩展自行生成摘要并交回成品：

```text
上下文达到阈值，或手动执行 /compact
       │
       ▼
内核广播 "session_before_compact"，携带 { preparation, customInstructions, reason, signal }
       │
       ▼
chineseCompactionExtension：
   1) 守卫 —— preparation 契约字段是否齐备？
   2) 取料 —— messagesToSummarize + turnPrefixMessages（split turn 一次全覆盖）
   3) 生成 —— convertToLlm + serializeConversation 序列化 → 中文模板 → 模型
   4) 交卷 —— { compaction: { summary, firstKeptEntryId, tokensBefore, usage, details } }
       │
       ▼
内核写入中文检查点摘要
       │
       └─ 任何拿不准：通知 + 返回 undefined → 内核执行其英文默认
```

---

## 🧪 运行测试

压缩扩展在运行时 import Pi 的序列化工具，因此跑测试前需先让 peer 依赖可解析：

```bash
npm install
npm test
```

---

## 📄 开源许可证

本项目基于 [MIT 许可证](./LICENSE) 开源。
