/**
 * Patch to prevent being unable to close context menus when hovering
 * over the Monaco editor view. Places a transparent overlay over the views when a menu
 * is open, and removes it shortly after Menu.hide() is called.
 */

import { Menu } from 'obsidian';
import { around } from 'monkey-around';
import type CodeFilesPlugin from '../main.ts';

const OVERLAY_CLASS = 'code-editor-iframe-blocker';

export function patchMenuOverlay(plugin: CodeFilesPlugin): void {
	// Places a transparent overlay on all Monaco editor views to intercept mouse events
	const showOverlays = (): void => {
		document
			.querySelectorAll<HTMLElement>('[data-type="code-editor"] .view-content')
			.forEach((view) => {
				if (view.querySelector(`.${OVERLAY_CLASS}`)) return;
				const overlay = document.createElement('div');
				overlay.className = OVERLAY_CLASS;
				overlay.style.cssText = 'position:absolute;inset:0;z-index:9999;';
				view.style.position = 'relative';
				view.appendChild(overlay);
			});
	};

	// Removes the transparent overlays
	const removeOverlays = (): void => {
		document.querySelectorAll(`.${OVERLAY_CLASS}`).forEach((el) => el.remove());
	};

	// Patch Menu.hide to remove overlays shortly after a menu is closed
	plugin.register(
		around(Menu.prototype, {
			hide(next: Menu['hide']) {
				return function (this: Menu) {
					// Use setTimeout to ensure the menu has fully closed before removing overlays
					setTimeout(() => removeOverlays(), 100);
					return next.call(this);
				};
			}
		})
	);

	// Add overlays globally when any context menu is opened
	plugin.registerDomEvent(document.body, 'contextmenu', () => {
		showOverlays();
	});
}
