# pi-chinese-branch-summary

English | [简体中文](./README.zh-CN.md)

**pi-chinese-branch-summary** localizes the structured summaries that the [Pi Coding Agent](https://github.com/earendil-works/pi) writes into a session. Pi writes two kinds of them, and both templates are hardcoded in English:

- **Branch summaries** — written when you backtrack with `/tree`; intercepted through the `session_before_tree` event, which offers an instruction-replacement slot;
- **Compaction summaries** — written when a long session is compacted (threshold or manual `/compact`); intercepted through the `session_before_compact` event, which offers no such slot, so the extension generates the Chinese summary itself and hands the finished product back to the kernel.

---

## 🌟 Background

Pi writes two kinds of structured summary into the conversation history:

1. **Branch summary** — on `/tree` navigation the kernel uses the hardcoded `BRANCH_SUMMARY_PROMPT` to generate the `<summary>` compaction entry;
2. **Compaction summary** — when the context approaches the window limit or you run `/compact`, the kernel folds earlier history into a checkpoint summary using the hardcoded `SUMMARIZATION_PROMPT`.

In Chinese-native development workflows this results in:

1. **Context Fragmentation**: injected English metadata headers (`## Goal`, `## Progress`, `## Critical Context`) inside an otherwise all-Chinese conversation history;
2. **Style Drift**: downstream LLM turns referencing English summaries often suffer from stylistic jitter and translationese.

---

## 🚀 Features

- **Two summaries, two shapes**: branch summaries only swap the instruction template and reuse the kernel's whole pipeline; compaction summaries are takeover-style, because the kernel exposes no prompt-replacement slot for compaction;
- **Strict isomorphic fidelity**: the Chinese prompts align 1-to-1 with Pi's built-in prompt fields, so the generated structure stays identical for Pi's context loader;
- **Full kernel reuse where available**: branch summaries keep 100% of Pi's token budgeting (`reserveTokens`), retry policy, credentials and streaming pipeline;
- **Faithful contract fill-in for compaction**: `firstKeptEntryId` / `tokensBefore` come from the preparation as-is, `usage` is always reported, and `<read-files>` / `<modified-files>` blocks are maintained;
- **Explicit degradation**: on any uncertainty the extension falls back to the kernel's English default and says so with a warning — never a silent fallback;
- **Zero external dependencies**: pure TypeScript implementation with no third-party runtime packages;
- **Native test suite**: validated via Node's built-in test runner (`node --test`), with millisecond feedback.

---

## 📦 Installation

### Method A: Global Installation (Recommended)

Symlink the extension scripts into your Pi global extension directory:

```bash
mkdir -p ~/.pi/agent/extensions
ln -sf /path/to/pi-chinese-branch-summary/extensions/chinese-branch-summary.ts ~/.pi/agent/extensions/chinese-branch-summary.ts
ln -sf /path/to/pi-chinese-branch-summary/extensions/chinese-compaction.ts ~/.pi/agent/extensions/chinese-compaction.ts
```

### Method B: Project-level Package Declaration

Add the package path to your project's `.pi/settings.json`; both extensions are declared in `pi.extensions` and load together:

```json
{
  "packages": [
    "/path/to/pi-chinese-branch-summary"
  ]
}
```

---

## 🔬 How It Works

### Branch summaries — instruction replacement

Pi core emits the `session_before_tree` lifecycle event right before generating a branch summary:

```text
/tree selection confirmed
       │
       ▼
_extensionRunner.emit("session_before_tree", preparation)
       │
       ▼
chineseBranchSummaryExtension returns:
{
    replaceInstructions: true,
    customInstructions: CHINESE_BRANCH_SUMMARY_PROMPT
}
       │
       ▼
generateBranchSummary(entries, { replaceInstructions: true, ... })
       │
       ▼
Pi core discards the hardcoded English prompt and generates an all-Chinese summary
```

### Compaction summaries — takeover

Compaction has no instruction-replacement slot: the kernel result type carries only `cancel` and `compaction`. The extension therefore produces the summary and submits it as a finished product:

```text
context threshold reached, or manual /compact
       │
       ▼
kernel emits "session_before_compact" with { preparation, customInstructions, reason, signal }
       │
       ▼
chineseCompactionExtension:
   1) guard    — are the preparation contract fields present?
   2) gather   — messagesToSummarize + turnPrefixMessages (split turn, one pass)
   3) generate — convertToLlm + serializeConversation → Chinese prompt → model
   4) submit   — { compaction: { summary, firstKeptEntryId, tokensBefore, usage, details } }
       │
       ▼
kernel stores the Chinese checkpoint summary
       │
       └─ on any uncertainty: notify + return undefined → kernel runs its English default
```

---

## 🧪 Testing

The compaction extension imports Pi's serialization helpers, so the peer dependency must be resolvable before running the suite:

```bash
npm install
npm test
```

---

## 📄 License

[MIT License](./LICENSE)
