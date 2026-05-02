/**
 * File utilities for handling extensions and file names.
 */
import type { DataAdapterWithInternal } from '../types/index.ts';

/**
 * Extracts the extension from a filename.
 * Handles dotfiles (.env → "env") and normal files (myfile.py → "py").
 * Returns empty string for files without extension that don't start with a dot (like LICENSE, README).
 *
 * @param filename - The filename to extract the extension from
 * @returns The extension of the file, without the leading dot
 */
export function getExtension(filename: string): string {
	if (filename.startsWith('.') && !filename.includes('.', 1)) return filename.slice(1);
	const lastDot = filename.lastIndexOf('.');
	return lastDot > 0 ? filename.slice(lastDot + 1) : '';
}

/**
 * Gets the real path for a file using adapter.getRealPath(), with fallback to the original path.
 * getRealPath is Desktop-only; on Mobile, it returns the path unchanged.
 *
 * @param adapter - The file system adapter
 * @param filePath - The file path
 * @returns The real path if available, otherwise the original filePath
 */
export function getRealPathSafe(
	adapter: DataAdapterWithInternal,
	filePath: string
): string {
	return adapter.getRealPath?.(filePath) ?? filePath;
}
