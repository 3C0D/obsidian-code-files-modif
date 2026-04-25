import { around } from 'monkey-around';
import { Modal } from 'obsidian';

/**
 * Monkey-patches Modal.prototype.open to prevent "n.instanceOf is not a function" crashes.
 * When a modal opens while a Monaco iframe has focus, Obsidian saves that iframe element
 * to restore focus on close. The iframe's elements don't have Obsidian's instanceOf method,
 * causing a crash. This patch blurs the iframe before Obsidian saves the active element.
 * @returns The uninstaller function to restore original behavior.
 */
export function patchModalOpen(): () => void {
	const uninstaller = around(Modal.prototype, {
		open(next: Modal['open']) {
			return function (this: Modal) {
				const active = document.activeElement;

				// Only act if an iframe currently has focus (i.e. Monaco editor is active).
				if (active?.tagName === 'IFRAME') {
					// Remove focus from the iframe so Obsidian won't save it
					// as the element to restore focus to after the modal closes.
					(active as HTMLElement).blur();

					// Explicitly move focus to body — guarantees document.activeElement
					// is a standard DOM element that Obsidian's instanceOf can handle.
					// The modal will register this and focus it on close, so no more error.
					document.body.focus();
				}

				// Call the original open() with the original context.
				return next.call(this);
			};
		}
	});

	return uninstaller;
}
