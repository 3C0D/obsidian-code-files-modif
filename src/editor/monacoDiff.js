// Monaco Diff Modal and Revert Widgets
// Handles side-by-side diff view and block-by-block revert functionality

// Global variables shared with monacoEditor.html
var editor;
var context;
var currentLang;
var lastFormatOriginal;
var lastFormatFormatted;

// Diff editor singleton - created once, reused
var diffEditorInstance = null;
var diffOverlayEl = null;
// Active revert glyph/overlay widgets (one per diff hunk)
var revertZoneWidgets = [];
// Disposable for the scroll listener (overlay widget fallback)
var diffScrollDisposable = null;

function closeDiffModal() {
	if (diffOverlayEl) {
		diffOverlayEl.style.display = 'none';
		
		// Always ensure the main editor is perfectly in sync with the diff editor when we close it
		if (diffEditorInstance) {
			var models = diffEditorInstance.getModel();
			if (models && models.modified) {
				var diffText = models.modified.getValue();
				if (editor.getValue() !== diffText) {
					editor.getModel().pushEditOperations(
						[],
						[{ range: editor.getModel().getFullModelRange(), text: diffText }],
						function () { return null; }
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

function clearRevertWidgets() {
	if (!diffEditorInstance) return;
	var origEditor = diffEditorInstance.getOriginalEditor();
	revertZoneWidgets.forEach(function (w) {
		if (w.type === 'glyph' && typeof origEditor.removeGlyphMarginWidget === 'function') {
			origEditor.removeGlyphMarginWidget(w.widget);
		} else if (w.type === 'overlay') {
			origEditor.removeOverlayWidget(w.widget);
		}
	});
	revertZoneWidgets = [];
}

function buildRevertWidgets() {
	clearRevertWidgets();
	if (diffScrollDisposable) {
		diffScrollDisposable.dispose();
		diffScrollDisposable = null;
	}

	var changes = diffEditorInstance.getLineChanges();
	if (!changes || changes.length === 0) return;

	var origEditor = diffEditorInstance.getOriginalEditor();
	var useGlyphApi = typeof origEditor.addGlyphMarginWidget === 'function';

	changes.forEach(function (change, idx) {
		var origLine = change.originalStartLineNumber > 0 ? change.originalStartLineNumber : Math.max(1, change.originalEndLineNumber);

		var btn = document.createElement('button');
		btn.className = 'diff-revert-block-btn';
		btn.textContent = '↩';
		btn.title = 'Revert Block';
		btn.addEventListener('click', function (e) {
			e.stopPropagation();
			e.preventDefault();
			revertBlock(change);
		});

		var widgetId = 'revert-glyph-' + idx;

		if (useGlyphApi) {
			var glyphWidget = {
				getId: function () { return widgetId; },
				getDomNode: function () { return btn; },
				getPosition: function () {
					return {
						lane: monaco.editor.GlyphMarginLane.Left,
						zIndex: 100,
						range: {
							startLineNumber: origLine, startColumn: 1, endLineNumber: origLine, endColumn: 1
						}
					};
				}
			};
			origEditor.addGlyphMarginWidget(glyphWidget);
			revertZoneWidgets.push({ type: 'glyph', widget: glyphWidget });
		} else {
			var container = document.createElement('div');
			container.style.position = 'absolute';
			container.style.zIndex = '100';
			container.appendChild(btn);

			var overlayWidget = {
				getId: function () { return widgetId; },
				getDomNode: function () { return container; },
				getPosition: function () { return null; }
			};
			origEditor.addOverlayWidget(overlayWidget);
			revertZoneWidgets.push({ type: 'overlay', widget: overlayWidget, line: origLine, container: container });
			positionOverlayWidget(origEditor, container, origLine);
		}
	});

	if (!useGlyphApi) {
		diffScrollDisposable = origEditor.onDidScrollChange(function () {
			revertZoneWidgets.forEach(function (w) {
				if (w.type === 'overlay') {
					positionOverlayWidget(origEditor, w.container, w.line);
				}
			});
		});
	}
}

function positionOverlayWidget(edtr, container, lineNumber) {
	var top = edtr.getTopForLineNumber(lineNumber) - edtr.getScrollTop();
	var lh = edtr.getOption(monaco.editor.EditorOption.lineHeight);
	container.style.top = top + 'px';
	container.style.left = '4px';
	container.style.height = lh + 'px';
	container.style.display = 'flex';
	container.style.alignItems = 'center';
}

function revertBlock(change) {
	var models = diffEditorInstance.getModel();
	if (!models) return;
	var origModel = models.original;
	var modModel = models.modified;

	var origText = '';
	var hasOrig = change.originalStartLineNumber > 0 && change.originalEndLineNumber >= change.originalStartLineNumber;
	if (hasOrig) {
		var lines = [];
		for (var i = change.originalStartLineNumber; i <= change.originalEndLineNumber; i++) {
			lines.push(origModel.getLineContent(i));
		}
		origText = lines.join('\n');
	}

	var hasMod = change.modifiedStartLineNumber > 0 && change.modifiedEndLineNumber >= change.modifiedStartLineNumber;
	var edit;

	if (hasMod && hasOrig) {
		edit = {
			range: {
				startLineNumber: change.modifiedStartLineNumber, startColumn: 1,
				endLineNumber: change.modifiedEndLineNumber, endColumn: modModel.getLineMaxColumn(change.modifiedEndLineNumber)
			},
			text: origText
		};
	} else if (hasMod && !hasOrig) {
		var endLn = change.modifiedEndLineNumber;
		var range;
		if (endLn >= modModel.getLineCount()) {
			if (change.modifiedStartLineNumber > 1) {
				range = {
					startLineNumber: change.modifiedStartLineNumber - 1, startColumn: modModel.getLineMaxColumn(change.modifiedStartLineNumber - 1),
					endLineNumber: endLn, endColumn: modModel.getLineMaxColumn(endLn)
				};
			} else {
				range = {
					startLineNumber: 1, startColumn: 1,
					endLineNumber: endLn, endColumn: modModel.getLineMaxColumn(endLn)
				};
			}
		} else {
			range = {
				startLineNumber: change.modifiedStartLineNumber, startColumn: 1,
				endLineNumber: endLn + 1, endColumn: 1
			};
		}
		edit = { range: range, text: '' };
	} else if (!hasMod && hasOrig) {
		var insertLine = change.modifiedStartLineNumber > 0 ? change.modifiedStartLineNumber : 1;
		var maxCol = modModel.getLineMaxColumn(insertLine);
		edit = {
			range: {
				startLineNumber: insertLine, startColumn: maxCol,
				endLineNumber: insertLine, endColumn: maxCol
			},
			text: '\n' + origText
		};
	} else {
		return;
	}

	modModel.pushEditOperations([], [edit], function () { return null; });

	// Apply the same edit to the main editor behind the modal
	if (editor && editor.getModel()) {
		editor.getModel().pushEditOperations([], [edit], function () { return null; });
		lastFormatFormatted = editor.getValue();
	} else {
		var newContent = modModel.getValue();
		editor.getModel().pushEditOperations(
			[],
			[{ range: editor.getModel().getFullModelRange(), text: newContent }],
			function () { return null; }
		);
		lastFormatFormatted = newContent;
	}

	setTimeout(function () {
		var remaining = diffEditorInstance.getLineChanges();
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
			window.parent.postMessage({ type: 'format-diff-reverted', context: context }, '*');
		} else {
			buildRevertWidgets();
		}
	}, 300);
}

function revertAll() {
	if (!lastFormatOriginal) return;
	
	// Simply restore the original content before formatting
	editor.getModel().pushEditOperations(
		[],
		[{ range: editor.getModel().getFullModelRange(), text: lastFormatOriginal }],
		function () { return null; }
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
	
	window.parent.postMessage({ type: 'format-diff-reverted', context: context }, '*');
}

function openDiffModal(original, formatted) {
	if (!diffOverlayEl) {
		diffOverlayEl = document.createElement('div');
		diffOverlayEl.className = 'diff-overlay';

		var toolbar = document.createElement('div');
		toolbar.className = 'diff-toolbar';

		var revertAllBtn = document.createElement('button');
		revertAllBtn.textContent = '↩ Revert All';
		revertAllBtn.className = 'diff-revert-all-btn';
		revertAllBtn.title = 'Revert all formatting changes and restore original';
		revertAllBtn.onclick = function () { revertAll(); };

		var closeBtn = document.createElement('button');
		closeBtn.textContent = '✕ Close';
		closeBtn.className = 'diff-close-btn';
		closeBtn.onclick = closeDiffModal;

		toolbar.appendChild(revertAllBtn);
		toolbar.appendChild(closeBtn);

		var container = document.createElement('div');
		container.className = 'diff-container';

		diffOverlayEl.appendChild(toolbar);
		diffOverlayEl.appendChild(container);
		document.body.appendChild(diffOverlayEl);

		diffEditorInstance = monaco.editor.createDiffEditor(container, DIFF_EDITOR_OPTIONS);
	}

	diffOverlayEl.style.display = 'block';

	var oldModel = diffEditorInstance.getModel();
	if (oldModel) {
		diffEditorInstance.setModel(null);
		oldModel.original?.dispose();
		oldModel.modified?.dispose();
	}

	diffEditorInstance.setModel({
		original: monaco.editor.createModel(original, currentLang),
		modified: monaco.editor.createModel(formatted, currentLang)
	});

	requestAnimationFrame(function() {
		var container = diffOverlayEl.querySelector('.diff-container');
		diffEditorInstance.layout({
			width: container.clientWidth,
			height: container.clientHeight
		});
		requestAnimationFrame(function () {
			buildRevertWidgets();
		});
	});
}
