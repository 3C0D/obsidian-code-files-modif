/**
 * Monaco Diff Modal and Revert Widgets
 * Handles side-by-side diff view and block-by-block revert functionality
 */
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Monaco global types don't match AMD-loaded runtime

import type * as Monaco from 'monaco-editor';
import { DIFF_EDITOR_OPTIONS } from './config.ts';

let parentOrigin = '*';

// Diff editor singleton - created once, reused
let diffEditorInstance: Monaco.editor.IStandaloneDiffEditor | null = null;
let diffOverlayEl: HTMLDivElement | null = null;
// Active revert glyph/overlay widgets (one per diff hunk)
let revertZoneWidgets: Array<{
	type: string;
	widget: unknown;
	line?: number;
	container?: HTMLDivElement;
}> = [];
// Disposable for the scroll listener (overlay widget fallback)
let diffScrollDisposable: Monaco.IDisposable | null = null;

// Shared state from init.ts
let editor: Monaco.editor.IStandaloneCodeEditor | null = null;
let context: string | null = null;
let currentLang = 'plaintext';
let lastFormatOriginal: string | null = null;
let lastFormatFormatted: string | null = null;

export function setSharedState(
	editorInstance: Monaco.editor.IStandaloneCodeEditor,
	ctx: string,
	lang: string
): void {
	editor = editorInstance;
	context = ctx;
	currentLang = lang;
}

/**
 * Captures the parent window origin from the init message event.
 * Must be called once before any postMessage is sent to the parent.
 * @param origin - The origin of the parent window (from event.origin)
 */
export function setParentOrigin(origin: string): void {
	parentOrigin = origin;
}

/**
 * Stores the last format operation's original and formatted content.
 * Used by the "Show Format Diff" action to display differences.
 * @param original - The original unformatted content
 * @param formatted - The formatted content after formatting
 */
export function setLastFormat(original: string | null, formatted: string | null): void {
	lastFormatOriginal = original;
	lastFormatFormatted = formatted;
}

/**
 * Retrieves the last stored format operation content.
 * @returns Object with original and formatted content, null if no format operation occurred
 */
export function getLastFormat(): { original: string | null; formatted: string | null } {
	return { original: lastFormatOriginal, formatted: lastFormatFormatted };
}

/**
 * Closes the diff modal and cleans up all associated widgets and event listeners.
 * Ensures the main editor content stays in sync with any changes made in the diff view.
 */
export function closeDiffModal(): void {
	if (diffOverlayEl) {
		diffOverlayEl.style.display = 'none';

		// Always ensure the main editor is perfectly in sync with the diff editor when we close it
		if (diffEditorInstance) {
			const models = diffEditorInstance.getModel();
			if (models && models.modified) {
				const diffText = models.modified.getValue();
				if (editor && editor.getValue() !== diffText) {
					editor.getModel()?.pushEditOperations(
						[],
						[
							{
								range: editor.getModel()!.getFullModelRange(),
								text: diffText
							}
						],
						() => null
					);
				}
			}
		}

		if (editor) editor.focus();
	}
	clearRevertWidgets();
	if (diffScrollDisposable) {
		diffScrollDisposable.dispose();
		diffScrollDisposable = null;
	}
}

function clearRevertWidgets(): void {
	if (!diffEditorInstance) return;
	const origEditor = diffEditorInstance.getOriginalEditor();
	revertZoneWidgets.forEach((w) => {
		if (
			w.type === 'glyph' &&
			typeof (
				origEditor as unknown as {
					removeGlyphMarginWidget?: (widget: unknown) => void;
				}
			).removeGlyphMarginWidget === 'function'
		) {
			(
				origEditor as unknown as {
					removeGlyphMarginWidget: (widget: unknown) => void;
				}
			).removeGlyphMarginWidget(w.widget);
		} else if (w.type === 'overlay') {
			origEditor.removeOverlayWidget(w.widget as Monaco.editor.IOverlayWidget);
		}
	});
	revertZoneWidgets = [];
}

/**
 * Builds revert widgets for each diff hunk, allowing users to revert individual changes.
 * Uses glyph margin widgets if available (Monaco API), otherwise falls back to overlay widgets.
 * Glyph API is preferred for better performance and native integration.
 */
