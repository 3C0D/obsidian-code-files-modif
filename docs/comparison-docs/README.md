# Code Files Plugin - Complete Documentation Index

## Quick Navigation

### User Documentation
- **Main Plugin README** - Complete user guide and feature documentation
- **[Project Overview](project-overview.md)** - Simple introduction without technical jargon

### Development Documentation

#### Project Comparison Series
1. **[Part 1: Technical Comparison](part1-technical-comparison.md)** ✅ Complete
   - Package.json and build system comparison
   - ESBuild configuration analysis
   - Project structure differences
   - Development workflow comparison
   - Custom scripts documentation

2. **[Part 2: Source Code Analysis](part2-source-analysis.md)** 🚧 Coming soon
   - File organization and architecture
   - Code evolution and improvements
   - Module system comparison

3. **[Part 3: Features Comparison](part3-features-comparison.md)** 🚧 Coming soon
   - Feature-by-feature comparison
   - New features in current version
   - Removed or changed features

#### Technical Deep Dives (in main docs folder)
- **monaco-local-integration.md** - How Monaco editor is embedded locally
- **prettier-markdown-formatting.md** - Markdown formatting implementation
- **mermaid-formatting.md** - Mermaid diagram formatting
- **cross-file-navigation.md** - TypeScript/JavaScript navigation system
- **format-diff-revert.md** - Diff viewer and selective revert feature
- **monaco-commands.md** - Command palette integration
- **architecture.md** - Overall plugin architecture
- **diff-editor-singleton-fix.md** - Technical fix documentation
- **config-migration-strategy.md** - Settings migration approach
- **settings-refactor.md** - Settings system refactoring
- **refactoring_tasks.md** - Ongoing refactoring work
- **adding-features.md** - Guide for adding new features

## Documentation Status

| Document | Status | Description |
|----------|--------|-------------|
| Project Overview | ✅ Complete | Non-technical introduction |
| Part 1: Technical Comparison | ✅ Complete | Build system and workflow |
| Part 2: Source Analysis | 🚧 Planned | Code organization |
| Part 3: Features Comparison | 🚧 Planned | Feature comparison |
| Monaco Local Integration | ✅ Complete | Monaco embedding |
| Prettier Markdown Formatting | ✅ Complete | Markdown formatting |
| Mermaid Formatting | ✅ Complete | Mermaid formatting |
| Cross-file Navigation | ✅ Complete | TS/JS navigation |
| Format Diff & Revert | ✅ Complete | Diff viewer |
| Architecture | ✅ Complete | Plugin architecture |

## Quick Facts

### Plugin Size
**~17.5 MB** (with all assets)
- Monaco Editor: ~12 MB
- Themes: ~2 MB
- Formatters: ~2 MB
- Plugin code: ~1 MB

### Installation Methods
1. **Download release** - Extract zip to `.obsidian/plugins/`
2. **Git clone + build** - External or in-place development

### Key Technologies
- TypeScript 5.8.2
- Monaco Editor 0.55.1
- ESBuild (custom configuration)
- Prettier (9 language plugins)
- Mermaid Formatter

### Development Commands
```bash
yarn start    # Install + dev mode
yarn dev      # Watch mode
yarn build    # Production build
yarn real     # Install to vault
yarn v        # Update version
yarn r        # Create release
yarn acp      # Git add/commit/push
```

## For New Contributors

Start here:
1. Read [Project Overview](project-overview.md) - Understand what this plugin does
2. Read main plugin README - Learn all features
3. Read [Part 1: Technical Comparison](part1-technical-comparison.md) - Understand the build system
4. Read architecture.md (in main docs) - Understand the code structure
5. Read adding-features.md (in main docs) - Learn how to contribute

## For Users

Start here:
1. Read main plugin README - Complete user guide
2. Try examples in `templates/format-test-samples/` - Test formatting
3. Try examples in `templates/projet-test-sample/` - Test cross-file navigation

## Project Evolution

### Legacy Version (v1.x)
- Simple external framework
- Basic Monaco integration
- Limited features
- ~11 source files

### Current Version (v2.x)
- Custom build system
- Local Monaco integration
- 50+ themes
- Advanced formatting
- Cross-file navigation
- ~30+ source files
- Comprehensive documentation

## Support

- **Issues**: GitHub Issues
- **Discussions**: GitHub Discussions
- **Documentation**: This `docs/` folder
- **Examples**: `templates/` folder

---

**Last Updated**: 2024
**Maintained by**: 3C0D
