# Documentation Index

## Overview

This directory contains all technical documentation for the Code Files Obsidian plugin. Documents are organized by category to help developers understand the architecture, features, and implementation details.

---

## 📚 Core Architecture

### [architecture.md](architecture.md)

**Role:** High-level system architecture and component overview

- Monaco Editor integration via iframe with postMessage communication
- Core components: mountCodeEditor.ts, monacoEditor.html, codeEditorView.ts
- postMessage protocol specification (parent ↔ iframe messages)
- Language system and extension mapping
- **Key for:** Understanding the overall system design and data flow

### [monaco-local-integration.md](monaco-local-integration.md)

**Role:** Migration from external to local Monaco Editor

- Replaced embeddable-monaco.lukasbach.com with local bundle (~21.4MB)
- CSP workaround strategies: blob URLs, CSS inlining, font patching
- Asset bundling and path resolution
- **Key for:** Understanding how Monaco runs locally without external dependencies

---

## ⚙️ Configuration System

### [configuration-cascade.md](configuration-cascade.md)

**Role:** Editor configuration priority and merge logic

- Three-level cascade: TypeScript Defaults → Global Config → Extension Config
- buildMergedConfig() implementation in settingsUtils.ts
- Language-specific default templates (Python, Go, Rust, etc.)
- **Key for:** Understanding how editor settings are resolved and prioritized

### [config-migration-strategy.md](config-migration-strategy.md)

**Role:** Configuration versioning and migration approach

- No automatic migration — simple three-level fallback strategy
- Problem: New commented options in templates don't auto-appear in saved configs
- User workflow for getting new options
- **Key for:** Understanding config persistence and update strategy

### [settings-refactor.md](settings-refactor.md)

**Role:** Settings storage structure and distribution

- Flat JSON structure via Obsidian's loadData()/saveData()
- Settings distributed across: Obsidian Settings Tab, Editor Settings Modal, Monaco F1 Palette
- Complete settings schema with all fields
- **Key for:** Understanding where settings live and how they're organized

---

## 🎨 Code Formatting

### [prettier-markdown-formatting.md](prettier-markdown-formatting.md)

**Role:** Prettier-based multi-language formatting (10+ languages)

- Supported languages: JS, TS, CSS, SCSS, Less, HTML, JSON, YAML, GraphQL, Markdown
- CSP restrictions and standalone browser builds
- esbuild configuration for copying Prettier files
- **Key for:** Understanding Prettier integration and language support

### [adding-formatters-guide.md](adding-formatters-guide.md)

**Role:** Guide for integrating WASM-based formatters

- Successfully integrated: Ruff (Python), gofmt (Go), clang-format (C/C++)
- Integration pattern: bundle entry → esbuild config → script loading
- Why Rust (rustfmt) couldn't be added
- **Key for:** Adding new WASM-based formatters to the plugin

### [mermaid-formatting.md](mermaid-formatting.md)

**Role:** Mermaid diagram formatting implementation

- Formatting .mmd/.mermaid files and markdown code blocks
- Why Mermaid can be bundled (unlike Prettier)
- esbuild bundling strategy
- **Key for:** Understanding Mermaid-specific formatting

### [format-diff-revert.md](format-diff-revert.md)

**Role:** Format diff viewer and selective revert feature

- Side-by-side diff after formatting
- Per-block revert buttons in diff gutter
- Singleton pattern for diff editor (prevents InstantiationService disposed error)
- **Key for:** Understanding the diff/revert UI and Monaco diff editor usage

---

## 🔧 Feature Implementation Guides

### [adding-features.md](adding-features.md)

**Role:** Step-by-step guide for adding new features

- Adding toggle settings (types → gear modal → broadcast → Monaco)
- Adding Monaco commands and actions
- Adding modals with automatic focus handling
- Complete workflow from declaration to UI
- **Key for:** Developers adding new plugin features

### [monaco-commands.md](monaco-commands.md)

**Role:** Guide for adding Monaco editor commands and actions

- addCommand() (keyboard only) vs addAction() (full UI)
- Complete command flow: Monaco → postMessage → Obsidian
- Common pitfalls and focus handling
- **Key for:** Adding editor commands with proper UI integration

---

## 🌐 Cross-File Navigation

### [cross-file-navigation.md](cross-file-navigation.md)

