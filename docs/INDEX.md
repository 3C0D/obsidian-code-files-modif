# Code Files Plugin — Documentation Index

> Internal documentation for developers and LLMs working on the plugin.
> See [Rules-doc.md](Rules-doc.md) for documentation writing guidelines.

---

## Core Architecture

| Document | Purpose |
|----------|---------|
| [project-overview.md](project-overview.md) | Project origin, scope, and high-level design decisions |
| [architecture.md](architecture.md) | Full plugin architecture: modules, iframe isolation, CodeEditorView lifecycle |
| [monaco-initialization-flow.md](monaco-initialization-flow.md) | Step-by-step editor initialization: blob URL → iframe → ready promise → init message |
| [performance.md](performance.md) | Performance strategies: deferred startup, parallel asset loading, caching |

## Features & Mechanisms

| Document | Purpose |
|----------|---------|
| [configuration-cascade.md](configuration-cascade.md) | EditorConfig resolution chain: global settings → per-extension JSON → Monaco options |
| [cross-file-navigation.md](cross-file-navigation.md) | Ctrl+Click navigation: project root, tsconfig path aliases, model registration |
| [hidden-files-system.md](hidden-files-system.md) | Dotfile visibility: adapter patches, reveal/unreveal, eye badges, auto-reveal |
| [format-diff-revert.md](format-diff-revert.md) | Format on save → diff detection → visual diff modal → revert widget |
| [console.md](console.md) | Integrated console: process management, stdin/stdout, CWD tracking, shell cycling |
| [editor-actions.md](editor-actions.md) | Monaco context menu actions, hotkey system, Obsidian ↔ Monaco bridging |
| [monaco-commands.md](monaco-commands.md) | Command registration guide: addAction vs addCommand, focus handling, dynamic hotkeys |
| [external-files.md](external-files.md) | Opening files outside the vault: CSS snippets, configDir files, persistence |
| [files-without-extension.md](files-without-extension.md) | Dotfiles (.env, .gitignore): extension detection, badge display, registration |
| [terminal.md](terminal.md) | Terminal feature: architecture, security, future plans |

## Formatting & Language Support

| Document | Purpose |
|----------|---------|
| [adding-formatters-guide.md](adding-formatters-guide.md) | How to add a new formatter (WASM or JS bundle) |
| [mermaid-formatting.md](mermaid-formatting.md) | Mermaid diagram formatting: bundling, registration, markdown block support |
| [prettier-markdown-formatting.md](prettier-markdown-formatting.md) | Prettier integration: standalone builds, plugin loading, markdown+mermaid chain |

## Development Guides

| Document | Purpose |
|----------|---------|
| [adding-features.md](adding-features.md) | Step-by-step guide to add a new feature (files to touch, patterns to follow) |
| [monaco-local-integration.md](monaco-local-integration.md) | Monaco Editor local setup: AMD loader, CSP workarounds, asset pipeline |
| [Info-tech-monaco.md](Info-tech-monaco.md) | Monaco API reference sheet: options, events, models, keybindings |
| [POINTS_TO_CONSIDER.md](POINTS_TO_CONSIDER.md) | Known edge cases, technical debt, and architectural trade-offs |

## Rules

| Document | Purpose |
|----------|---------|
| [Rules-doc.md](Rules-doc.md) | Documentation writing guidelines for LLMs |

## update docs

Run: git diff HEAD~10 HEAD -- src/
Update the docs to reflect anything in the diff that is not already documented. Read index first to see how it's organized.
Do not rewrite sections that are already accurate.
Update ReadMe too if needed
If needed update the readme too.
