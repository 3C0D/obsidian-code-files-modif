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

### [architecture-iframe.md](architecture-iframe.md)

**Role:** Internal architecture of the Monaco iframe application

- File tree of `src/editor/iframe/`
- Responsibilities of `init.ts`, `actions.ts`, `formatters.ts`, `diff.ts`, `console.ts`, and support modules
- Parent ↔ iframe communication model
- Shared state wiring between iframe modules
- **Key for:** Understanding how the iframe bundle is structured internally

### [architecture-code-editor-view.md](architecture-code-editor-view.md)

**Role:** CodeEditorView component architecture

- File opening flow and editor mounting
- Content change handling and save operations
- Header actions and extension badges
- **Key for:** Understanding the view component lifecycle

### [Voici les grands chemins logiques de `Co.md](Voici les grands chemins logiques de `Co.md)

**Role:** Logical paths and workflows in CodeEditorView

- File opening, content modification, and settings changes
- Detailed flow descriptions for key operations
- **Key for:** Understanding CodeEditorView logical workflows

### [monaco-initialization-flow.md](monaco-initialization-flow.md)
 
**Role:** Monaco initialization, ready handshake and synchronization mechanism
 
- Deferred Promise pattern for cross-iframe sync
- Ready / ResolveReady handshake flow
- Why 'ready' is special (sent before context)
- Use cases: awaiting ready before sending commands (scroll-to-position, etc.)
- **Key for:** Understanding how to safely interact with the editor handle
 
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

- Complete plugin settings schema with all fields
- **Key for:** Understanding where plugin settings live and how they're organized

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

### [editor-actions.md](editor-actions.md)

**Role:** Detailed guide to editor actions and keybindings system

- Dynamic hotkey overrides for Obsidian commands (palette, settings, delete)
- Direct plugin hotkeys (console)
- Keybinding registration and update flow
- **Key for:** Understanding the complete actions and shortcuts system

---

## 🌐 Cross-File Navigation

### [cross-file-navigation.md](cross-file-navigation.md)

**Role:** TypeScript/JavaScript import navigation (Ctrl+Click)

- Project Root Folder setup and configuration
- Loading TS/JS files into Monaco's TypeScript service
- Navigation flow: Ctrl+Click → open-file message → Obsidian opens file
- **Key for:** Understanding how code navigation works across files

---

## 📁 External Files & Browser

### [external-files-persistence.md](external-files-persistence.md)

**Role:** External files persistence system

- Managing files outside the vault
- Persistence strategies and integration
- **Key for:** Understanding external file handling

### [external-file-browser-modal.md](external-file-browser-modal.md)

**Role:** External file browser modal

- File browsing interface for external files
- Modal implementation and user interaction
- **Key for:** Understanding external file selection UI

---

## 📁 Hidden Files & Extensions

### [files-without-extension.md](files-without-extension.md)

**Role:** Support for files and folders without extensions, including editor configuration and integration with hidden files system

- Register empty string as extension for automatic Monaco opening
- Extension mapping system for per-file editor configuration
- Language fallback cascade (e.g., .clangformat inherits YAML config)
- Broadcasting config changes and file creation fixes
- Built-in dotfile/dotfolder management with auto-reveal, manual control, and symlink detection
- **Key for:** Understanding dotfile support, configuration, and hidden item integration

### [hidden-files-eye-badge-system.md](hidden-files-eye-badge-system.md)

**Role:** Eye badge system for manually revealed hidden files and folders, with patches and performance improvements

- Eye badge (👁️) on folders containing manually revealed dotfiles or dotfolders
- Management via `decorateFolders()` and `revealedItems` settings (supports files and folders)
- Integration with reveal/hide operations, vault events, and extension registration
- Patches for adapter operations (deletion, rename, file opening), with symlink detection
- Bug fixes for drag-and-drop and trash operations, cross-platform reconciliation
- **Key for:** Understanding badge behavior, hidden item management, and system patches

### [explorer-badges-system.md](explorer-badges-system.md)

**Role:** Extension badges system (dotfiles and unregistered files) in the file explorer

