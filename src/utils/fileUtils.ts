/**
 * File utilities for handling extensions and file names.
 */
import type { TFile } from 'obsidian';

/**
 * Returns the file extension, or the file name (without leading dot) if the file
 * starts with a dot and has no extension (like .env, .gitignore).
 * Returns empty string for files without extension that don't start with a dot (like LICENSE, README).
 *
 * @param file - The file to get the extension from
 * @returns The extension (without dot), or empty string if no extension and no leading dot
 */
export function getEmptyFileExtension(file: TFile): string {
	// If file has an extension, use it
	if (file.extension) return file.extension;
	
	// If file name starts with a dot (like .env, .gitignore), use the name without the dot as extension
	if (file.name.startsWith('.')) {
		return file.name.slice(1);
	}
	
	// Otherwise, no extension (like LICENSE, README)
	return '';
}
