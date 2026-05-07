# Console intégrée Monaco — Fiche d'améliorations

## Contexte du projet

Plugin Obsidian (`obsidian-code-files-modif`) qui ouvre les fichiers de code dans un éditeur Monaco via une iframe blob URL. La console est un panneau intégré **dans l'iframe Monaco** (pas une vue Obsidian séparée) qui exécute des commandes système via `child_process.spawn` côté parent Obsidian.

## Contraintes architecturales critiques

1. **Isolation iframe** : L'UI de la console vit dans l'iframe (blob URL). Le parent Obsidian n'a **aucun accès DOM** à la console. Toute communication passe par `postMessage`.
2. **Direction des messages** :
   - Iframe → Parent : `window.parent.postMessage({ type, context, ... }, getParentOrigin())`
   - Parent → Iframe : `send(type, payload)` (via `iframe.contentWindow.postMessage`)
3. **`context`** : Chaque message contient `context` (= chemin du fichier), qui sert de filtre dans `messageHandler.ts` pour router les messages au bon éditeur.
4. **Desktop uniquement** : Toutes les cases console dans `messageHandler.ts` sont gardées par `if (!Platform.isDesktop) break;`.
5. **CSP blob URL** : Les scripts dans l'iframe sont inlinés en base64 via `buildBlobUrl.ts`. Si on ajoute une dépendance npm dans l'iframe, elle doit être bundlée dans `monacoBundle.js` (via `monacoMain.ts` → esbuild) ou inlinée dans `buildBlobUrl.ts`.
6. **Commentaires en anglais**. JSDoc en anglais. Documentation `docs/` en français.
7. **Nommage** : Les messages iframe→parent utilisent des noms d'action (`toggle-console`, `run-command`, `stop-command`). Les messages parent→iframe utilisent des noms d'événement (`console-toggle`, `console-output`).

## Architecture actuelle

### Fichiers concernés (chemins relatifs à la racine du projet)

| Fichier | Rôle console |
|---|---|
| `src/editor/iframe/actions.ts` | `Ctrl+J` keybinding + action menu contextuel |
| `src/editor/iframe/init.ts` | `initConsolePane()` (L142-204) + cases `console-toggle` (L516) et `console-output` (L527) dans le message listener |
| `src/editor/monacoEditor.html` | DOM : `#wrapper > #container + #console-pane` |
| `src/editor/monacoHtml.css` | Styles du panneau (L78-144) |
| `src/editor/mountCodeEditor/messageHandler.ts` | Cases `toggle-console` (L170), `run-command` (L177), `stop-command` (L231) + `activeProcesses` Map + `cleanup()` |

### Flux de messages

```
[Iframe]                              [Parent (messageHandler.ts)]
  |                                          |
  |-- toggle-console ----------------------->|
  |<--------------- console-toggle ----------|  (relay)
  |                                          |
  |-- run-command { cmd } ------------------>|
  |                                  spawn(cmd, { shell:true, cwd:fileDir })
  |<---------- console-output { text } ------|  (stdout chunk)
  |<---------- console-output { text } ------|  (stderr chunk)
  |<---------- console-output { text } ------|  (exit code)
  |                                          |
  |-- stop-command ------------------------->|
  |                                  proc.kill('SIGINT')
```

### État actuel de `initConsolePane()` (init.ts L142-204)

- Auto-fill de l'input selon l'extension (`.ts` → `npx ts-node`, `.py` → `python`, `.js` → `node`)
- `clear`/`cls` interceptés côté iframe (pas envoyés au parent)
- `Ctrl+C` sur le pane → envoie `stop-command`
- `Ctrl+J` sur le pane et sur l'input → envoie `toggle-console`
- `Enter` dans l'input → `sendCommand()`
- Les boutons Run/Stop → click handlers

### État actuel du spawn (messageHandler.ts L177-228)

