# Fiche de refonte UI — Console intégrée Monaco

## Le problème posé

La console actuelle a deux zones séparées :
- `#console-output` : zone de défilement pour les résultats
- `#console-input-bar` : barre fixe en bas avec `<input>`, Run, Stop

Ça ne ressemble **pas** à un terminal VSC. Dans VSC, le prompt et la sortie sont dans **le même flux** : on voit le CWD, on tape, le résultat s'affiche en dessous, puis un nouveau prompt apparaît.

De plus, le prompt actuel ne montre **pas le CWD réel** — si on fait `cd ..`, le spawn suivant ignore ce changement car chaque commande crée un nouveau processus dans le `fileDir` d'origine.

---

## Analyse des 3 approches possibles

### Option A — xterm.js dans l'iframe

C'est ce que fait `obsidian-terminal` et le terminal intégré de VSC.

| Pour | Contre |
|---|---|
| Rendu parfait (curseur, couleurs, TUI) | +700 Ko à bundler dans l'iframe blob URL |
| Support natif des séquences d'échappement | Nécessite un PTY (python/conpty) pour être utile |
| Copier-coller, sélection native | Complexité de maintenance x10 |
| xterm fait tout "gratuitement" | Duplique le travail de `obsidian-terminal` |

**Verdict : Overkill.** Notre console est un "run panel", pas un terminal interactif. On ne va pas refaire `obsidian-terminal` dans une iframe.

### Option B — Zone unifiée avec prompt inline (recommandée ✅)

On supprime la barre d'input séparée. Le prompt (avec CWD) est **rendu directement dans la zone de sortie**, et le champ de saisie est **visuellement intégré au flux**. On garde le `<input>` mais il est stylé pour ressembler à une continuation de la sortie.

| Pour | Contre |
|---|---|
| Look & feel terminal naturel | Un peu plus de CSS/JS |
| CWD visible dans le prompt | Le champ `<input>` reste un élément HTML séparé |
| Pas de nouvelle dépendance | Pas de vrai curseur dans la zone de sortie |
| Faible impact sur le code existant | — |

**C'est la bonne approche pour notre cas d'usage.**

### Option C — Shell persistant (single process)

Au lieu de `spawn` une commande à la fois, on garde un shell unique vivant (`cmd.exe` / `bash`) et on lui envoie les commandes via stdin. Le CWD est maintenu nativement par le shell.

| Pour | Contre |
|---|---|
| CWD géré automatiquement | Comment détecter la fin d'une commande ? (pas de signal clair) |
| Variables d'env persistantes | Parsing du prompt shell pour savoir quand c'est "prêt" |
| Plus proche d'un vrai terminal | Gestion d'état beaucoup plus complexe |
| — | Perte du contrôle fin sur chaque commande |

**Verdict : Trop complexe** pour le gain. Le tracking manuel du CWD est suffisant.

---

## Plan d'implémentation — Option B

### Changement 1 : Refonte HTML — Suppression des boutons, input intégré au flux

**Fichier** : `monacoEditor.html`

Remplacer la structure actuelle :
```html
<div id="console-pane" tabindex="0">
    <div id="console-resize-handle"></div>
    <div id="console-output"></div>
    <div id="console-input-bar">
        <input id="console-input-field" type="text" spellcheck="false" />
        <button id="console-run-btn">Run</button>
        <button id="console-stop-btn">Stop</button>
    </div>
</div>
```

Par :
```html
<div id="console-pane" tabindex="0">
    <div id="console-resize-handle"></div>
    <div id="console-output"></div>
    <div id="console-prompt-line">
        <span id="console-prompt-cwd"></span>
        <span id="console-prompt-symbol">$</span>
        <input id="console-input-field" type="text" spellcheck="false" />
    </div>
</div>
```

Les boutons Run/Stop disparaissent :
- **Run** → c'est Enter (déjà le cas)
- **Stop** → c'est Ctrl+C (déjà le cas)

### Changement 2 : CSS — Prompt intégré visuellement

**Fichier** : `monacoHtml.css`

Remplacer les styles `#console-input-bar` par :
```css
#console-prompt-line {
    display: flex;
    padding: 2px 8px;
    align-items: baseline;
    font-family: monospace;
    font-size: 12px;
    color: #ccc;
    /* No border-top — seamless with output */
}

#console-prompt-cwd {
    color: #569cd6;
    white-space: nowrap;
    margin-right: 4px;
}

#console-prompt-symbol {
    color: #0dbc79;
    font-weight: bold;
    margin-right: 6px;
}

#console-input-field {
    flex: 1;
    background: transparent;  /* Key: invisible background */
    color: #ccc;
    border: none;             /* Key: no border */
    padding: 0;
    font-family: monospace;
    font-size: 12px;
    outline: none;
    color-scheme: dark;
}
```

**Résultat visuel** (dans la zone de sortie puis le prompt en bas) :
```
script/                                     ← sortie précédente
Traceback (most recent call last):
  File "main.py", line 3
TypeError: unsupported operand type
[Process exited: code 1]

my-project/src $ █                          ← prompt inline avec CWD + curseur
```

Supprimer les styles `#console-run-btn`, `#console-stop-btn`, `#console-input-bar`.

### Changement 3 : Tracking du CWD côté parent

**Fichier** : `messageHandler.ts`

Ajouter une Map pour tracker le CWD actuel par contexte :
```ts
const currentCwd = new Map<string, string>();
```

