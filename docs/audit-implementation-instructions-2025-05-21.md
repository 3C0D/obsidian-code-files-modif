# Implementation Instructions — Audit Fixes (May 21, 2025)

> Instructions for an LLM to apply each fix. Each section is self-contained.

---

## 1. Console Output Virtual Scrolling (Deferred)

**Status:** Not implementing now. Revisit only if users report performance issues.

**Context:** Console output uses raw DOM insertion. Tested with 2000 console.log messages — no freeze observed. The 5000-line truncation is working correctly.

**If implementing later:**
- File: `src/editor/iframe/console.ts`
- Consider using a virtual scrolling library or batching DOM updates in requestAnimationFrame
- Maintain the 5000-line truncation as a safety net

---

## 2. Settings Tab: maxFileSize Input Validation (Minor UX)

### Context
The maxFileSize input now uses `type="number"` with `step="0.1"` and `min="0.1"`. However, if the user types an invalid value (e.g., "0.05") and leaves the field, the input shows the invalid value but the setting remains unchanged. This is confusing.

### Files to modify
- `src/ui/codeFilesSettingsTab.ts`

### Instructions

In `renderExtensionsSection()`, find the maxFileSize setting (around line 119-136). The current code:

```ts
new Setting(containerEl)
  .setName('Maximum file size')
  .setDesc('Maximum file size in MB for opening files in Monaco (default: 10 MB, min: 0.1 MB)')
  .addText((text) => {
    text
      .setPlaceholder('10')
      .setValue(String(this.plugin.settings.maxFileSize));
    text.inputEl.type = 'number';
    text.inputEl.step = '0.1';
    text.inputEl.min = '0.1';
    text.inputEl.max = '100';
    text.onChange(async (v) => {
      const value = parseFloat(v);
      if (!isNaN(value) && value >= 0.1 && value <= 100) {
        this.plugin.settings.maxFileSize = value;
        await this.plugin.saveSettings();
      }
    });
  });
```

**Replace with:**

```ts
new Setting(containerEl)
  .setName('Maximum file size')
  .setDesc('Maximum file size in MB for opening files in Monaco (default: 10 MB, min: 0.1 MB)')
  .addText((text) => {
    text
      .setPlaceholder('10')
      .setValue(String(this.plugin.settings.maxFileSize));
    text.inputEl.type = 'number';
    text.inputEl.step = '0.1';
    text.inputEl.min = '0.1';
    text.inputEl.max = '100';
    text.onChange(async (v) => {
      const value = parseFloat(v);
      if (!isNaN(value) && value >= 0.1 && value <= 100) {
        this.plugin.settings.maxFileSize = value;
        await this.plugin.saveSettings();
      }
    });
    // Restore valid value if user leaves an invalid value in the field
    text.inputEl.addEventListener('blur', () => {
      const current = parseFloat(text.getValue());
      if (isNaN(current) || current < 0.1 || current > 100) {
        text.setValue(String(this.plugin.settings.maxFileSize));
      }
    });
  });
```

### Verification
- Type "0.05" in the field and click outside → should restore to the previous valid value (e.g., "10")
- Type "150" and click outside → should restore to the previous valid value
- Type "5.5" and click outside → should keep "5.5" (valid)

---

## 3. Extension Modal: Empty Extension Handling (Edge Case)

### Context
If the user types just "." in the extension modal, the query becomes empty string after normalization (`query.replace(/^\./, '')`), and the modal offers to add it. `addExtension()` blocks empty strings, but the UX is confusing.

### Files to modify
- `src/modals/chooseExtensionModal.ts`

### Instructions

In `getSuggestions()` (around line 38-51), add an early return for empty queries:

**Current code:**
```ts
getSuggestions(query: string): ExtensionSuggestion[] {
  // Normalize query by removing leading dot, trimming whitespace, and converting to lowercase
  const q = query.toLowerCase().replace(/^\./, '').trim();
  const current = getActiveExtensions(this.plugin.settings);

  // Filter existing extensions matching the query
  const matches = current
    .filter((ext) => ext.includes(q))
    .map((ext): ExtensionSuggestion => ({ kind: 'remove', ext }));

  // If the query is non-empty and not already in the list, offer to add it
  if (q && !current.includes(q)) {
    return [{ kind: 'add', ext: q }, ...matches];
  }

  return matches;
}
```