- `spawn(cmd, args, { cwd: fileDir, stdio: ['ignore', 'pipe', 'pipe'], shell: true })`
- `stdin` est à `'ignore'` → aucune entrée interactive possible
- `stdout`/`stderr` streamés via `console-output`
- `setTimeout(50)` avant le message d'exit code (race condition data/close)
- `activeProcesses` Map : 1 process par `codeContext`
- Cleanup dans `buildMessageHandler().cleanup()` appelé par `destroy()` dans `mountCodeEditor.ts`

---

## Tâches à implémenter

### Tâche 1 : Historique des commandes (flèche haut/bas)

**Objectif** : Naviguer dans l'historique des commandes saisies avec ↑/↓ dans `#console-input-field`.

**Fichier** : `src/editor/iframe/init.ts` — dans `initConsolePane()`

**Implémentation** :
```ts
// At the top of initConsolePane, after the element checks
const history: string[] = [];
let historyIndex = -1;
```

Dans `sendCommand()`, avant l'envoi :
```ts
history.push(cmd);
historyIndex = history.length; // Reset to "after last" position
```

Dans le `keydown` listener de `input` (L193), ajouter avant le check `Enter` :
```ts
if (e.key === 'ArrowUp') {
  e.preventDefault();
  if (historyIndex > 0) {
    historyIndex--;
    input.value = history[historyIndex];
  }
  return;
}
if (e.key === 'ArrowDown') {
  e.preventDefault();
  if (historyIndex < history.length - 1) {
    historyIndex++;
    input.value = history[historyIndex];
  } else {
    historyIndex = history.length;
    input.value = '';
  }
  return;
}
```

**Pas de nouveau message postMessage** nécessaire — tout reste côté iframe.

---

### Tâche 2 : Stdin interactif

**Objectif** : Permettre d'envoyer de l'input à un processus en cours (pour `input()` Python, `readline` Node, etc.).

**Fichiers** :
- `src/editor/mountCodeEditor/messageHandler.ts`
- `src/editor/iframe/init.ts`

**Côté parent** (`messageHandler.ts`) :

1. Changer `stdio` de `['ignore', 'pipe', 'pipe']` à `['pipe', 'pipe', 'pipe']` dans le `spawn` (L200).

2. Ajouter un nouveau case avant `default` :
```ts
case 'send-stdin': {
  const proc = activeProcesses.get(codeContext);
  if (proc?.stdin?.writable) {
    proc.stdin.write((data.text as string) + '\n');
  }
  break;
}
```

**Côté iframe** (`init.ts`) :

Modifier `sendCommand()` : si un process est actif (on ne sait pas côté iframe, mais on peut utiliser un flag), envoyer en stdin au lieu de lancer une nouvelle commande.

Approche recommandée : ajouter un state `isRunning` dans `initConsolePane()` :
```ts
let isRunning = false;
```

Le mettre à `true` dans `sendCommand()` quand on envoie `run-command`. Le remettre à `false` quand on reçoit un `console-output` contenant `Process exited with code`.

Modifier `sendCommand()` :
```ts
const sendCommand = (): void => {
  const cmd = input.value.trim();
  if (!cmd) return;
  if (cmd === 'clear' || cmd === 'cls') {
    output.innerHTML = '';
    input.value = '';
    return;
  }
  if (isRunning) {
    // Send to stdin of the active process
    output.innerHTML += `<span>${cmd}\n</span>`;
    output.scrollTop = output.scrollHeight;
    window.parent.postMessage(
      { type: 'send-stdin', text: cmd, context: ctx },
      getParentOrigin()
    );
    input.value = '';
    return;
  }
  // ... existing run-command logic
};
```

**Nouveau message** : `send-stdin` (iframe→parent).

---

### Tâche 3 : Ctrl+C robuste (sous-processus)

**Objectif** : `Ctrl+C` doit tuer le processus ET ses sous-processus (important pour les scripts batch, les serveurs dev, etc.).

**Fichier** : `src/editor/mountCodeEditor/messageHandler.ts`

