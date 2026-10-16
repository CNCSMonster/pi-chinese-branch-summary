# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-10-17

### Added
- `chinese-compaction` extension: intercepts the `session_before_compact` lifecycle event to produce Chinese context-compaction summaries. Before this release only branch backtracking summaries were localized, so compaction checkpoints stayed English inside an otherwise Chinese conversation.
- Single-pass coverage of split turns (`messagesToSummarize` + `turnPrefixMessages`), so split compactions no longer fall back to the English default and lose the half-turn's context.
- Faithful contract fill-in: `firstKeptEntryId` and `tokensBefore` are taken from the preparation as-is, `usage` is always reported (session totals count compaction usage only from the entry field), and `<read-files>` / `<modified-files>` blocks are maintained for extension-generated summaries.
- Explicit fallback to the core English default on any uncertainty (empty summary, model error, aborted signal, contract drift), always paired with a warning notification — no silent fallback.
- Compaction test suite: 10 native Node tests covering the happy path, split coverage, manual `/compact` instructions, and the fallback family.

### Changed
- `pi.extensions` now declares both extensions, so installing the package enables branch-summary and compaction localization together.

## [0.1.0] - 2026-10-10

### Added
- Initial public release of `pi-chinese-branch-summary`.
- `session_before_tree` hook implementation replacing the default English branch summary prompt.
- High-fidelity Chinese branch summary prompt template (`CHINESE_BRANCH_SUMMARY_PROMPT`) matching Pi's core fields.
- Zero-dependency Node.js native test suite.
- Bilingual documentation (English and Simplified Chinese).