- Automatic uppercase extension badges for dotfiles (.ENV, .GITIGNORE)
- "Unregistered" visual indicators for file types not natively supported by Obsidian
- O(1) performance via targeted MutationObserver updates with DOM-based badge application
- Architecture layers: `applyBadge`, `scanAll`, and `reattachObservers`
- **Key for:** Understanding explorer visual indicators and performance-optimized DOM monitoring

---

## 🖥️ Console System

### [console.md](console.md)

**Role:** Console pane implementation and management

- Console UI architecture and message handling
- History persistence and command execution
- Integration with Monaco editor pane system
- **Key for:** Understanding console functionality and persistence

### [console_ui_redesign.md](console_ui_redesign.md)

**Role:** Console UI redesign and improvements

- UI/UX enhancements for console interface
- Layout and interaction improvements
- **Key for:** Console UI evolution and design decisions

### [console_evolution_plan.md](console_evolution_plan.md)

**Role:** Planned evolution of console features

- Future enhancements and roadmap
- Technical considerations for expansion
- **Key for:** Understanding console development direction

### [console_upgrade_spec.md](console_upgrade_spec.md)

**Role:** Console upgrade specifications

- Technical specifications for console improvements
- Implementation details and requirements
- **Key for:** Console upgrade planning

### [terminal.md](terminal.md)

**Role:** Terminal integration and functionality

- Terminal features and integration points
- Command execution and output handling
- **Key for:** Understanding terminal capabilities

---

## 🐛 Bug Fixes & Technical Solutions

### [diff-editor-singleton-fix.md](diff-editor-singleton-fix.md)

**Role:** Fix for InstantiationService has been disposed error

- Problem: Disposing diff editor corrupted shared Monaco services
- Solution: Singleton pattern — create once, reuse, never dispose
- Implementation in monacoEditor.html
- **Key for:** Understanding Monaco service lifecycle and singleton patterns

### [automatic-obsidian-reload.md](automatic-obsidian-reload.md)

**Role:** Automatic Obsidian reload mechanism

- Triggering reloads after hotkey changes
- Integration with settings changes
- **Key for:** Understanding automatic update flows

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

### [monaco_iframe_ts_migration_plan.md](monaco_iframe_ts_migration_plan.md)

**Role:** Monaco iframe TypeScript migration planning

- Migration strategy from JavaScript to TypeScript
- Implementation steps and challenges
- **Key for:** Understanding iframe migration process

### [monaco-iframe-typescript-migration.md](monaco-iframe-typescript-migration.md)

**Role:** Detailed TypeScript migration for Monaco iframe

- Technical details of TypeScript adoption
- Code changes and type definitions
- **Key for:** Migration implementation details

### [raccourcis-menu-contextuel.md](Archives/raccourcis-menu-contextuel.md)

**Role:** Context menu shortcuts guide (French)

- Raccourcis dans le menu contextuel de Monaco
- Système de raccourcis dynamiques et directs
- **Key for:** Understanding menu shortcuts system

---

## 🔗 Quick Reference by Category

### For Adding Features:

1. [adding-features.md](adding-features.md) — Complete workflow
2. [monaco-commands.md](monaco-commands.md) — Editor commands
3. [editor-actions.md](editor-actions.md) — Actions and keybindings
4. [configuration-cascade.md](configuration-cascade.md) — Config system

### For Understanding Architecture:

1. [architecture.md](architecture.md) — System overview
2. [monaco-initialization-flow.md](monaco-initialization-flow.md) — Initialization flow
3. [monaco-local-integration.md](monaco-local-integration.md) — Local Monaco setup
4. [cross-file-navigation.md](cross-file-navigation.md) — Code navigation

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
3. [hidden-files-eye-badge-system.md](hidden-files-eye-badge-system.md) — Hidden files badges

---

## 📝 Maintenance Notes

- **Last Updated:** 2026-05-14
- **Total Documents:** 33
- **Categories:** 11
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
Run: git diff HEAD~20 HEAD -- src/
Update the docs to reflect anything in the diff that is not already documented.
Do not rewrite sections that are already accurate.
```
For all commits! Run: git diff $(git rev-list --max-parents=0 HEAD) HEAD
