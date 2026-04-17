// Monaco Editor Actions and Keyboard Handlers
// All custom actions registered in Monaco's context menu and command palette

// Global variables shared with monacoEditor.html
// (editor, context, formatOnSave, currentCommandPaletteHotkey, currentSettingsHotkey, currentDeleteFileHotkey are defined in monacoEditor.html)
// (Functions like runFormatWithDiff, openDiffModal, lastFormatOriginal, lastFormatFormatted are in monacoFormatters.js and monacoDiff.js)

function registerActions(params) {
	// Add "Return to Default View" action if this is an unregistered extension
	if (params.isUnregisteredExtension) {
		editor.addAction({
			id: 'code-files-return-to-default-view',
			label: '↩️ Return to Default View',
			contextMenuGroupId: 'code-files',
			contextMenuOrder: 0,
			run: function () {
				window.parent.postMessage(
					{ type: 'return-to-default-view', context: context },
					'*'
				);
			}
		});
	}

	// Alt+Z toggles word wrap and persists the setting
	editor.addCommand(
		monaco.KeyMod.Alt | monaco.KeyCode.KeyZ,
		function () {
			var current = editor.getRawOptions().wordWrap;
			var next = current === 'on' ? 'off' : 'on';
			editor.updateOptions({ wordWrap: next });
			window.parent.postMessage(
				{
					type: 'word-wrap-toggled',
					wordWrap: next,
					context: context
				},
				'*'
			);
		}
	);

	editor.addAction({
		id: 'code-files-save',
		label: 'Save',
		keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
		run: function () {
			if (formatOnSave) {
				var formatAction = editor.getAction('editor.action.formatDocument');
				if (formatAction && formatAction.isSupported()) {
					runFormatWithDiff().then(function () {
						window.parent.postMessage(
							{ type: 'save-document', context: context },
							'*'
						);
					});
					return;
				}
			}
			window.parent.postMessage(
				{ type: 'save-document', context: context },
				'*'
			);
		}
	});

	// Add "Format Document" action for all file types
	editor.addAction({
		id: 'code-files-format-document',
		label: '📝 Format Document',
		contextMenuGroupId: 'code-files',
		contextMenuOrder: 0.5,
		keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF],
		run: function () {
			runFormatWithDiff();
		}
	});

	// Add "Show Format Diff" action for all file types
	editor.addAction({
		id: 'code-files-show-format-diff-global',
		label: '⟷ Show Format Diff',
		contextMenuGroupId: 'code-files',
		contextMenuOrder: 0.6,
		run: function () {
			if (lastFormatOriginal && lastFormatFormatted) {
				openDiffModal(lastFormatOriginal, lastFormatFormatted);
			}
		}
	});

	// Add a context menu action in Monaco to open the formatter config for this file
	editor.addAction({
		id: 'code-files-rename-extension',
		label: '🍋🟩 Rename Extension',
		contextMenuGroupId: 'code-files',
		contextMenuOrder: 1,
		run: function () {
			window.parent.postMessage(
				{ type: 'open-rename-extension', context: context },
				'*'
			);
		}
	});

	editor.addAction({
		id: 'code-files-change-theme',
		label: '🍒 Change Theme',
		contextMenuGroupId: 'code-files',
		contextMenuOrder: 2,
		run: function () {
			window.parent.postMessage(
				{ type: 'open-theme-picker', context: context },
				'*'
			);
		}
	});

	editor.addAction({
		id: 'code-files-formatter-config',
		label: '📐 Formatter Config',
		contextMenuGroupId: 'code-files',
		contextMenuOrder: 3,
		run: function () {
			window.parent.postMessage(
				{ type: 'open-formatter-config', context: context },
				'*'
			);
		}
	});

	editor.addAction({
		id: 'code-files-obsidian-settings',
		label: '🔧 Obsidian Settings (Ctrl+,)',
		run: function () {
			window.parent.postMessage(
				{ type: 'open-settings', context: context },
				'*'
			);
		}
	});

	editor.addAction({
		id: 'code-files-obsidian-palette',
		label: '🎹 Obsidian Command Palette (Ctrl+P)',
		run: function () {
			window.parent.postMessage(
				{ type: 'open-obsidian-palette', context: context },
				'*'
			);
		}
	});

	editor.addAction({
		id: 'code-files-delete-file',
		label: '🗑️ Delete File',
		contextMenuGroupId: 'code-files',
		contextMenuOrder: 4,
		run: function () {
			window.parent.postMessage(
				{ type: 'delete-file', context: context },
				'*'
			);
		}
	});

	// Dynamic shortcuts from Obsidian hotkey config.
	// Uses browserEvent.key (actual character produced) instead of scancode KeyCode,
	// so it works regardless of keyboard layout and follows user-configured hotkeys.
	editor.onKeyDown(function (e) {
		var key = e.browserEvent.key;

		// Check command palette hotkey (requires Mod)
		if (currentCommandPaletteHotkey && (e.ctrlKey || e.metaKey)) {
			var hk = currentCommandPaletteHotkey;
			var needsShift = hk.modifiers.includes('Shift');
			var needsAlt = hk.modifiers.includes('Alt');
			var keyMatch = key.toLowerCase() === hk.key.toLowerCase();
			if (keyMatch && e.shiftKey === needsShift && e.altKey === needsAlt) {
				e.preventDefault();
				e.stopPropagation();
				window.parent.postMessage({ type: 'open-obsidian-palette', context: context }, '*');
				return;
			}
		}

		// Check settings hotkey (requires Mod)
		if (currentSettingsHotkey && (e.ctrlKey || e.metaKey)) {
			var hk = currentSettingsHotkey;
			var needsShift = hk.modifiers.includes('Shift');
			var needsAlt = hk.modifiers.includes('Alt');
			var keyMatch = key.toLowerCase() === hk.key.toLowerCase();
			if (keyMatch && e.shiftKey === needsShift && e.altKey === needsAlt) {
				e.preventDefault();
				e.stopPropagation();
				window.parent.postMessage({ type: 'open-settings', context: context }, '*');
				return;
			}
		}

		// Check delete file hotkey (may or may not require Mod)
		if (currentDeleteFileHotkey) {
			var hk = currentDeleteFileHotkey;
			var needsMod = hk.modifiers.includes('Mod') || hk.modifiers.includes('Ctrl') || hk.modifiers.includes('Meta');
			var needsShift = hk.modifiers.includes('Shift');
			var needsAlt = hk.modifiers.includes('Alt');
			var hasMod = e.ctrlKey || e.metaKey;
			var keyMatch = key.toLowerCase() === hk.key.toLowerCase();
			if (keyMatch && hasMod === needsMod && e.shiftKey === needsShift && e.altKey === needsAlt) {
				e.preventDefault();
				e.stopPropagation();
				window.parent.postMessage({ type: 'delete-file', context: context }, '*');
			}
		}
	});
}
