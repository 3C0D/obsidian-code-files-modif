// Bundle entry point for clang-format C/C++ formatter
// Exposes init and format functions to global scope for monacoEditor.html

import init, { format } from '@wasm-fmt/clang-format/web';

// Expose to global scope
window.clangFormatter = { init, format };
