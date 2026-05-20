export { decorateFolders } from './badge.ts';
export {
  revealItems,
  unrevealItems,
  handleTemporaryReveal,
  cleanupTemporaryReveal
} from './operations.ts';
export { patchAdapter, patchRegisterExtensions } from './patches.ts';
export { reconcileItem } from './reconcile.ts';
export { scanDotEntries, getMaxFileSize } from './scan.ts';
export { getAdapter, _bypassPatch, setBypassPatch } from './state.ts';
export {
  syncAutoRevealedDotfiles,
  revealRegisteredDotfiles,
  restoreRevealedFiles,
  cleanStaleRevealedFiles,
  hideAutoRevealedDotfiles,
  unrevealExcludedFolders,
  registerHiddenFilesDeleteHandler
} from './sync.ts';
export { isSymlink } from './symlink.ts';
