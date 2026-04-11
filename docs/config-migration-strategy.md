# Configuration Migration Strategy

## Problem

When updating `DEFAULT_EDITOR_CONFIG` or `DEFAULT_EXTENSION_CONFIG` with new commented properties (e.g., adding `// "fontSize": 14`), existing user configurations don't automatically receive these new template comments.

## Why This Happens

1. **Configs are stored as strings** in `data.json`:
```json
{
  "editorConfigs": {
    "*": "{\n    \"tabSize\": 4,\n    // my custom comment\n}",
    ".ts": "{\n    \"tabSize\": 2\n}"
  }
}
```

2. **Once saved, configs are frozen**: The fallback to default templates only applies when a config key doesn't exist:
```typescript
cfg ?? (global ? DEFAULT_EDITOR_CONFIG : DEFAULT_EXTENSION_CONFIG)
```

3. **User modifications persist**: If a user has modified any config (even just uncommenting one property), their version is saved and the default template is never consulted again.

## Current Behavior

**Example scenario:**
1. User opens config for `.ts`, sees default template with comments
2. User uncomments `"tabSize": 2` and saves
3. Developer adds `// "fontSize": 14` to `DEFAULT_EXTENSION_CONFIG`
4. Plugin recompiles and restarts
5. User reopens config for `.ts` → **only sees** `{ "tabSize": 2 }`, **not** the new `fontSize` comment

## Proposed Solution (Not Implemented)

### Approach: Smart Config Merging

Merge user configs with updated default templates while preserving user values and custom comments.

```typescript
/**
 * Merges user config with default template to add new commented properties
 * while preserving existing user values and custom comments.
 */
function mergeConfigWithDefaults(userConfig: string, defaultConfig: string): string {
    const userLines = userConfig.split('\n');
    const defaultLines = defaultConfig.split('\n');
    
    // Extract property keys that exist in user config (commented or uncommented)
    const userKeys = new Set<string>();
    userLines.forEach(line => {
        // Match both "property": value and // "property": value
        const match = line.match(/(?:\/\/)?\s*"(\w+)":/);
        if (match) userKeys.add(match[1]);
    });
    
    // Find new commented properties in default that don't exist in user config
    const newCommentedLines: string[] = [];
    defaultLines.forEach(line => {
        const match = line.match(/\/\/\s*"(\w+)":/);
        if (match && !userKeys.has(match[1])) {
            newCommentedLines.push(line);
        }
    });
    
    // Insert new commented lines before the closing brace
    if (newCommentedLines.length > 0) {
        const closingBraceIndex = userLines.findLastIndex(line => line.trim() === '}');
        if (closingBraceIndex !== -1) {
            userLines.splice(closingBraceIndex, 0, ...newCommentedLines);
        }
    }
    
    return userLines.join('\n');
}

/**
 * Migrates all editor configs to include new default template properties.
 * Call this in loadSettings() after loading data.json.
 */
async function migrateEditorConfigs(plugin: CodeFilesPlugin): Promise<void> {
    const rawData = await plugin.loadData();
    let modified = false;
    
    for (const [key, userConfig] of Object.entries(rawData?.editorConfigs ?? {})) {
        const defaultTemplate = key === '*' 
            ? DEFAULT_EDITOR_CONFIG 
            : DEFAULT_EXTENSION_CONFIG;
        
        const merged = mergeConfigWithDefaults(userConfig, defaultTemplate);
        
        if (merged !== userConfig) {
            plugin.settings.editorConfigs[key] = merged;
            modified = true;
        }
    }
    
    if (modified) {
        await plugin.saveSettings();
    }
}
```

### Integration Point

Add to `settingsUtils.ts`:

```typescript
export async function loadSettings(plugin: CodeFilesPlugin): Promise<void> {
    const loaded = await plugin.loadData();
    plugin.settings = {
        ...DEFAULT_SETTINGS,
        ...loaded,
        editorConfigs: {
            '*': DEFAULT_EDITOR_CONFIG,
            ...(loaded?.editorConfigs ?? {})
        }
    };
    
    // Migrate configs to include new default properties
    await migrateEditorConfigs(plugin);
}
```

## Challenges

1. **Parsing complexity**: Need to handle JSONC (JSON with comments) correctly
2. **Indentation preservation**: Must maintain user's formatting style
3. **Nested properties**: Handle objects like `"minimap": { "enabled": false }`
4. **Custom comments**: Don't overwrite user's personal comments
5. **Error handling**: If parsing fails, don't corrupt the config

## Alternative: UI-Based Approach

Instead of automatic migration, add a **"Show All Options"** or **"Reset to Template"** button in the editor config UI:

```typescript
// In editorSettingsModal.ts
new ButtonComponent(container)
    .setButtonText('Show All Options')
    .setTooltip('Add all available options as comments')
    .onClick(() => {
        const defaultTemplate = this.isGlobal 
            ? DEFAULT_EDITOR_CONFIG 
            : DEFAULT_EXTENSION_CONFIG;
        const merged = mergeConfigWithDefaults(
            this.codeEditor.getValue(), 
            defaultTemplate
        );
        this.codeEditor.setValue(merged);
    });
```

This approach:
- Gives users control over when to update
- Avoids automatic modifications that might surprise users
- Simpler to implement and less risky
- Follows patterns used by VS Code and other editors

## Recommendation

**Don't implement automatic migration** for now. The current behavior is acceptable because:

1. Users can always delete their config to get the fresh template
2. New properties are documented in README and release notes
3. The risk of corrupting user configs outweighs the benefit
4. Most users don't need every available option

If migration becomes necessary, implement the **UI-based approach** first (manual "Show All Options" button) before considering automatic migration.
