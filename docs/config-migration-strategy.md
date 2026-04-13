# Configuration Migration Strategy

## The Problem

When updating `DEFAULT_EDITOR_CONFIG` or `DEFAULT_EXTENSION_CONFIG` with new commented properties (e.g., adding `// "fontSize": 14`), existing user configurations don't automatically receive these new template comments.

**Example scenario:**
1. User opens config for `.ts`, sees default template with comments
2. User uncomments `"tabSize": 2` and saves
3. Developer adds `// "fontSize": 14` to `DEFAULT_EXTENSION_CONFIG`
4. Plugin recompiles and restarts
5. User reopens config for `.ts` → **only sees** `{ "tabSize": 2 }`, **not** the new `fontSize` comment

## Why This Happens

Configs are stored as JSONC strings in `data.json`. Once saved, they're frozen. The fallback to default templates only applies when a config key doesn't exist.

## Current Solution: Simple Fallback System

**No automatic migration is implemented.** The system uses a three-level cascade:

```
DEFAULT_EDITOR_CONFIG → Global (*) → Per-Extension (.ts)
```

**How it works:**
- If a config key doesn't exist in `data.json`, it falls back to the default template
- Once a user saves a config, it's stored permanently
- Users can reset by deleting the config (it will fall back to the fresh template)

**Implementation:**
- `loadSettings()` in `settingsUtils.ts` ensures global config always exists
- `buildMergedConfig()` merges global + per-extension configs
- `parseEditorConfig()` strips comments and trailing commas before parsing

## Why No Automatic Migration?

1. **Risk of data corruption** — JSONC parsing is complex, could break user configs
2. **User expectations** — Users expect their saved configs to remain unchanged
3. **Simple workarounds exist** — Delete config to get fresh template, or copy from global config
4. **Most users don't need every option** — Default templates include common examples

## User Experience

**Editor Settings Modal (⚙️ gear icon):**
- Two buttons: **Global (*)** and **.extension**
- Switch between them to edit global or per-extension configs
- Changes save automatically (debounced)
- First-time users see the default template with commented examples

**To reset a config:**
- Delete all content in the editor, or
- Manually delete the key from `data.json`
- Reopen → fresh template appears

## Alternative Approaches Considered (Not Implemented)

### 1. UI-Based "Show All Options" Button
Add a button to merge new default properties into existing config.

**Pros:** User control, no automatic changes  
**Cons:** Complex JSONC parsing, risk of overwriting user comments  
**Status:** Not implemented — "delete and reopen" is simpler and safer

### 2. Automatic Migration on Plugin Update
Detect version changes and auto-merge new properties.

**Pros:** Users automatically get new options  
**Cons:** High risk of corruption, complex logic, difficult to test  
**Status:** Not implemented — too risky for the benefit

## Recommendation

**Keep the current simple fallback system.** It's safe, predictable, and easy to understand.

If users need new options:
1. Check README or release notes
2. Open global config (`*`) to see all available options
3. Copy properties to per-extension config
4. Or delete config to get fresh template

## Future Considerations

If automatic migration becomes necessary (e.g., breaking changes):
1. Implement version tracking in `data.json`
2. Write migration functions per version
3. Test extensively with edge cases
4. Provide rollback mechanism
5. Log changes to users

But for now, the simple fallback system is sufficient and safer.
