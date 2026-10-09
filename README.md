# pi-chinese-branch-summary

English | [简体中文](./README.zh-CN.md)

**pi-chinese-branch-summary** is a Chinese branch summarization extension for the [Pi Coding Agent](https://github.com/earendil-works/pi).

It intercepts the native `session_before_tree` lifecycle event during `/tree` navigation, replacing the default hardcoded English summary prompt with an isomorphic, high-fidelity Chinese prompt template.

---

## 🌟 Background

When navigating session trees using `/tree` in Pi Coding Agent, the kernel by default utilizes a hardcoded English prompt (`BRANCH_SUMMARY_PROMPT`) to generate the `<summary>` compaction entry.

In Chinese-native development workflows, this results in:
1. **Context Fragmentation**: Injected English metadata headers (`## Goal`, `## Progress`, etc.) inside an otherwise all-Chinese conversation history;
2. **Style Drift**: Downstream LLM turns referencing English summaries often suffer from stylistic jitter and translationese.

---

## 🚀 Features

- **Strict Isomorphic Fidelity**: The Chinese prompt aligns 1-to-1 with Pi's built-in prompt fields, ensuring complete compatibility with Pi's Context Loader;
- **Full Kernel Reuse**: Only replaces the instruction template—100% preserves Pi's token budgeting (`reserveTokens`), retry policy, credentials, and streaming pipeline;
- **Zero External Dependencies**: Pure TypeScript implementation with zero runtime npm dependencies;
- **Native Test Suite**: Validated via Node.js native test runner (`node --test`), providing sub-second feedback.

---

## 📦 Installation

### Method A: Global Installation (Recommended)

Symlink the extension script to your Pi global extension directory:

```bash
mkdir -p ~/.pi/agent/extensions
ln -sf /path/to/pi-chinese-branch-summary/extensions/chinese-branch-summary.ts ~/.pi/agent/extensions/chinese-branch-summary.ts
```

### Method B: Project-level Package Declaration

Add the package path to your project's `.pi/settings.json`:

```json
{
  "packages": [
    "/path/to/pi-chinese-branch-summary"
  ]
}
```

---

## 🔬 How It Works

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
Pi core discards hardcoded English prompt and generates all-Chinese summary
```

---

## 🧪 Testing

Run tests directly using Node.js:

```bash
node --test --experimental-strip-types tests/*.test.ts
```

---

## 📄 License

[MIT License](./LICENSE)
