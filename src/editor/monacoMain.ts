// Monaco Editor Bundle Entry Point
// This file is compiled to monacoBundle.js by esbuild and loaded by monacoEditor.html
// after Monaco's AMD loader has finished loading monaco-editor

import { initMonacoApp } from './iframe/init.js';

// Expose initMonacoApp to be called from monacoEditor.html after require(['vs/editor/editor.main'])
window.initMonacoApp = initMonacoApp;