function buildRevertWidgets(): void {
	clearRevertWidgets();
	if (diffScrollDisposable) {
		diffScrollDisposable.dispose();
		diffScrollDisposable = null;
	}

	const changes = diffEditorInstance?.getLineChanges();
	if (!changes || changes.length === 0) return;

	const origEditor = diffEditorInstance!.getOriginalEditor();
	const useGlyphApi =
		typeof (origEditor as unknown as { addGlyphMarginWidget?: unknown })
			.addGlyphMarginWidget === 'function';

	changes.forEach((change: Monaco.editor.ILineChange, idx: number) => {
		const origLine =
			change.originalStartLineNumber > 0
				? change.originalStartLineNumber
				: Math.max(1, change.originalEndLineNumber);

		const btn = document.createElement('button');
		btn.className = 'diff-revert-block-btn';
		btn.textContent = '↩';
		btn.title = 'Revert Block';
		btn.addEventListener('click', (e) => {
			e.stopPropagation();
			e.preventDefault();
			revertBlock(change);
		});

		const widgetId = 'revert-glyph-' + idx;

		if (useGlyphApi) {
			const glyphWidget = {
				getId: () => widgetId,
				getDomNode: () => btn,
				getPosition: () => ({
					lane: monaco.editor.GlyphMarginLane.Left,
					zIndex: 100,
					range: {
						startLineNumber: origLine,
						startColumn: 1,
						endLineNumber: origLine,
						endColumn: 1
					}
				})
			};
			(
				origEditor as unknown as {
					addGlyphMarginWidget: (widget: unknown) => void;
				}
			).addGlyphMarginWidget(glyphWidget);
			revertZoneWidgets.push({ type: 'glyph', widget: glyphWidget });
		} else {
			const container = document.createElement('div');
			container.style.position = 'absolute';
			container.style.zIndex = '100';
			container.appendChild(btn);

			const overlayWidget: Monaco.editor.IOverlayWidget = {
				getId: () => widgetId,
				getDomNode: () => container,
				getPosition: () => null
			};
			origEditor.addOverlayWidget(overlayWidget);
			revertZoneWidgets.push({
				type: 'overlay',
				widget: overlayWidget,
				line: origLine,
				container
			});
			positionOverlayWidget(origEditor, container, origLine);
		}
	});

	if (!useGlyphApi) {
		diffScrollDisposable = origEditor.onDidScrollChange(() => {
			revertZoneWidgets.forEach((w) => {
				if (w.type === 'overlay' && w.container && w.line) {
					positionOverlayWidget(origEditor, w.container, w.line);
				}
			});
		});
	}
}

/**
 * Positions an overlay widget at the correct vertical position for a given line number.
 * Used as fallback when glyph margin widgets are not available.
 * @param edtr - The Monaco editor instance
 * @param container - The overlay widget container element
 * @param lineNumber - The line number to position the widget at
 */
function positionOverlayWidget(
	edtr: Monaco.editor.IStandaloneCodeEditor,
	container: HTMLDivElement,
	lineNumber: number
): void {
	const top = edtr.getTopForLineNumber(lineNumber) - edtr.getScrollTop();
	const lh = edtr.getOption(monaco.editor.EditorOption.lineHeight);
	container.style.top = top + 'px';
	container.style.left = '4px';
	container.style.height = lh + 'px';
	container.style.display = 'flex';
	container.style.alignItems = 'center';
}

/**
 * Reverts a single diff hunk by applying the original content back to both the diff editor and main editor.
 * Handles various change types: additions, deletions, and modifications.
 * @param change - The line change object describing what was changed
 */
function revertBlock(change: Monaco.editor.ILineChange): void {
	const models = diffEditorInstance?.getModel();
	if (!models) return;
	const origModel = models.original;
	const modModel = models.modified;

	let origText = '';
	const hasOrig =
		change.originalStartLineNumber > 0 &&
		change.originalEndLineNumber >= change.originalStartLineNumber;
	if (hasOrig) {
		const lines = [];
		for (
			let i = change.originalStartLineNumber;
			i <= change.originalEndLineNumber;
			i++
		) {
			lines.push(origModel.getLineContent(i));
		}
		origText = lines.join('\n');
	}

	const hasMod =
		change.modifiedStartLineNumber > 0 &&
		change.modifiedEndLineNumber >= change.modifiedStartLineNumber;
	let edit: Monaco.editor.IIdentifiedSingleEditOperation;

	if (hasMod && hasOrig) {
		edit = {
			range: {
				startLineNumber: change.modifiedStartLineNumber,
				startColumn: 1,
				endLineNumber: change.modifiedEndLineNumber,
				endColumn: modModel.getLineMaxColumn(change.modifiedEndLineNumber)
			},
			text: origText
		};
	} else if (hasMod && !hasOrig) {
		const endLn = change.modifiedEndLineNumber;
		let range: Monaco.IRange;
		if (endLn >= modModel.getLineCount()) {
			if (change.modifiedStartLineNumber > 1) {
				range = {
					startLineNumber: change.modifiedStartLineNumber - 1,
					startColumn: modModel.getLineMaxColumn(
						change.modifiedStartLineNumber - 1
					),
					endLineNumber: endLn,
					endColumn: modModel.getLineMaxColumn(endLn)
				};
			} else {
				range = {
					startLineNumber: 1,
					startColumn: 1,
					endLineNumber: endLn,
					endColumn: modModel.getLineMaxColumn(endLn)
				};
			}
		} else {
			range = {
				startLineNumber: change.modifiedStartLineNumber,
				startColumn: 1,
				endLineNumber: endLn + 1,
				endColumn: 1
			};
		}
		edit = { range, text: '' };
	} else if (!hasMod && hasOrig) {
		const insertLine =
			change.modifiedStartLineNumber > 0 ? change.modifiedStartLineNumber : 1;
		const maxCol = modModel.getLineMaxColumn(insertLine);
		edit = {
			range: {
				startLineNumber: insertLine,
				startColumn: maxCol,
				endLineNumber: insertLine,
				endColumn: maxCol
			},
			text: '\n' + origText
		};
	} else {
		return;
	}

	modModel.pushEditOperations([], [edit], () => null);

	// Apply the same edit to the main editor behind the modal
	if (editor && editor.getModel()) {
		editor.getModel()!.pushEditOperations([], [edit], () => null);
		lastFormatFormatted = editor.getValue();
	}

	// Delay checking for remaining changes to allow Monaco's diff computation to settle
	// after the edit operation. 300ms is sufficient for diff recalculation.
	setTimeout(() => {
		const remaining = diffEditorInstance?.getLineChanges();
		if (!remaining || remaining.length === 0) {
			// All blocks reverted — clean up and close
			lastFormatOriginal = null;
			lastFormatFormatted = null;
			if (diffOverlayEl) {
				diffOverlayEl.style.display = 'none';
			}
			clearRevertWidgets();
			if (diffScrollDisposable) {
				diffScrollDisposable.dispose();
				diffScrollDisposable = null;
			}
			if (editor) editor.focus();
			window.parent.postMessage({ type: 'format-diff-reverted', context }, parentOrigin);
		} else {
			buildRevertWidgets();
		}
	}, 300);
}

