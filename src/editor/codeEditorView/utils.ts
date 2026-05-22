/**
 * Utilities related to CodeEditorView instances.
 * Provides helpers to enumerate and interact with open Monaco editor views.
 */

import type { App } from 'obsidian';
import type { CodeEditorView } from './index.ts';
import { viewType } from '../../types/index.ts';

/**
 * Gets all currently open CodeEditorView instances.
 *
 * @param app - The Obsidian app instance
 * @returns An array of open CodeEditorView instances
 */
export function getCodeEditorViews(app: App): CodeEditorView[] {
  return app.workspace.getLeavesOfType(viewType).map((l) => l.view as CodeEditorView);
}
