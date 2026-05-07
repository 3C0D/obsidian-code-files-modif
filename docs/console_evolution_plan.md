# Plan d'Évolution — Console Intégrée Monaco

## Verdict architectural

> [!IMPORTANT]
> **L'approche actuelle est saine.** Pas de changement de stratégie nécessaire.

L'architecture `spawn` + `postMessage` via iframe blob URL est la bonne approche pour un éditeur de code embarqué. `obsidian-terminal` résout un problème différent (émulateur PTY complet avec xterm.js pour shells interactifs). Notre console est un **run panel** contextuel — pas un terminal généraliste.

### Ce que fait obsidian-terminal qu'on n'a PAS besoin de reproduire

| Feature obsidian-terminal | Pourquoi on ne la prend pas |
|---|---|
| PTY via scripts Python (`unix_pseudoterminal.py`, `win32_resizer.py`) | On n'a pas besoin d'un vrai PTY. Notre `spawn({shell:true})` suffit. |
| xterm.js + addons (WebGL renderer, ligatures, serialize) | Overkill pour un run panel. Notre `<div>` + `ansi_up` est plus léger. |
| `RefPseudoterminal` (compteur de références) | On n'a qu'un process par fichier, pas de partage entre vues. |
| `DeveloperConsolePseudoterminal` (REPL JS avec `acorn`) | Pas dans le scope — on exécute des scripts, pas un REPL. |
| Profils de terminal multi-plateforme | On détecte l'extension du fichier, pas le shell. |
| `TerminalTextArea` (saisie multi-ligne dans xterm) | Notre `<input>` HTML suffit. |

### Ce qu'on DOIT piocher

1. **Robustesse du spawn** : Variables d'environnement, gestion d'encodage
2. **Extensions du pré-remplissage** : Plus d'extensions supportées
3. **Gestion du process exit** : Codes de sortie structurés au lieu de string matching
4. **Persistance** : Hauteur console, historique cross-session
5. **UX** : Prompt visuel, copier-coller, drag-and-drop

---

## Tâches (par priorité)

---

### P0 — Robustesse critique

#### Tâche 1 : Message structuré pour l'exit au lieu de string matching

**Problème** : `console.ts` L266 détecte la fin du process via `text.includes('[Process exited:')`. Fragile.

**`messageHandler.ts`** — case `run-command`, dans `proc.on('close')`, APRÈS le `send('console-output', ...)` :
```ts
send('console-process-exited', { code: code ?? null });
```

**`console.ts`** — ajouter un case dans `handleConsoleMessage()` :
```ts
case 'console-process-exited': {
  isRunning = false;
  return true;
}
```

Supprimer le check `text.includes('[Process exited:')` du case `console-output` (L266-268).

---

#### Tâche 2 : Variables d'environnement du spawn

**Inspiration** : obsidian-terminal passe `process.env` + `PYTHONIOENCODING` ([pseudoterminal.ts:L849-853]).

**`messageHandler.ts`** — case `run-command`, modifier le `spawn` :
```ts
const proc = spawn(cmd, args, {
  cwd: fileDir,
  env: {
    ...process.env,
    PYTHONIOENCODING: 'utf-8',
    GIT_PAGER: '',
    FORCE_COLOR: '1',
  },
  stdio: ['pipe', 'pipe', 'pipe'],
  shell: true,
  detached: process.platform !== 'win32'
});
```

---

#### Tâche 3 : Error handler envoie aussi l'exit structuré

**`messageHandler.ts`** — `proc.on('error')` :
```ts
proc.on('error', (err) => {
  send('console-output', { text: `Error: ${err.message}\n` });
  send('console-process-exited', { code: null });
  activeProcesses.delete(codeContext);
});
```

---

### P1 — Pré-remplissage étendu

#### Tâche 4 : Table d'auto-fill complète

**`console.ts`** — remplacer L217-221 :
```ts
const ext = ctx.match(/\.([^./\\]+)$/)?.[1]?.toLowerCase();
const fileName = ctx.split('/').pop() || '';
const PREFILL: Record<string, string> = {
  'ts':   'npx tsx ',
  'mts':  'npx tsx ',
  'cts':  'npx tsx ',
  'js':   'node ',
  'mjs':  'node ',
  'cjs':  'node ',
  'py':   'python ',
  'sh':   'bash ',
  'ps1':  'powershell -File ',
  'rb':   'ruby ',
  'go':   'go run ',
  'rs':   'cargo run',
  'java': 'java ',
  'lua':  'lua ',
  'php':  'php ',
  'r':    'Rscript ',
  'pl':   'perl ',
};
const prefix = ext ? PREFILL[ext] : undefined;
if (prefix !== undefined) {
  input.value = prefix.endsWith(' ') ? prefix + fileName : prefix;
}
```

> [!TIP]
> `npx tsx` au lieu de `npx ts-node` — tsx est plus rapide et supporte ESM nativement.

---

### P2 — Persistance

#### Tâche 5 : Persister la hauteur de la console

**`messageHandler.ts`** — nouveau case :
```ts
case 'console-height-changed': {
  if (!Platform.isDesktop) break;
  plugin.settings.consoleHeight = data.height as number;
  await plugin.saveSettings();
  break;
}
```

**`console.ts`** — dans `onMouseUp` du resize :
```ts
window.parent.postMessage(
  { type: 'console-height-changed', height: pane.offsetHeight, context: ctx },
  getParentOrigin()
);
```