/**
 * Reverts all formatting changes by restoring the original pre-formatted content.
 * Closes the diff modal and cleans up all state.
 */
function revertAll(): void {
	if (!lastFormatOriginal) return;

	// Simply restore the original content before formatting
	editor
		?.getModel()
		?.pushEditOperations(
			[],
			[{ range: editor.getModel()!.getFullModelRange(), text: lastFormatOriginal }],
			() => null
		);

	// Clean up
	lastFormatOriginal = null;
	lastFormatFormatted = null;

	// Close the diff modal
	if (diffOverlayEl) {
		diffOverlayEl.style.display = 'none';
	}
	clearRevertWidgets();
	if (diffScrollDisposable) {
		diffScrollDisposable.dispose();
		diffScrollDisposable = null;
	}
	if (editor) editor.focus();

	window.parent.postMessage({ type: 'format-diff-reverted', context }, parentOrigin);
}

/**
 * Opens the side-by-side diff modal showing original vs formatted content.
 * Creates the modal DOM elements if they don't exist, sets up the diff editor,
 * and builds revert widgets for individual change blocks.
 * @param original - The original unformatted content
 * @param formatted - The formatted content after formatting
 */
export function openDiffModal(original: string, formatted: string): void {
	if (!diffOverlayEl) {
		diffOverlayEl = document.createElement('div');
		diffOverlayEl.className = 'diff-overlay';

		const toolbar = document.createElement('div');
		toolbar.className = 'diff-toolbar';

		const revertAllBtn = document.createElement('button');
		revertAllBtn.textContent = '↩ Revert All';
		revertAllBtn.className = 'diff-revert-all-btn';
		revertAllBtn.title = 'Revert all formatting changes and restore original';
		revertAllBtn.onclick = () => revertAll();

		const closeBtn = document.createElement('button');
		closeBtn.textContent = '✕ Close';
		closeBtn.className = 'diff-close-btn';
		closeBtn.onclick = closeDiffModal;

		toolbar.appendChild(revertAllBtn);
		toolbar.appendChild(closeBtn);

		const container = document.createElement('div');
		container.className = 'diff-container';

		diffOverlayEl.appendChild(toolbar);
		diffOverlayEl.appendChild(container);
		document.body.appendChild(diffOverlayEl);

		diffEditorInstance = monaco.editor.createDiffEditor(
			container,
			DIFF_EDITOR_OPTIONS as Monaco.editor.IStandaloneDiffEditorConstructionOptions
		);
	}

	diffOverlayEl.style.display = 'block';

	const oldModel = diffEditorInstance!.getModel();
	if (oldModel) {
		diffEditorInstance!.setModel(null);
		oldModel.original?.dispose();
		oldModel.modified?.dispose();
	}

	diffEditorInstance!.setModel({
		original: monaco.editor.createModel(original, currentLang),
		modified: monaco.editor.createModel(formatted, currentLang)
	});

	requestAnimationFrame(() => {
		const container = diffOverlayEl!.querySelector('.diff-container') as HTMLElement;
		diffEditorInstance!.layout({
			width: container.clientWidth,
			height: container.clientHeight
		});
		requestAnimationFrame(() => {
			buildRevertWidgets();
		});
	});
}
