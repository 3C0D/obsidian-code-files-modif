// Bundle entry point for Ruff Python formatter
// Exposes init and format functions to global scope for monacoEditor.html

import init, { format } from '@wasm-fmt/ruff_fmt/web';

// Expose to global scope
window.ruffFormatter = { init, format };
