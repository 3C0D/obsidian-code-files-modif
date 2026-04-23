# Configuration Migration Strategy

## Summary

No automatic migration implemented. Uses simple three-level fallback: DEFAULT → Global (\*) → Per-Extension. Users can reset configs by deleting them to get fresh templates.

## The Problem

When developers add new commented properties to default templates (e.g., `// "fontSize": 14`), existing user configs don't receive these updates automatically.

**Example:**

1. User saves `.ts` config: `{ "tabSize": 2 }`
2. Developer adds `// "fontSize": 14` to default template
3. User reopens `.ts` config → only sees `{ "tabSize": 2 }`, missing new option

## Current Solution: Simple Fallback

### Three-Level Cascade

```
DEFAULT_EDITOR_CONFIG → Global (*) → Per-Extension (.ts)
```

### How It Works

- **Fresh configs** → use default template with comments
- **Saved configs** → stored permanently via `plugin.saveData()` (Obsidian's plugin storage)
- **Missing configs** → fall back to default template

### Implementation

**Locations:** `settingsUtils.ts`, `buildMergedConfig()`

- `loadSettings()` ensures global config exists
- `parseEditorConfig()` strips comments before parsing
- No automatic merging or migration

## User Experience

### To Get New Options

1. **Check global config (`*`)** → see all available options
2. **Copy to per-extension** → manual copy/paste
3. **Reset config** → delete content, reopen for fresh template
4. **Check README** → for new features

### Editor Settings Modal

- **Two buttons:** Global (\*) and .extension
- **Auto-save** with debouncing
- **Fresh templates** for first-time users

## Why No Automatic Migration?

1. **Risk of corruption** — JSONC parsing complex, could break configs
2. **User expectations** — saved configs should remain unchanged
3. **Simple workarounds** — delete to reset, copy from global
4. **Most users don't need every option** — defaults include common examples

## Alternatives Considered (Not Implemented)

### 1. "Show All Options" Button

**Pros:** User control, no automatic changes
**Cons:** Complex JSONC parsing, risk of overwriting comments
**Status:** Too risky for benefit

### 2. Automatic Migration on Update

**Pros:** Users get new options automatically
**Cons:** High corruption risk, complex logic, hard to test
**Status:** Too dangerous

## Recommendation

**Keep current simple system.** Safe, predictable, easy to understand.

## Future Considerations

If migration becomes necessary:

1. Version tracking in plugin settings (via `plugin.saveData()`)
2. Migration functions per version
3. Extensive testing with edge cases
4. Rollback mechanism
5. Change logging

But simple fallback is sufficient and safer for now.

---

**Revised:** ✓
