export { decorateFolders } from './badge.ts';
export {
  revealItems,
  unrevealItems,
  handleTemporaryReveal
} from './operations.ts';
export { patchAdapter, patchRegisterExtensions } from './patches.ts';
export { scanDotEntries } from './scan.ts';
export { getAdapter } from './state.ts';
export { cleanStaleRevealedFiles } from './sync.ts';
export { filterManualDotEntries } from './dotfileFilters.ts';
export { isSymlink } from './symlink.ts';
