# Terminal Feature — Reference Study

## Context

This document is a reference study of the `obsidian-terminal` plugin (by polyipseity) — a full PTY terminal emulator using xterm.js. It was studied during the design of our integrated console to understand the differences between a "run panel" (our approach) and a full terminal emulator.

**Our plugin does NOT implement a PTY terminal.** We use a simpler "run panel" model (see [console.md](console.md) → Appendix for the comparison).

## Key Takeaways from the Study

### Architecture (obsidian-terminal)
- **Three layers:** Obsidian ItemView → xterm.js emulator → system PTY (pseudo-terminal)
- **PTY creation:** Uses Python helper scripts (no native binary dependencies like `node-pty`)
  - Windows: `.bat` launcher + `win32_resizer.py` for console resize via Win32 API
  - Unix/macOS: `unix_pseudoterminal.py` using Python's `pty` module for master/slave PTY
- **Reference counting:** PTY is shared across tab moves (only killed when last tab closes)
- **WebGL rendering:** xterm.js with `webgl` addon for GPU-accelerated terminal display

### Why We Chose a Run Panel Instead
1. **Use case fit:** Script execution (Python, Node, Go) doesn't need `vim`, `htop`, or interactive shells
2. **No native dependencies:** Our approach uses `child_process.spawn` with piped stdio — no Python scripts, no binary modules
3. **Simpler maintenance:** No PTY resize protocol, no terminal escape sequence handling beyond ANSI colors
4. **Sufficient interactivity:** stdin pipe + Ctrl+C/Ctrl+D covers 95% of script execution needs

### What a PTY Would Add (if ever needed)
- Full interactive shells (bash completion, zsh prompts)
- TUI programs (vim, htop, ssh, man)
- Proper terminal size signaling (TIOCGWINSZ)
- Raw/cooked mode switching

This would require adding `xterm.js` (~300KB) + a PTY backend, significantly increasing complexity and bundle size.

---

**Status:** Reference document (external project study). Not an implementation spec for our plugin.