**Replace with:**
```ts
getSuggestions(query: string): ExtensionSuggestion[] {
  // Normalize query by removing leading dot, trimming whitespace, and converting to lowercase
  const q = query.toLowerCase().replace(/^\./, '').trim();
  
  // Block empty queries (e.g., user typed just ".")
  if (!q) return [];
  
  const current = getActiveExtensions(this.plugin.settings);

  // Filter existing extensions matching the query
  const matches = current
    .filter((ext) => ext.includes(q))
    .map((ext): ExtensionSuggestion => ({ kind: 'remove', ext }));

  // If the query is not already in the list, offer to add it
  if (!current.includes(q)) {
    return [{ kind: 'add', ext: q }, ...matches];
  }

  return matches;
}
```

### Verification
- Open the extension modal (Settings → Code Files → Manage extensions → Add / Remove)
- Type just "." → should show no suggestions (not "Add ''")
- Type ".js" → should show "Add 'js'" or "Remove 'js'" depending on registration status

---

## 4. Project Root Folder: Non-Existent Path Validation (Robustness)

### Context
The plugin clears `projectRootFolder` on layout ready if it doesn't exist (good). However, if the user manually types a non-existent path in the settings modal, it's accepted without validation. Cross-file navigation won't work until reload.

### Files to modify
- `src/modals/editorSettingsModal.ts` (or wherever the project root folder input is rendered)

### Instructions

**Note:** The project root folder input is in the Editor Settings modal (gear icon in tab header), not the main settings tab. Find the input field for `projectRootFolder` and add validation on blur.

**Pattern to follow:**

```ts
// After the user changes the projectRootFolder input
text.inputEl.addEventListener('blur', async () => {
  const value = text.getValue().trim();
  
  // Empty is valid (clears the project root)
  if (!value) {
    plugin.settings.projectRootFolder = '';
    await plugin.saveSettings();
    return;
  }
  
  // Check if the path exists
  const exists = await plugin.app.vault.adapter.exists(value);
  if (!exists) {
    new Notice(`Project root folder not found: ${value}`, 5000);
    // Restore the previous valid value
    text.setValue(plugin.settings.projectRootFolder);
    return;
  }
  
  // Valid path, save it
  plugin.settings.projectRootFolder = value;
  await plugin.saveSettings();
});
```

### Verification
- Open a code file → click gear icon → change "Project Root Folder" to a non-existent path → click outside
- Should see a Notice: "Project root folder not found: /invalid/path"
- The input should restore to the previous valid value
- Change to a valid path → should save without error

---

## 5. Hidden Files: Symlink Exclusion Documentation (Clarity)

### Context
The README mentions that symlinks are excluded from scanning, but doesn't explain why or what happens if a user tries to reveal a symlink.

### Files to modify
- `README.md`

### Instructions

Find the "Filtered File Types" section (around line 267) and update the symlinks bullet:

**Current:**
```md
- **Symbolic Links (Symlinks)**: all symlinks (files and folders) are excluded to prevent excessive disk I/O and potential recursive loops.
```

**Replace with:**
```md
- **Symbolic Links (Symlinks)**: all symlinks (files and folders) are excluded to prevent excessive disk I/O and potential recursive loops. If you need to access a symlinked file, navigate to its real path instead. Symlinks will not appear in the "Reveal Hidden Files" modal.
```

### Verification
- Read the updated README section to confirm clarity

---

## Priority Order

1. **#3 Extension Modal** — Edge case, easy fix, improves UX
2. **#2 Settings Tab Validation** — Minor UX improvement, easy fix
3. **#4 Project Root Validation** — Robustness improvement, requires finding the right modal
4. **#5 Documentation** — Clarity only, very low priority
5. **#1 Console Scrolling** — Deferred, not implementing now

---

**Date:** 2025-05-21
