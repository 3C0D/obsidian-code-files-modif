import type { TFile } from 'obsidian';
import type CodeFilesPlugin from '../../main.ts';
import { getExtension } from '../../utils/fileUtils.ts';

/**
 * Updates the header with the file extension badge and creates a dirty badge when autoSave is disabled.
 */
export function updateExtBadge(
	containerEl: HTMLElement,
	file: TFile,
	plugin: CodeFilesPlugin
): void {
	const titleContainer = containerEl.querySelector('.view-header-title-container');
	if (!titleContainer) return;

	// Capture the current dirty and saving states before removing the badges
	const existingDirtyBadge = titleContainer.querySelector('.code-files-dirty-badge');
	const isDirty = existingDirtyBadge?.classList.contains('code-files-dirty-unsaved');
	const isSaving = existingDirtyBadge?.classList.contains('code-files-dirty-saving');

	titleContainer.querySelector('.code-files-ext-badge')?.remove();
	titleContainer.querySelector('.code-files-dirty-badge')?.remove();
	const ext = getExtension(file.name);
	const badge = createEl('span', {
		text: ext ? `.${ext}` : file.name,
		cls: 'code-files-ext-badge'
	});
	titleContainer.appendChild(badge);
	if (!plugin.settings.autoSave) {
		const dirtyBadge = createEl('span', { cls: 'code-files-dirty-badge' });
		if (isDirty) dirtyBadge.addClass('code-files-dirty-unsaved');
		if (isSaving) dirtyBadge.addClass('code-files-dirty-saving');
		titleContainer.appendChild(dirtyBadge);
	}
}

/**
 * Updates the dirty badge visibility based on autoSave setting.
 */
export function updateDirtyBadgeVisibility(
	containerEl: HTMLElement,
	plugin: CodeFilesPlugin
): void {
	const titleContainer = containerEl.querySelector('.view-header-title-container');
	if (!titleContainer) return;
	const existingBadge = titleContainer.querySelector('.code-files-dirty-badge');
	if (plugin.settings.autoSave) {
		existingBadge?.remove();
	} else if (!existingBadge) {
		const dirtyBadge = createEl('span', { cls: 'code-files-dirty-badge' });
		titleContainer.appendChild(dirtyBadge);
	}
}

/**
 * Updates the dirty badge styling to show/hide the unsaved indicator in the header.
 */
export function setDirty(containerEl: HTMLElement, isDirtyBadge: boolean): void {
	const badge = containerEl.querySelector('.code-files-dirty-badge');
	if (!badge) return;
	badge.toggleClass('code-files-dirty-unsaved', isDirtyBadge);
}

/**
 * Updates the saving badge styling to show/hide the saving indicator in the header.
 */
export function setSaving(containerEl: HTMLElement, isSaving: boolean): void {
	const badge = containerEl.querySelector('.code-files-dirty-badge');
	if (!badge) return;
	badge.toggleClass('code-files-dirty-saving', isSaving);
}

/**
 * Clears the dirty badge (marks the view as saved).
 */
export function clearDirty(containerEl: HTMLElement): void {
	setDirty(containerEl, false);
}
