import type * as Monaco from 'monaco-editor';
import { getParentOrigin } from './utils.ts';

let enableRelay = false;
let explorerHover = false;
let spaceDown = false;
const interceptedKeys = new Set<string>();

export function setExplorerShortcutsEnabled(val: boolean): void {
  enableRelay = val;
}

export function setExplorerHover(over: boolean): void {
  explorerHover = over;
}

export function registerExplorerShortcutsRelay(editor: Monaco.editor.IStandaloneCodeEditor): void {
  editor.onKeyDown((e: Monaco.IKeyboardEvent) => {
    if (enableRelay && e.browserEvent.key === ' ' && !e.browserEvent.repeat) {
      if (explorerHover) {
        spaceDown = true;
        interceptedKeys.add(' ');
        e.preventDefault();
        e.stopPropagation();
        window.parent.postMessage(
          { type: 'keydown-relay', key: ' ', code: e.browserEvent.code, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false },
          getParentOrigin()
        );
      }
    } else if (enableRelay && spaceDown) {
      interceptedKeys.add(e.browserEvent.key);
      e.preventDefault();
      e.stopPropagation();
      window.parent.postMessage(
        { type: 'keydown-relay', key: e.browserEvent.key, code: e.browserEvent.code, ctrlKey: e.browserEvent.ctrlKey, metaKey: e.browserEvent.metaKey, shiftKey: e.browserEvent.shiftKey, altKey: e.browserEvent.altKey },
        getParentOrigin()
      );
    }
  });

  editor.onKeyUp((e: Monaco.IKeyboardEvent) => {
    if (enableRelay && interceptedKeys.has(e.browserEvent.key)) {
      interceptedKeys.delete(e.browserEvent.key);
      if (e.browserEvent.key === ' ') {
        spaceDown = false;
      }
      e.preventDefault();
      e.stopPropagation();
      window.parent.postMessage(
        { type: 'keyup-relay', key: e.browserEvent.key, code: e.browserEvent.code, ctrlKey: e.browserEvent.ctrlKey, metaKey: e.browserEvent.metaKey, shiftKey: e.browserEvent.shiftKey, altKey: e.browserEvent.altKey },
        getParentOrigin()
      );
    }
  });
}