**Problème actuel** : `proc.kill('SIGINT')` ne tue que le process direct. Avec `shell: true`, le process est un shell (`cmd.exe` ou `/bin/sh`) qui a spawné le vrai processus. Le `SIGINT` arrive au shell mais pas forcément à l'enfant.

**Solution** : Utiliser `tree-kill` (ou implémenter manuellement via `process.pid`).

Option sans dépendance supplémentaire (Windows + Unix) :
```ts
case 'stop-command': {
  const proc = activeProcesses.get(codeContext);
  if (!proc?.pid) break;
  try {
    // On Windows, taskkill /T kills the process tree
    // On Unix, negative PID kills the process group
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { shell: true });
    } else {
      process.kill(-proc.pid, 'SIGINT');
    }
  } catch {
    proc.kill('SIGINT');
  }
  activeProcesses.delete(codeContext);
  break;
}
```

**Note** : Pour que `-proc.pid` fonctionne sur Unix, il faut ajouter `detached: true` dans les options de `spawn` (L198-201) :
```ts
const proc = spawn(cmd, args, {
  cwd: fileDir,
  stdio: ['pipe', 'pipe', 'pipe'], // 'pipe' for stdin too (Tâche 2)
  shell: true,
  detached: process.platform !== 'win32' // Create process group on Unix
});
```

Appliquer la même logique dans `cleanup()` (L244-247).

---

### Tâche 4 : Redimensionnement par drag

**Objectif** : Permettre de redimensionner la hauteur du panneau console en draggant sa bordure supérieure.

**Fichiers** :
- `src/editor/monacoEditor.html` — ajouter un élément drag handle
- `src/editor/monacoHtml.css` — styles du handle
- `src/editor/iframe/init.ts` — logique de drag

**HTML** (dans `monacoEditor.html`, avant `#console-output`) :
```html
<div id="console-pane" tabindex="0">
    <div id="console-resize-handle"></div>
    <div id="console-output"></div>
    <!-- ... rest -->
</div>
```

**CSS** (dans `monacoHtml.css`) :
```css
#console-resize-handle {
  height: 4px;
  cursor: ns-resize;
  background: transparent;
  flex-shrink: 0;
}
#console-resize-handle:hover {
  background: #007acc;
}
```

