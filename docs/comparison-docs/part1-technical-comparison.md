# Part 1: Technical Comparison - Legacy vs Current Project

**Previous**: [Project Overview](project-overview.md)  
**Next**: [Part 2: Source Code Analysis](part2-source-analysis.md) (coming soon)

---

This document provides a detailed technical comparison between the legacy project and the current Code Files plugin implementation.

## Table of Contents

1. [Package.json Comparison](#1-packagejson-comparison)
2. [ESBuild Configuration Comparison](#2-esbuild-configuration-comparison)
3. [Project Structure Comparison](#3-project-structure-comparison)
4. [Development Workflow Comparison](#4-development-workflow-comparison)
5. [Key Architectural Differences](#5-key-architectural-differences)
6. [Custom Scripts Features](#6-custom-scripts-features-current-project-only)
7. [Notable Features in Current Project](#7-notable-features-in-current-project)

---

## 1. Package.json Comparison

| Aspect | Legacy Project | Current Project |
|--------|---------------|-----------------|
| **Build System** | `obsidian-plugin-cli` (external framework) | Custom esbuild scripts with `tsx` |
| **Scripts Complexity** | 6 simple scripts | 14 scripts (including shortcuts) |
| **Dev Command** | `obsidian-plugin dev` | `tsx scripts/esbuild.config.ts` |
| **Build Command** | `obsidian-plugin build` | `tsc -noEmit && tsx scripts/esbuild.config.ts production` |
| **Version Management** | `postversion` hook + `version-bump.mjs` | Custom `update-version.ts` (yarn v) |
| **Release Management** | `publish-fast` (external tool) | Custom `release.ts` (yarn r) |
| **Git Operations** | Not included | Custom `acp.ts` (yarn acp/bacp) |
| **ESLint Config** | Inline in package.json (`@lukasbach/base/react`) | Separate `eslint.config.mts` file |
| **Dependencies** | 14 devDependencies | 18 devDependencies |
| **Monaco Integration** | Not included | `monaco-editor` + `monaco-themes` |
| **Formatters** | Not included | `prettier` + `mermaid-formatter` |
| **Type Safety** | TypeScript 4.7.4 | TypeScript 5.8.2 |
| **Node Version** | Volta-managed (18.15.0) | Engine requirement (>=16.0.0) |
| **Package Manager** | Yarn 1.22.19 (Volta) | Yarn >=1.22.0 |

### Scripts Breakdown

#### Legacy Project Scripts
```json
{
  "build": "obsidian-plugin build src/main.ts",
  "dev": "obsidian-plugin dev src/main.ts",
  "postversion": "node version-bump.mjs && yarn build",
  "release": "publish-fast",
  "lint": "eslint .",
  "lint:fix": "eslint . --fix"
}
```

#### Current Project Scripts
```json
{
  "start": "yarn install && yarn dev",
  "dev": "tsx scripts/esbuild.config.ts",
  "build": "tsc -noEmit -skipLibCheck && tsx scripts/esbuild.config.ts production",
  "real": "tsx scripts/esbuild.config.ts production real",
  "acp": "tsx scripts/acp.ts",
  "bacp": "tsx scripts/acp.ts -b",
  "update-version": "tsx scripts/update-version.ts",
  "v": "tsx scripts/update-version.ts",
  "release": "tsx scripts/release.ts",
  "r": "tsx scripts/release.ts",
  "help": "tsx scripts/help.ts",
  "h": "tsx scripts/help.ts",
  "lint": "eslint . --ext .ts",
  "lint:fix": "eslint . --ext .ts --fix",
  "prettier": "prettier --check '**/*.{ts,json}'",
  "prettier:fix": "prettier --write '**/*.{ts,json}'"
}
```

---

## 2. ESBuild Configuration Comparison

| Aspect | Legacy (esbuild.config.mjs) | Current (scripts/esbuild.config.ts) |
|--------|----------------------------|-------------------------------------|
| **File Type** | `.mjs` (JavaScript) | `.ts` (TypeScript) |
| **Lines of Code** | ~45 lines | ~350+ lines |
| **Entry Point** | Single: `src/main.ts` | Dynamic: main.ts + optional styles.css |
| **Build Modes** | 2 modes (dev/prod) | 3 modes (dev/build/real) |
| **Watch Mode** | Simple `context.watch()` | Watch with full asset copying |
| **Output Location** | Current directory only | Smart: plugin dir OR vault path |
| **Vault Detection** | None | `.env` with TEST_VAULT/REAL_VAULT |
| **In-place Development** | Not supported | Detects `.obsidian/plugins` location |
| **Environment Prompts** | None | Interactive prompts for missing paths |
| **Vault Validation** | None | Validates `.obsidian/plugins` structure |
| **Asset Copying** | None | Monaco, themes, formatters, HTML/CSS/JS |
| **Monaco Integration** | None | Copies entire `monaco-editor/min/vs` |
| **Theme Support** | None | Copies `monaco-themes/themes` |
| **Formatter Bundling** | None | Bundles 9 Prettier plugins + Mermaid |
| **Codicon Font** | None | Copies codicon.ttf for CSP compliance |
| **Mermaid Bundling** | None | Custom esbuild for browser IIFE format |
| **Post-build Actions** | None | Conditional file copying based on mode |
| **Error Handling** | Basic | Comprehensive with validation |
| **External Dependencies** | 13 items | 13 items (same list) |

### Key ESBuild Features in Current Project

#### 1. Smart Build Path Resolution
```typescript
async function getBuildPath(isProd: boolean): Promise<string> {
  const useRealVault = process.argv.includes('-r') || process.argv.includes('real');
  
  if (isProd && !useRealVault) {
    return pluginDir; // Build in place
  }
  
  const envKey = useRealVault ? 'REAL_VAULT' : 'TEST_VAULT';
  const vaultPath = process.env[envKey]?.trim();
  
  // Handles missing paths, in-place detection, and validation
}
```

#### 2. Comprehensive Asset Management
- **Monaco Editor**: Full local copy from `node_modules/monaco-editor/min/vs`
- **Monaco Themes**: 50+ themes from `node_modules/monaco-themes/themes`
- **Prettier Formatters**: 9 language plugins (standalone, markdown, estree, typescript, babel, postcss, html, yaml, graphql)
- **Mermaid Formatter**: Custom bundled for browser with IIFE format
- **Codicon Font**: Copied to avoid CSP blocking in iframe
- **HTML/CSS/JS**: Monaco editor configuration files

#### 3. Three Build Modes

| Mode | Command | Output Location | Use Case |
|------|---------|----------------|----------|
| **Dev** | `yarn dev` | TEST_VAULT or in-place | Development with hot reload |
| **Build** | `yarn build` | Plugin directory | Production build for distribution |
| **Real** | `yarn real` | REAL_VAULT | Install to production vault |

---

## 3. Project Structure Comparison

| Aspect | Legacy Project | Current Project |
|--------|---------------|-----------------|
| **Source Organization** | Flat `src/` (11 files) | Organized `src/` with subdirectories |
| **Subdirectories** | None | `editor/`, `modals/`, `types/`, `ui/`, `utils/` |
| **Total Source Files** | 11 files | 30+ files |
| **Monaco Assets** | None | `vs/` folder (local Monaco) |
| **Themes** | Inline in `themes.ts` | `monaco-themes/` folder (50+ themes) |
| **Formatters** | None | `formatters/` folder (10 files) |
| **Documentation** | `dev.md`, `README.md` | `docs/` folder (11 detailed docs) |
| **Templates** | None | `templates/` with test samples |
| **Scripts Folder** | None | `scripts/` with 6 utility scripts |
| **GitHub Workflows** | None | `.github/workflows/` with release automation |
| **Amazon Q Rules** | None | `.amazonq/rules/` with 3 rules |
| **Configuration Files** | 6 files | 10+ files |

### Legacy Project Structure
```
legacy-project/
├── src/
│   ├── chooseCssFileModal.ts
│   ├── codeEditorView.ts
│   ├── codeFilesPlugin.ts
│   ├── codeFilesSettingsTab.ts
│   ├── common.ts
│   ├── createCodeFileModal.ts
│   ├── fenceEditContext.ts
│   ├── fenceEditModal.ts
│   ├── getLanguage.ts
│   ├── main.ts
│   ├── mountCodeEditor.ts
│   └── themes.ts
├── esbuild.config.mjs
├── version-bump.mjs
├── package.json
├── manifest.json
└── README.md
```

### Current Project Structure
```
obsidian-code-files-modif/
├── src/
│   ├── editor/
│   │   ├── codeEditorView.ts
│   │   ├── monacoEditor.html
│   │   ├── monacoHtml.css
│   │   ├── monacoHtml.js
│   │   └── mountCodeEditor.ts
│   ├── modals/
│   │   ├── chooseCssFileModal.ts
│   │   ├── chooseExtensionModal.ts
│   │   ├── chooseHiddenFileModal.ts
│   │   ├── chooseThemeModal.ts
│   │   ├── confirmation.ts
│   │   ├── createCodeFileModal.ts
│   │   ├── editorSettingsModal.ts
│   │   ├── fenceEditModal.ts
│   │   └── renameExtensionModal.ts
│   ├── types/
│   │   └── types.ts
│   ├── ui/
│   │   ├── codeFilesSettingsTab.ts
│   │   ├── commands.ts
│   │   ├── contextMenus.ts
│   │   ├── extensionSuggest.ts
│   │   ├── folderSuggest.ts
│   │   └── ribbonIcon.ts
│   ├── utils/
│   │   ├── broadcast.ts
│   │   ├── explorerUtils.ts
│   │   ├── extensionUtils.ts
│   │   ├── fenceEditContext.ts
│   │   ├── getLanguage.ts
│   │   ├── modalPatch.ts
│   │   ├── settingsUtils.ts
│   │   ├── snippetUtils.ts
│   │   └── themeUtils.ts
│   ├── main.ts
│   └── mermaid-formatter-bundle-entry.js
├── scripts/
│   ├── acp.ts
│   ├── esbuild.config.ts
│   ├── help.ts
│   ├── release.ts
│   ├── update-version.ts
│   └── utils.ts
├── docs/
│   ├── adding-features.md
│   ├── architecture.md
│   ├── config-migration-strategy.md
│   ├── cross-file-navigation.md
│   ├── diff-editor-singleton-fix.md
│   ├── format-diff-revert.md
│   ├── mermaid-formatting.md
│   ├── monaco-commands.md
│   ├── monaco-local-integration.md
│   ├── prettier-markdown-formatting.md
│   └── refactoring_tasks.md
├── formatters/
│   ├── mermaid-formatter.js
│   ├── prettier-standalone.js
│   ├── prettier-markdown.js
│   ├── prettier-estree.js
│   ├── prettier-typescript.js
│   ├── prettier-babel.js
│   ├── prettier-postcss.js
│   ├── prettier-html.js
│   ├── prettier-yaml.js
│   └── prettier-graphql.js
├── monaco-themes/
│   └── [50+ theme JSON files]
├── vs/
│   └── [Monaco Editor assets]
├── templates/
│   ├── format-test-samples/
│   └── projet-test-sample/
├── .github/
│   └── workflows/
│       └── release.yml
├── .amazonq/
│   └── rules/
│       ├── Commentaires.md
│       ├── search.md
│       └── yarn_lint.md
└── [configuration files]
```

---

## 4. Development Workflow Comparison

| Feature | Legacy Project | Current Project |
|---------|---------------|-----------------|
| **Development Location** | Must be in vault plugins folder | External folder OR in-place in plugins folder |
| **Hot Reload** | Via `obsidian-plugin dev` | Via `yarn dev` (watch mode) |
| **Production Build** | `yarn build` (in-place) | `yarn build` (in-place) OR `yarn real` (to vault) |
| **Version Update** | `yarn version` + manual edit | `yarn v` (interactive CLI) |
| **Release Process** | `yarn release` (publish-fast) | `yarn r` (custom with tag overwrite) |
| **Git Operations** | Manual | `yarn acp` (add/commit/push) |
| **Build with Git** | Not available | `yarn bacp` (build + acp) |
| **Environment Setup** | None | `.env` file with vault paths |
| **Restart Plugin** | Manual | Alt+R in Obsidian (mentioned) |
| **Lint** | `yarn lint` | `yarn lint` (selective per file) |
| **Format** | Not included | `yarn prettier` / `prettier:fix` |

### Current Project Workflow Details

#### 1. Initial Setup

**Option A: External Development (Recommended)**
```bash
git clone https://github.com/3C0D/obsidian-plugin-config.git
cd obsidian-plugin-config
yarn install
```

Create `.env` file:
```env
TEST_VAULT=C:\path\to\test\vault
REAL_VAULT=C:\path\to\real\vault
```

**Option B: In-place Development**
```bash
cd /path/to/vault/.obsidian/plugins/
git clone https://github.com/3C0D/obsidian-plugin-config.git plugin-name
cd plugin-name
yarn install
yarn build    # Builds directly in the plugin folder
```

No `.env` file needed - the build script detects it's already in the plugins folder.

#### 2. Development Cycle
```bash
yarn start    # Install dependencies + start dev mode
# or
yarn dev      # Start watch mode → builds to TEST_VAULT (or in-place)
```

In Obsidian: `Alt+R` to restart plugin with save

#### 3. Version Management
```bash
yarn v        # Interactive version update
# Prompts:
# - patch (1.0.1) → type 1 or p
# - minor (1.1.0) → type 2 or min
# - major (2.0.0) → type 3 or maj
# - or enter version number directly (e.g., 2.0.0)
```

Updates:
- `manifest.json`
- `package.json`
- `versions.json`
- Commits changes
- Pushes to GitHub

#### 4. Release Process
```bash
yarn r        # Create GitHub release
# Prompts for commit message
# Can overwrite existing tags
# Creates release-body.md
# Pushes tag to GitHub
```

#### 5. Git Operations
```bash
yarn acp      # Add, commit, push
yarn bacp     # Build + add, commit, push
```

#### 6. Production Build
```bash
yarn build    # Build in plugin directory
yarn real     # Build + install to REAL_VAULT
```

---

## 5. Key Architectural Differences

| Aspect | Legacy Project | Current Project |
|--------|---------------|-----------------|
| **Monaco Loading** | External CDN/iframe | Local bundled files |
| **Dependency Philosophy** | External tools (CLI, publish-fast) | Self-contained custom scripts |
| **Configuration** | Framework-driven | Script-driven with full control |
| **Asset Management** | None | Comprehensive (Monaco, themes, formatters) |
| **Build Complexity** | Simple (delegated to CLI) | Complex (full control) |
| **Flexibility** | Limited by CLI | Unlimited (custom scripts) |
| **Maintenance** | Depends on external tools | Self-maintained |
| **Learning Curve** | Lower (use CLI) | Higher (understand scripts) |
| **Customization** | Limited | Extensive |
| **Release Automation** | Via publish-fast | Custom with tag overwrite support |

### Philosophy Shift

#### Legacy Approach
- **Pros**: Simple, quick setup, less code to maintain
- **Cons**: Limited control, dependent on external tools, less flexibility
- **Best for**: Simple plugins, rapid prototyping

#### Current Approach
- **Pros**: Full control, highly customizable, self-contained, no external dependencies
- **Cons**: More complex, more code to maintain, steeper learning curve
- **Best for**: Complex plugins, production-ready applications, long-term maintenance

---

## 6. Custom Scripts Features (Current Project Only)

### 6.1 esbuild.config.ts

**Purpose**: Smart build system with vault detection and asset management

**Features**:
- Three build modes (dev/build/real)
- Automatic vault path detection
- Interactive prompts for missing configuration
- Vault structure validation
- Comprehensive asset copying
- Monaco editor integration
- Prettier formatter bundling
- Mermaid formatter bundling (IIFE format)
- Codicon font copying for CSP compliance

**Usage**:
```bash
yarn dev      # Watch mode → TEST_VAULT
yarn build    # Production → plugin directory
yarn real     # Production → REAL_VAULT
```

### 6.2 update-version.ts

**Purpose**: Interactive version management

**Features**:
- Interactive CLI prompts
- Semantic versioning (patch/minor/major)
- Direct version number input
- Updates manifest.json, package.json, versions.json
- Automatic git commit
- Automatic git push
- Git sync verification

**Usage**:
```bash
yarn v
# or
yarn update-version

# Prompts:
# Current version: 1.0.0
# Kind of update:
#     patch(1.0.1) -> type 1 or p
#     minor(1.1.0) -> type 2 or min
#     major(2.0.0) -> type 3 or maj
#     or version number (e.g. 2.0.0)
# Enter choice: _
```

### 6.3 release.ts

**Purpose**: GitHub release automation with tag management

**Features**:
- Creates annotated git tags
- Generates release notes
- Overwrites existing tags (with confirmation)
- Multi-line commit messages (use `\n`)
- Automatic git push
- Creates `.github/workflows/release-body.md`
- Git sync verification

**Usage**:
```bash
yarn r
# or
yarn release

# Prompts:
# Enter the commit message for version 1.0.0: _
# (Use \n for line breaks)
```

**Tag Overwrite**:
If tag exists, prompts:
```
Tag 1.0.0 already exists.

Existing tag message:
[shows existing message]

Do you want to replace it? (y/n): _
```

### 6.4 acp.ts

**Purpose**: Git add/commit/push automation

**Features**:
- Adds all changes
- Interactive commit message
- Automatic push
- Handles new branches (sets upstream)
- Optional build before commit (`-b` flag)
- Git sync verification

**Usage**:
```bash
yarn acp       # Add, commit, push
yarn bacp      # Build + add, commit, push
```

### 6.5 help.ts

**Purpose**: Display available commands

**Usage**:
```bash
yarn h
# or
yarn help
```

### 6.6 utils.ts

**Purpose**: Shared utilities for all scripts

**Features**:
- `createReadlineInterface()`: CLI input handling
- `askQuestion()`: Prompt user for input
- `askConfirmation()`: Yes/no prompts
- `cleanInput()`: Sanitize user input
- `gitExec()`: Execute git commands
- `ensureGitSync()`: Verify repo is synced before push
- `isValidPath()`: Path validation
- `copyFilesToTargetDir()`: Copy plugin files to vault

---

## 7. Notable Features in Current Project

### 7.1 Tag Overwrite Support
Unlike most release tools, the current project allows overwriting existing GitHub release tags. This is useful for:
- Fixing release notes
- Updating release assets
- Correcting version mistakes

### 7.2 Interactive Vault Configuration
When vault paths are missing from `.env`, the build script:
1. Detects the missing configuration
2. Prompts the user for the path
3. Validates the path structure
4. Updates the `.env` file automatically
5. Continues with the build

### 7.3 In-place Development Detection
The build script detects if you're already working inside an Obsidian vault's plugins folder and adapts accordingly:
- If in `.obsidian/plugins/`: builds in place (no `.env` needed)
- If external: uses TEST_VAULT or REAL_VAULT from `.env`

This allows two development approaches:
1. **External**: Develop outside vault, build copies to TEST_VAULT/REAL_VAULT
2. **In-place**: Develop directly in vault's plugins folder, build in place

### 7.4 Git Sync Verification
Before any push operation, the scripts verify:
- Local branch is up to date with remote
- No conflicts exist
- Safe to push

This prevents common git issues and merge conflicts.

### 7.5 Comprehensive Asset Management
The build process automatically:
- Copies Monaco editor (full local copy)
- Copies 50+ Monaco themes
- Bundles 9 Prettier formatters
- Bundles Mermaid formatter (custom IIFE format)
- Copies Codicon font for CSP compliance
- Copies HTML/CSS/JS configuration files

All assets are local, no external dependencies at runtime.

### 7.6 Multi-line Release Notes
The release script supports multi-line commit messages using `\n`:
```bash
yarn r
# Enter: "Feature: Added new formatter\nFixed: Bug in theme picker\nDocs: Updated README"
```

Creates properly formatted release notes on GitHub.

### 7.7 Conditional File Copying
The build script intelligently copies files based on mode:
- **Dev mode**: Copies all assets to TEST_VAULT
- **Build mode**: Builds in place, no copying
- **Real mode**: Copies all assets to REAL_VAULT

### 7.8 Type-safe Build Configuration
The entire build system is written in TypeScript, providing:
- Type checking at build time
- IntelliSense in IDE
- Compile-time error detection
- Better maintainability

---

### 7.9 Plugin Size

The current project with all assets (Monaco, themes, formatters) weighs approximately **17.5 MB**.

Breakdown:
- Monaco Editor (`vs/` folder): ~12 MB
- Monaco Themes: ~2 MB
- Prettier Formatters: ~2 MB
- Mermaid Formatter: ~0.5 MB
- Plugin code: ~1 MB

This is significantly larger than typical Obsidian plugins due to the embedded Monaco editor and all its assets being bundled locally for offline use.

---

## Summary

The current project represents a significant evolution from the legacy version:

### Key Improvements
1. **Full Control**: Custom scripts replace external frameworks
2. **Local Assets**: Monaco, themes, and formatters bundled locally
3. **Smart Workflows**: Interactive prompts and intelligent path detection
4. **Git Integration**: Automated version management and releases
5. **Type Safety**: TypeScript throughout, including build scripts
6. **Flexibility**: Three build modes for different scenarios
7. **Documentation**: Comprehensive docs folder with 11 detailed guides
8. **Organization**: Well-structured source code with clear separation of concerns

### Trade-offs
- **Complexity**: More code to understand and maintain
- **Learning Curve**: Requires understanding custom scripts
- **Maintenance**: Self-maintained vs. relying on external tools

### Recommendation
The current approach is ideal for:
- Production-ready plugins
- Long-term maintenance
- Complex features requiring full control
- Projects needing local asset management
- Teams wanting independence from external tools

The legacy approach remains valid for:
- Simple plugins
- Rapid prototyping
- Learning Obsidian plugin development
- Projects comfortable with external dependencies
