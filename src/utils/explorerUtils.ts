/**
 * Visual highlighting for the project root folder in the file explorer.
 * Adds/removes a CSS class to the folder title element to show which folder
 * is set as the project root for TypeScript/JavaScript cross-file navigation.
 * The highlight color is customizable via plugin settings.
 */
import type CodeFilesPlugin from '../main.ts';
import type { FileExplorerView, FileTreeItem } from 'obsidian-typings';
import { TFile } from 'obsidian';
import { getExtension } from './fileUtils.ts';
import { getActiveExtensions } from './extensionUtils.ts';

const PROJECT_ROOT_CLASS = 'code-files-project-root-folder';

/** Updates the visual highlight of the project root folder in the file explorer.
 *
 *  Why: Provides visual feedback to show which folder is set as the project root
 *  for TypeScript/JavaScript cross-file navigation.
 *
 *  How: Adds a CSS class to the folder title element in Obsidian's file explorer.
 *  The class is styled in monacoHtml.css to show a green highlight. */
export function updateProjectFolderHighlight(plugin: CodeFilesPlugin): void {
	const view = plugin.app.workspace.getLeavesOfType('file-explorer')?.first()?.view as
		| FileExplorerView
		| undefined;
	if (!view?.fileItems) return;

	// Remove previous highlight
	for (const [, item] of Object.entries(view.fileItems)) {
		const titleEl = item.el?.querySelector(
			'.nav-folder-title-content'
		) as HTMLElement | null;
		if (titleEl) {
			titleEl.classList.remove(PROJECT_ROOT_CLASS);
		}
	}

	// Add highlight to project root folder
	if (!plugin.settings.projectRootFolder) return;
	const projectItem = view.fileItems[plugin.settings.projectRootFolder];
	if (!projectItem) return;
	const titleEl = projectItem.el?.querySelector(
		'.nav-folder-title-content'
	) as HTMLElement | null;
	if (titleEl) {
		titleEl.classList.add(PROJECT_ROOT_CLASS);
		const color = plugin.settings.projectRootFolderColor;
		if (color) {
			titleEl.style.setProperty('--code-files-project-root-color', color);
		} else {
			titleEl.style.removeProperty('--code-files-project-root-color');
		}
	}
}

let explorerObserver: MutationObserver | null = null;
let debounceTimeout: NodeJS.Timeout | null = null;



/* Le rôle de l'observer est précis : Obsidian rend le file explorer de façon **lazy**, c'est-à-dire que les items d'un dossier ne sont ajoutés au DOM que quand on l'expand. Sans l'observer, `updateBadges` tourne une fois au chargement et manque tous les fichiers dans des dossiers repliés.

Le `layout-change` et `rename` ne couvrent pas ce cas : ils ne se déclenchent pas quand l'utilisateur clique sur un triangle pour ouvrir un sous-dossier.

**Test pour confirmer :** mets un dotfile `.env` dans un sous-dossier replié au démarrage, retire l'observer, relance. Expand le dossier, le badge devrait manquer.

**Pourquoi l'autre code sans observer marche quand même :** soit il applique les badges via une autre mécanique (par exemple il hook directement le rendu des items via `fileItems`), soit il utilise uniquement des dossiers déjà ouverts dans tes tests.

**Bug restant dans ta version corrigée :** le `else { explorerObserver.disconnect() }` est correct car le `observe()` juste en dessous le relance, mais si `layout-change` se déclenche avant qu'un observer existe, le `if (!explorerObserver)` crée l'instance sans l'observer (les leaves peuvent ne pas être prêtes). Ce cas est déjà couvert par le `onLayoutReady` en bas, donc pas de problème en pratique.

Conclusion : garde l'observer, il est justifié. Si tu veux le retirer, remplace-le par un listener sur l'event Obsidian `'file-explorer:open-folder'` s'il existe, mais la MutationObserver est la solution la plus robuste ici. */



/**
 * Ensures dotfiles (.env, .gitignore) show their extension as a badge in the
 * file explorer, matching Obsidian's native behavior for regular files.
 * Uses a lightweight debounced MutationObserver on the file explorer's
 * container to catch folder expansions dynamically.
 */
export function setupExplorerBadges(plugin: CodeFilesPlugin): void {
	const updateBadges = (): void => {
		const activeExts = getActiveExtensions(plugin.settings);
		const leaves = plugin.app.workspace.getLeavesOfType('file-explorer');

		for (const leaf of leaves) {
			const view = leaf.view as FileExplorerView;
			if (!view.fileItems) continue;

			for (const item of Object.values(view.fileItems)) {
				const file = (item as FileTreeItem).file;
				if (!(file instanceof TFile)) continue;
				if (file.extension) continue; // Only process dotfiles (empty extension)

				const ext = getExtension(file.name);
				if (!ext || !activeExts.includes(ext)) continue;

				const selfEl = (item as FileTreeItem).selfEl || (item as FileTreeItem).el;
				if (!selfEl) continue;

				const tagEl = selfEl.querySelector('.nav-file-tag');
				if (tagEl && !tagEl.textContent) {
					tagEl.textContent = ext.toUpperCase();
					tagEl.classList.add('code-files-dotfile-badge');
				}
			}
		}
	};

	const debouncedUpdate = (): void => {
		if (debounceTimeout) clearTimeout(debounceTimeout);
		debounceTimeout = setTimeout(() => {
			debounceTimeout = null;
			updateBadges();
		}, 50);
	};

	const reattachObservers = (): void => {
		if (!explorerObserver) {
			explorerObserver = new MutationObserver((mutations) => {
				for (const mut of mutations) {
					if (mut.addedNodes.length > 0) {
						debouncedUpdate();
						break;
					}
				}
			});
		} else {
			explorerObserver.disconnect();
		}

		const leaves = plugin.app.workspace.getLeavesOfType('file-explorer');
		for (const leaf of leaves) {
			const view = leaf.view as FileExplorerView;
			explorerObserver.observe(view.containerEl, {
				childList: true,
				subtree: true
			});
		}
		debouncedUpdate();
	};

	plugin.registerEvent(plugin.app.workspace.on('layout-change', reattachObservers));
	plugin.registerEvent(plugin.app.vault.on('rename', debouncedUpdate));

	// Initial attach if layout is already ready
	if (plugin.app.workspace.layoutReady) {
		reattachObservers();
	} else {
		plugin.app.workspace.onLayoutReady(reattachObservers);
	}
}

export function cleanupExplorerBadges(): void {
	if (debounceTimeout) {
		clearTimeout(debounceTimeout);
		debounceTimeout = null;
	}
	if (explorerObserver) {
		explorerObserver.disconnect();
		explorerObserver = null;
	}
}