**`buildInitParams.ts`** — ajouter `consoleHeight` dans les params envoyés à l'iframe.

**`console.ts`** — au début de `initConsolePane`, restaurer la hauteur depuis un param global.

> [!NOTE]
> Ajouter `consoleHeight?: number` dans l'interface settings du plugin.

---

#### Tâche 6 : Historique persisté cross-session

**`messageHandler.ts`** :
- Au chargement du plugin : reconstruire `consoleHistories` depuis `plugin.settings.consoleHistories`
- Dans case `run-command`, après `hist.push()` : sauvegarder avec cap à 50 entrées par fichier

```ts
const MAX_HISTORY = 50;
if (hist.length > MAX_HISTORY) hist.splice(0, hist.length - MAX_HISTORY);
plugin.settings.consoleHistories = Object.fromEntries(consoleHistories);
await plugin.saveSettings();
```

---

### P3 — UX avancée

#### Tâche 7 : Prompt visuel avec CWD

**`console.ts`** — mode "New Command" dans `sendCommand()` :
```ts
const shortDir = ctx.replace(/[^/\\]*$/, '').replace(/\/$/, '') || '.';
output.innerHTML += `<span class="console-cwd">${shortDir}</span><span class="console-command-line"> $ ${cmd}\n</span>`;
```

**`monacoHtml.css`** :
```css
.console-cwd { color: #569cd6; font-weight: normal; }
```

---

#### Tâche 8 : Copier la sortie avec clic droit

**`console.ts`** — après `output.addEventListener('click', ...)` :
```ts
output.addEventListener('contextmenu', (e) => {
  const selection = window.getSelection()?.toString();
  if (selection && selection.length > 0) {
    e.preventDefault();
    navigator.clipboard.writeText(selection);
  }
});
```

---

#### Tâche 9 : Drag-and-drop de fichiers dans l'input

**Inspiration** : `DragAndDropAddon` (emulator-addons.ts L51-95).

**`console.ts`** — dans `initConsolePane()` :
```ts
input.addEventListener('dragover', (e) => e.preventDefault());
input.addEventListener('drop', (e) => {
  e.preventDefault();
  const paths = Array.from(e.dataTransfer?.files ?? [])
    .map(f => (f as any).path as string)
    .filter(Boolean)
    .map(p => p.includes(' ') ? `"${p}"` : p);
  if (paths.length) {
    input.value += paths.join(' ');
    input.focus();
  }
});
```

---

#### Tâche 10 : Auto-truncate de la sortie

**`console.ts`** — dans le case `console-output`, après `scrollTop` :
```ts
const MAX_OUTPUT_LINES = 5000;
const lines = output.innerHTML.split('\n');
if (lines.length > MAX_OUTPUT_LINES) {
  output.innerHTML = lines.slice(-MAX_OUTPUT_LINES).join('\n');
}
```

---

#### Tâche 11 : Multi-line paste en mode stdin

**`console.ts`** — dans `initConsolePane()` :
```ts
input.addEventListener('paste', (e) => {
  if (!isRunning) return;
  const text = e.clipboardData?.getData('text');
  if (text && text.includes('\n')) {
    e.preventDefault();
    for (const line of text.split(/\r?\n/).filter(l => l.trim())) {
      output.innerHTML += `<span class="console-stdin-line">${line}\n</span>`;
      window.parent.postMessage(
        { type: 'send-stdin', text: line, context: ctx },
        getParentOrigin()
      );
    }
    output.scrollTop = output.scrollHeight;
  }
});
```

---

### P4 — Qualité de code

#### Tâche 12 : Typer les messages postMessage

**Nouveau fichier `src/editor/iframe/types/console.ts`** :
```ts
export type ConsoleOutMessage =
  | { type: 'toggle-console'; context: string }
  | { type: 'run-command'; cmd: string; context: string }
  | { type: 'send-stdin'; text: string; context: string }
  | { type: 'stop-command'; context: string }
  | { type: 'console-height-changed'; height: number; context: string };

export type ConsoleInMessage =
  | { type: 'console-toggle' }
  | { type: 'console-output'; text: string }
  | { type: 'console-process-exited'; code: number | null }
  | { type: 'console-history'; history: string[] };
```

---

#### Tâche 13 : Extraire le kill logic

**`messageHandler.ts`** — nouvelle fonction :
```ts
function killProcessTree(proc: ChildProcess): void {
  if (!proc.pid) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { shell: true });
    } else {
      process.kill(-proc.pid, 'SIGINT');
    }
  } catch {
    proc.kill('SIGINT');
  }
}
```

Utiliser dans `stop-command` et `cleanup()`.

---

## Résumé des fichiers à modifier

| Fichier | Tâches |
|---|---|
| `src/editor/iframe/console.ts` | 1, 4, 5, 7, 8, 9, 10, 11 |
| `src/editor/mountCodeEditor/messageHandler.ts` | 1, 2, 3, 5, 6, 13 |
| `src/editor/monacoHtml.css` | 7 |
| `src/editor/iframe/types/console.ts` | 12 (nouveau) |
| `src/editor/iframe/init.ts` | 5 (passage hauteur) |
| Settings du plugin | 5, 6 |

## Ordre d'implémentation

```
1→3→13 (robustesse) → 2 (env) → 4 (prefill) → 7→8→9 (UX)
→ 10→11 (UX suite) → 5→6 (persistance) → 12 (types)
```
