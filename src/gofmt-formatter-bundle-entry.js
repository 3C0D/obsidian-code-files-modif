// Bundle entry point for gofmt Go formatter
// Exposes init and format functions to global scope for monacoEditor.html

import init, { format } from '@wasm-fmt/gofmt/web';

// Expose to global scope
window.gofmtFormatter = { init, format };
