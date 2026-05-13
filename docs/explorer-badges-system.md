# Explorer Extension Badges System

## Overview
The extension badges system provides visual indicators in the Obsidian file explorer for files managed by the Code Files plugin. It handles two types of indicators: extension labels for dotfiles (e.g., `.ENV`, `.GITIGNORE`) and "unregistered" warnings for file types not natively supported by Obsidian.

The system is built in three layers: defining **what** to apply, **when** to apply it, and **how** to detect new items efficiently.

---

## Layer 1: `applyBadge` (Core Logic)
This is the heart of the system. For a given explorer item, it performs actions based on the file type:

- **Dotfiles (`.env`, `.gitignore`, etc.)**: 
  Since Obsidian doesn't assign an extension to these files in its data model (`file.extension` is empty), the plugin uses `getExtension()` to extract it from the raw filename. If the extension is active in the plugin settings and the badge is currently empty, it injects the uppercase text (e.g., "ENV", "GITIGNORE").
  
- **Unregistered Regular Files**: 
  If `file.extension` exists but is not recognized by Obsidian (absent from `viewRegistry`), the plugin adds a specific CSS class that displays a muted yellow "unregistered" badge. This ensures users know the file will open in Monaco instead of a native view.
  
*Note: Existing badges are cleared at the start of the function to prevent duplicates when an item is updated.*

---

## Layer 2: `applyBadgeForPath` and `scanAll` (Access Modes)
These helpers manage how `applyBadge` is triggered:

- **`applyBadgeForPath`**: Targets a single item using its path. It lookups the item in `view.fileItems`, which is Obsidian's internal dictionary mapping paths to DOM items.
- **`scanAll`**: Iterates through all currently rendered items in the explorer.
  
*Crucially, `view.fileItems` only contains items that are currently present in the DOM (Obsidian uses lazy rendering).*

---

## Layer 3: `reattachObservers` (The Orchestrator)
This function manages the lifecycle of the system. It is triggered during plugin startup and on every `layout-change` (e.g., changing workspace layout, reopening the explorer).

### The MutationObserver Logic
Instead of scanning the entire vault, the plugin uses a `MutationObserver` on the explorer's `containerEl`:

1.  **Lazy Rendering Detection**: When a user expands a folder, Obsidian injects the children nodes into the DOM "all at once" (in a single wrapper). 
2.  **Targeted Updates**: For every added node, the observer looks for the `data-path` attribute—either on the node itself or its descendants (to catch all files in a newly opened folder).
3.  **Efficiency**: It then calls `applyBadgeForPath` only for those specific items, ensuring O(1) performance per item even in large vaults.

### The "Reattach" Mechanism
The observer is tied to a specific `containerEl`. If the explorer is closed and reopened, or if the layout changes, this container might be destroyed or replaced. `reattachObservers` disconnects the old observer and "re-attaches" a new one to the current active explorer container, followed by a `scanAll` to cover items already rendered.

---

## External Events: The `rename` Listener
A separate listener for `vault.on('rename')` is required because `MutationObserver` only detects the **addition** of nodes, not attribute changes on existing ones. Since a rename changes the `data-path` attribute of an item already present in the DOM, it must be handled explicitly to refresh the badge.
