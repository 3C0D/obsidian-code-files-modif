/** Monkey-patches Modal.prototype.open to blur any active iframe before
 *  Obsidian saves the focused element — prevents "n.instanceOf is not a function"
 *  when Obsidian tries to restore focus on modal close.
 *
 *  Root cause: when a modal opens, Obsidian saves document.activeElement to
 *  restore focus on close. If that element is an iframe, Obsidian's internal
 *  instanceOf check crashes. Blurring before the save avoids the issue entirely.
 *
 *  Returns an unpatch function to restore the original behavior. */
export function patchModalClose(): () => void {
	// require() instead of static import: TypeScript would reject reassigning
	// proto.open on a typed class. require() returns any, bypassing that check.
	const Modal = require('obsidian').Modal;

	// All modal instances share this prototype, so patching it once
	// intercepts every modal opened by any plugin, including third-party ones.
	const proto = Modal.prototype;

	// Save the original open() so we can restore it on plugin unload.
	const original = proto.open;

	// Replace open() with our wrapper.
	proto.open = function (...args: unknown[]) {
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

		// Call the original open() with the original context and arguments.
		return original.apply(this, args);
	};

	// Return the unpatch function — called in plugin.onunload()
	// to leave no trace once the plugin is disabled.
	return () => {
		proto.open = original;
	};
}