**Role:** TypeScript/JavaScript import navigation (Ctrl+Click)

- Project Root Folder setup and configuration
- Loading TS/JS files into Monaco's TypeScript service
- Navigation flow: Ctrl+Click → open-file message → Obsidian opens file
- **Key for:** Understanding how code navigation works across files

---

## 📁 Hidden Files & Extensions

### [files-without-extension.md](files-without-extension.md)

**Role:** Support for files without extensions (.env, .gitignore, LICENSE, etc.)

- Empty string registered as extension in extraExtensions
- How Obsidian's file system treats extension-less files
- Automatic opening in Monaco for all extension-less files
- **Key for:** Understanding dotfile and extension-less file support

---

## 🐛 Bug Fixes & Technical Solutions

### [diff-editor-singleton-fix.md](diff-editor-singleton-fix.md)

**Role:** Fix for InstantiationService has been disposed error

- Problem: Disposing diff editor corrupted shared Monaco services
- Solution: Singleton pattern — create once, reuse, never dispose
- Implementation in monacoEditor.html
- **Key for:** Understanding Monaco service lifecycle and singleton patterns

---

## 📊 Project Information

### [project-overview.md](project-overview.md)

**Role:** Current state and feature inventory

- Core features ranked by importance
- Monaco Editor integration details
- Formatting capabilities (15+ languages)
- Hidden files management
- Visual indicators and save strategies
- **Key for:** Understanding what the plugin does and its key capabilities

### [POINTS_TO_CONSIDER.md](POINTS_TO_CONSIDER.md)

**Role:** Important technical considerations and notes

- Key technical points and decisions
- Implementation constraints and trade-offs
- **Key for:** Understanding critical technical decisions

---

## 🛠️ Technical References

### [Info-tech-monaco.md](Info-tech-monaco.md)

**Role:** Monaco Editor API reference sheet

- Complete API documentation for monaco.editor
- Editor options, actions, models, decorations
- Keyboard shortcuts and custom keybindings
- **Key for:** Looking up Monaco API methods and options

### [Rules-doc.md](Rules-doc.md)

**Role:** Documentation guidelines and conventions

- Document types and writing rules
- Code example standards
- Document structure requirements
- List of revised/updated documents
- **Key for:** Following documentation standards

---

## 🔗 Quick Reference by Category

### For Adding Features:

1. [adding-features.md](adding-features.md) — Complete workflow
2. [monaco-commands.md](monaco-commands.md) — Editor commands
3. [configuration-cascade.md](configuration-cascade.md) — Config system

### For Understanding Architecture:

1. [architecture.md](architecture.md) — System overview
2. [monaco-local-integration.md](monaco-local-integration.md) — Local Monaco setup
3. [cross-file-navigation.md](cross-file-navigation.md) — Code navigation

### For Formatting:

1. [prettier-markdown-formatting.md](prettier-markdown-formatting.md) — Prettier languages
2. [adding-formatters-guide.md](adding-formatters-guide.md) — WASM formatters
3. [format-diff-revert.md](format-diff-revert.md) — Diff and revert UI

### For Configuration:

1. [settings-refactor.md](settings-refactor.md) — Settings structure
2. [configuration-cascade.md](configuration-cascade.md) — Config priority
3. [config-migration-strategy.md](config-migration-strategy.md) — Migration approach

### For Troubleshooting:

1. [diff-editor-singleton-fix.md](diff-editor-singleton-fix.md) — Diff editor errors
2. [files-without-extension.md](files-without-extension.md) — Extension-less files

---

## 📝 Maintenance Notes

- **Last Updated:** 2026-04-26
- **Total Documents:** 18
- **Categories:** 7
- **Status:** All documents reviewed and indexed

### Document Status Legend:

- ✅ **Active** — Current and maintained
- 📖 **Reference** — Technical reference material
- 🔧 **Guide** — Step-by-step implementation guide
- 🏗️ **Architecture** — System design and structure

### Update Priority:

When features are added or modified, update:

1. Relevant feature guide (if applicable)
2. [project-overview.md](project-overview.md) — Feature inventory
3. [architecture.md](architecture.md) — If structure changed
4. [README.md](../README.md) — User-facing documentation (always last)
5. This index (add new documents, update descriptions)

---

## 🗂️ Document Scope Clarification