Dans le case `run-command`, **avant** le `spawn` :
```ts
// Track CWD changes from 'cd' commands
const cdMatch = cmdLine.trim().match(/^cd\s+(.+)/i);
if (cdMatch) {
  const target = cdMatch[1].replace(/^["']|["']$/g, '');
  const currentDir = currentCwd.get(codeContext) ?? fileDir;
  const resolved = path.resolve(currentDir, target);
  // Validate that the directory exists before updating
  try {
    const stats = require('fs').statSync(resolved);
    if (stats.isDirectory()) {
      currentCwd.set(codeContext, resolved);
      send('console-cwd-changed', { cwd: resolved });
      // Don't spawn anything — cd is handled locally
      send('console-output', { text: '' });
      send('console-process-exited', { code: 0 });
      break;
    }
  } catch { /* falls through to spawn */ }
}
```

Utiliser `currentCwd.get(codeContext) ?? fileDir` comme `cwd` du spawn :
```ts
const cwd = currentCwd.get(codeContext) ?? fileDir;
const proc = spawn(shellCmd, [], { cwd, ... });
```

Envoyer le CWD initial à l'iframe :
```ts
// Dans le case 'toggle-console' ou 'ready'
send('console-cwd-changed', { cwd: fileDir });
```

### Changement 4 : Mise à jour du prompt côté iframe

**Fichier** : `console.ts`

Ajouter une variable de CWD et une fonction de mise à jour du prompt :
```ts
let currentCwd = '';

function updatePrompt(): void {
  const cwdEl = document.getElementById('console-prompt-cwd');
  const promptLine = document.getElementById('console-prompt-line');
  if (cwdEl) {
    // Show short relative path or last 2 segments
    const short = currentCwd.split(/[/\\]/).slice(-2).join('/');
    cwdEl.textContent = short;
  }
  // Hide prompt when a process is running (stdin mode)
  if (promptLine) {
    promptLine.style.display = isRunning ? 'none' : 'flex';
  }
}
```

**Quand un process est en cours** (`isRunning = true`), le prompt disparaît — le champ de saisie passe en "mode flottant" en bas pour le stdin :
```ts
// Quand isRunning passe à true : cacher le prompt, montrer un input stdin
// Quand isRunning passe à false : réafficher le prompt avec CWD
```

Dans `handleConsoleMessage`, ajouter :
```ts
case 'console-cwd-changed': {
  currentCwd = data.cwd as string;
  updatePrompt();
  return true;
}
```

Dans le case `console-process-exited` :
```ts
case 'console-process-exited': {
  isRunning = false;
  updatePrompt(); // Réaffiche le prompt
  return true;
}
```

### Changement 5 : Mode stdin pendant l'exécution

Quand `isRunning` est vrai, au lieu de cacher le prompt complètement, on transforme l'affichage :
- Le symbole `$` disparaît
- Le CWD disparaît
- Le champ `<input>` reste visible mais avec un placeholder "stdin..."

```ts
function updatePrompt(): void {
  const cwdEl = document.getElementById('console-prompt-cwd');
  const symbolEl = document.getElementById('console-prompt-symbol');
  const input = document.getElementById('console-input-field') as HTMLInputElement;
  if (cwdEl) cwdEl.style.display = isRunning ? 'none' : '';
  if (symbolEl) symbolEl.style.display = isRunning ? 'none' : '';
  if (input) {
    input.placeholder = isRunning ? 'stdin...' : '';
    // Update CWD in prompt
    if (cwdEl && !isRunning) {
      cwdEl.textContent = currentCwd.split(/[/\\]/).slice(-2).join('/');
    }
  }
}
```

### Changement 6 : Adaptation de `console.ts`

- Supprimer les références à `runBtn` et `stopBtn`
- Adapter le guard de `initConsolePane` (plus besoin de checker ces éléments)
- Le reste de la logique (historique, Ctrl+C, Ctrl+J, ANSI, drag-drop, paste) reste identique

---

## Résumé des fichiers à modifier

| Fichier | Changement |
|---|---|
| `monacoEditor.html` | Nouveau DOM : prompt inline, suppression boutons |
| `monacoHtml.css` | Styles du prompt inline, suppression styles boutons |
| `console.ts` | CWD tracking iframe, updatePrompt(), suppression refs boutons |
| `messageHandler.ts` | CWD tracking parent, interception `cd`, envoi `console-cwd-changed` |
| `buildInitParams.ts` | Passer le CWD initial dans les params |

## Ce qu'on ne change PAS

- L'architecture `spawn` + `postMessage` (validée, robuste)
- Le mécanisme `isRunning` / `console-process-exited` (vient d'être fiabilisé)
- L'historique, le resize, l'ANSI, le drag-drop, le multi-line paste
- La persistance (hauteur + historique dans les settings)

## Résultat attendu

```
┌─────────────────────────────────────────────┐
│ const x = 42;                               │  ← Monaco editor
│ console.log(x);                             │
│                                             │
├─────────────────────────────────────────────┤  ← resize handle
│ my-project/src $ node main.js               │  ← commande précédente
│ 42                                          │  ← sortie
│ [Process exited: code 0]                    │
│                                             │
│ my-project/src $ cd ..                      │
│                                             │
│ my-project $ █                              │  ← prompt actif avec CWD mis à jour
└─────────────────────────────────────────────┘
```
