/**
 * File utilities for handling extensions and file names.
 */
import type { TFile } from 'obsidian';
import { getExtension } from './extensionUtils.ts';

/**
 * Returns the effective extension of a TFile, handling dotfiles (.env → "env").
 * Returns empty string for files without extension that don't start with a dot (like LICENSE, README).
 */
export function getEmptyFileExtension(file: TFile): string {
	return getExtension(file.name);
}