The documents in this repository serve different audiences and purposes. Understanding which layer a document belongs to helps decide when to update it.

### Layer 1 — Original Repo Baseline

Describes what existed before the major refactor: the external Monaco CDN setup, the original settings schema, the initial extension system. These documents provide historical context and justify current decisions.

- [monaco-local-integration.md](monaco-local-integration.md) — Why we moved away from the CDN
- [config-migration-strategy.md](config-migration-strategy.md) — Why there is no auto-migration

### Layer 2 — Current Architecture

Describes the system as it stands today. These are the primary reference documents and must be kept up to date with every significant change.

- [architecture.md](architecture.md)
- [settings-refactor.md](settings-refactor.md)
- [configuration-cascade.md](configuration-cascade.md)
- [cross-file-navigation.md](cross-file-navigation.md)

### Layer 3 — Feature Guides

Describes specific features added during development: formatting, hidden files, diff viewer, etc. Update when the feature changes, not on every commit.

- [prettier-markdown-formatting.md](prettier-markdown-formatting.md)
- [adding-formatters-guide.md](adding-formatters-guide.md)
- [mermaid-formatting.md](mermaid-formatting.md)
- [format-diff-revert.md](format-diff-revert.md)
- [files-without-extension.md](files-without-extension.md)

### Layer 4 — Problem Resolutions

Documents a specific bug or architectural constraint and its solution. These are write-once references: do not update them, create a new document if a new problem arises.

- [diff-editor-singleton-fix.md](diff-editor-singleton-fix.md)

### Layer 5 — Developer Guides

Step-by-step instructions for contributors. Update when the workflow or API surface changes.

- [adding-features.md](adding-features.md)
- [monaco-commands.md](monaco-commands.md)
- [adding-formatters-guide.md](adding-formatters-guide.md)

---

## 🔄 Documentation Update Protocol

### Strategy: cumulative diff, not commit-by-commit

Do not read commits one by one in chronological order. Intermediate states are noise: code refactored in commit 12 and deleted in commit 18 should not appear in the documentation.

The correct approach is to extract a single cumulative diff between the oldest and newest commit in the range, then compare it against the current state of the files.

```bash
# List the commits in scope (adjust N)
git log --oneline -30
# Cumulative diff for the whole range
git diff HEAD~30 HEAD

# Files touched in that range
git diff --name-only HEAD~30 HEAD

# Scope the diff to one module if the output is too large
git diff HEAD~30 HEAD -- src/myModule/
```

### What to send to the LLM

For each documentation update session, provide:

1. The cumulative diff (HEAD~N..HEAD) for the files in scope
2. The current content of the document(s) to update
3. The current source files in their final state (not intermediate)

Do not send the full git log. Commit messages are useful only to identify intent; the diff is the ground truth.

### Before creating a new document

Read INDEX.md in full and check whether the topic is already covered by an existing document.
If it is, update that document instead of creating a new one.
New documents are only justified when the topic is clearly outside the scope of all existing documents.

### Document update order

Always update in this order to avoid inconsistencies:

0. Layer 4 documents if a new bug was resolved (create, do not edit existing ones)
1. Layer 2 documents (architecture, settings, cascade) if structure changed
2. Layer 3 documents for the affected features
3. [project-overview.md](project-overview.md) feature inventory
4. [README.md](../README.md) user-facing section
5. This index if a document was added or removed

### Updating this index

Update INDEX.md whenever:

- A new document is created (add entry in the right category, update Quick Reference if relevant)
- A document is deleted (remove all references)
- A document's scope changes significantly (update its description)

Do not update INDEX.md for content edits that don't change a document's scope.

### Working from old commits (historical context)

If the goal is to understand why something was built a certain way (not to update current docs), use:

```bash
# Checkout the state of a file at a given commit
git show <hash>:src/myFile.ts

# Compare a file between two points in time
git diff <old-hash> <new-hash> -- src/myFile.ts
```

---

## 🗒️ LLM Prompt Reference

### Standard documentation update prompt

```
Read INDEX.md and follow its update protocol.
Run: git diff HEAD~50 HEAD -- src/
Update the docs to reflect anything in the diff that is not already documented.
Do not rewrite sections that are already accurate.
```
For all commits! Run: git diff $(git rev-list --max-parents=0 HEAD) HEAD
