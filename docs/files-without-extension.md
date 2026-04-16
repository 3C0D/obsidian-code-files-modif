# Files Without Extension Support

## Summary
Files without extension (`.env`, `.gitignore`, `LICENSE`, `README`, etc.) automatically open in Monaco by registering empty string `""` as an extension in `extraExtensions`. This is the only modification needed.

## The Problem
Obsidian's file system treats files without extension as having `file.extension = ""` (empty string):
- `.env` → `file.extension = ""`
- `LICENSE` → `file.extension = ""`
- `.gitignore` → `file.extension = ""`

These files cannot be registered individually because they all share the same "extension" (none).

## The Solution
Register `""` (empty string) as an extension in `extraExtensions`:

**Location:** `types.ts` - `DEFAULT_SETTINGS`
```typescript
extraExtensions: ['']  // Handles all files without extension
```

**Why `extraExtensions`?**
- Works in both manual and extended modes
- Always included regardless of mode toggle
- Merged with other extensions via `getActiveExtensions()`

## How It Works

When Obsidian tries to open a file:
1. Checks `file.extension` → returns `""`
2. Looks up `""` in registered extensions
3. Finds `viewType = 'code-editor'` registered for `""`
4. Opens file in Monaco instead of default view

## Behavior

### Automatic Opening
All files with `file.extension === ""` open in Monaco:
- `.env`, `.gitignore`, `.dockerignore`
- `LICENSE`, `README`, `Makefile`
- Any file starting with `.` and no extension

### Language Detection
Falls back to `plaintext` since these files aren't in `staticMap`.

## Current Limitation

**Requires external plugin:** Files starting with `.` are hidden by Obsidian by default. Users need a plugin like "Show Hidden Files" to see them in the file explorer.

**Future consideration:** Add "Open Hidden Files" command directly in Code Files plugin.

## Testing

1. Install "Show Hidden Files" plugin (or similar)
2. Create `.env` file in vault
3. Click on `.env` → opens automatically in Monaco
4. Create `LICENSE` file → opens automatically in Monaco

---

**Revised:** ✓