**JS** (dans `initConsolePane()`, après les checks d'éléments) :
```ts
const resizeHandle = document.getElementById('console-resize-handle');
if (resizeHandle) {
  let startY = 0;
  let startHeight = 0;

  const onMouseMove = (e: MouseEvent): void => {
    const delta = startY - e.clientY;
    const newHeight = Math.max(80, Math.min(window.innerHeight * 0.8, startHeight + delta));
    pane.style.height = newHeight + 'px';
    editor?.layout();
  };

  const onMouseUp = (): void => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.body.style.userSelect = '';
  };

  resizeHandle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startY = e.clientY;
    startHeight = pane.offsetHeight;
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}
```

**Important** : Appeler `editor?.layout()` pendant le drag pour que Monaco recalcule sa taille en temps réel.

---

### Tâche 5 : Couleurs ANSI

**Objectif** : Afficher les séquences ANSI en couleur au lieu de les stripper.

**Dépendance** : `ansi_up` est déjà dans `package.json` (`"ansi_up": "^6.0.6"`).

**Problème** : `ansi_up` n'est pas dans l'iframe. Il est installé en tant que dépendance mais pas bundlé dans `monacoBundle.js`.

**Solution** : L'importer dans le code iframe (il sera bundlé automatiquement par esbuild via `monacoMain.ts`).

**Fichier** : `src/editor/iframe/init.ts`

1. Ajouter l'import en haut :
```ts
import AnsiUp from 'ansi_up';
```

2. Dans `initConsolePane()`, créer une instance :
```ts
const ansiUp = new AnsiUp();
ansiUp.use_classes = true; // Use CSS classes instead of inline styles
```

3. Dans le case `console-output` (L527-535), remplacer :
```ts
const clean = (data.text as string).replace(/\x1b\[[0-9;]*m/g, '');
output.innerHTML += clean;
```
par :
```ts
output.innerHTML += ansiUp.ansi_to_html(data.text as string);
```

4. Ajouter les styles ANSI dans `monacoHtml.css` (si `use_classes = true`) :
```css
.ansi-black-fg { color: #000; }
.ansi-red-fg { color: #cd3131; }
.ansi-green-fg { color: #0dbc79; }
.ansi-yellow-fg { color: #e5e510; }
.ansi-blue-fg { color: #2472c8; }
.ansi-magenta-fg { color: #bc3fbc; }
.ansi-cyan-fg { color: #11a8cd; }
.ansi-white-fg { color: #e5e5e5; }
.ansi-bright-black-fg { color: #666; }
.ansi-bright-red-fg { color: #f14c4c; }
.ansi-bright-green-fg { color: #23d18b; }
.ansi-bright-yellow-fg { color: #f5f543; }
.ansi-bright-blue-fg { color: #3b8eea; }
.ansi-bright-magenta-fg { color: #d670d6; }
.ansi-bright-cyan-fg { color: #29b8db; }
.ansi-bright-white-fg { color: #fff; }
```

**Alternative** : utiliser `ansiUp.use_classes = false` pour des styles inline (pas besoin de CSS), mais c'est moins flexible pour le theming.

**Vérification bundling** : `ansi_up` sera bundlé automatiquement dans `monacoBundle.js` car il est importé dans `init.ts` qui est importé dans `monacoMain.ts`. Esbuild résout les `node_modules` automatiquement. Aucune modification de `buildBlobUrl.ts` nécessaire.

---

### Tâche 6 : Extraction du code console dans un module dédié

**Objectif** : `initConsolePane()` est actuellement une fonction de 60+ lignes dans `init.ts`. Avec les ajouts (historique, stdin, resize), elle va devenir trop volumineuse. L'extraire dans un module dédié.

**Nouveau fichier** : `src/editor/iframe/console.ts`

**Contenu** :
```ts
/**
 * Console pane initialization and event handling for the Monaco iframe.
 * Manages command execution, history, stdin, resize, and ANSI rendering.
 */
import AnsiUp from 'ansi_up';
import { getParentOrigin } from './utils.ts';

// ... move initConsolePane() here
// ... move related state (history, isRunning, ansiUp) here
// Export initConsolePane and handleConsoleMessage
```

**Exports** :
- `initConsolePane(ctx: string, editor: Monaco.editor.IStandaloneCodeEditor | null): void`
- `handleConsoleMessage(data: Record<string, unknown>, editor: Monaco.editor.IStandaloneCodeEditor | null): boolean` — retourne `true` si le message a été géré (pour le switch dans `initMonacoApp`)

**Dans `init.ts`** : remplacer la fonction inline et les cases du switch par les appels à ces exports.

---

## Ordre d'implémentation recommandé

1. **Tâche 6** (extraction module) — Prépare la structure pour le reste
2. **Tâche 1** (historique) — Trivial, aucun nouveau message
3. **Tâche 3** (Ctrl+C robuste) — Fix critique
4. **Tâche 2** (stdin) — Nécessite le changement de `stdio`
5. **Tâche 4** (drag resize) — Pure UI
6. **Tâche 5** (couleurs ANSI) — Bundling à vérifier

## Conventions du projet

- **Commentaires** : En anglais, sur le **pourquoi** et le **comment** quand ce n'est pas évident. Pas de commentaires triviaux.
- **JSDoc** : En anglais, sur les exports publiques et les fonctions non triviales.
- **Indentation** : 2 espaces (`.editorconfig`).
- **Imports** : Avec extension `.ts` (ex: `import { foo } from './utils.ts'`).
- **Types** : Centralisés dans `src/types/types.ts`. Si une interface concerne uniquement la console et ne sort pas du module iframe, elle peut rester dans le fichier.
- **Tests** : Pas de framework de test. Tester manuellement dans Obsidian.
