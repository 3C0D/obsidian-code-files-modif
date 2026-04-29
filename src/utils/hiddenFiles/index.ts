export { decorateFolders } from './badge.ts';
export {
	revealFiles,
	unrevealFiles,
	handleTemporaryReveal,
	cleanupTemporaryReveal
} from './operations.ts';
export { patchAdapter, patchRegisterExtensions } from './patches.ts';
export { scanDotEntries, getMaxFileSize } from './scan.ts';
export { getAdapter, _bypassPatch, setBypassPatch } from './state.ts';
export {
	syncAutoRevealedDotfiles,
	autoRevealRegisteredDotfiles,
	restoreRevealedFiles,
	cleanStaleRevealedFiles,
	hideAutoRevealedDotfiles
} from './sync.ts';
