# Console intégrée dans l'iframe Monaco

## Vision

Console intégrée directement dans l'iframe Monaco, pas dans une leaf Obsidian séparée.
`Ctrl+J` toggle un panneau en bas de l'éditeur. L'UI est dans l'iframe, le process
(`child_process.spawn`) tourne côté parent Obsidian via postMessage.

**Cas d'usage principal** : lancer le fichier courant (`node`, `python`, `ts-node`).

**Desktop uniquement** : le spawn est conditionné à `Platform.isDesktop` côté parent.

---

## Fichiers concernés

| Fichier | Action |
|---|---|
| `monacoEditor.html` | Ajouter `#wrapper` + `#console-pane` |
| `monacoHtml.css` | Styles du panneau console |
| `src/editor/iframe/actions.ts` | Ajouter `Ctrl+J` + action menu contextuel |
| `src/editor/iframe/init.ts` | Gérer les messages `console-toggle` et `console-output` |
| `src/editor/mountCodeEditor/messageHandler.ts` | Gérer `toggle-console` et `run-command` |
| `buildBlobUrl.ts` | Aucune modification nécessaire |
| `assetUrls.ts` | Aucune modification nécessaire |
| `mountCodeEditor.ts` | Aucune modification nécessaire |

---

## 1. monacoEditor.html

Remplace :
```html
<div id="container"></div>
```
par :
```html
<div id="wrapper">
    <div id="container"></div>
    <div id="console-pane">
        <div id="console-output"></div>
        <div id="console-input-bar">
            <input id="console-input-field" type="text" spellcheck="false" />
            <button id="console-run-btn">Run</button>
            <button id="console-stop-btn">Stop</button>
        </div>
    </div>
</div>
```

Dans le `<style>` inline, remplace :
```css
html, body, #container {
```
par :
```css
html, body, #wrapper {
```
Et retire `height: 100%` du `#container` (géré par flex désormais).

---

## 2. monacoHtml.css

Ajoute à la fin du fichier :

```css
#wrapper {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
}

#container {
    flex: 1;
    min-height: 0;
}

#console-pane {
    display: none; /* toggled via JS */
    height: 200px;
    flex-direction: column;
    border-top: 1px solid #444;
    background: #1e1e1e;
    color: #ccc;
    font-family: monospace;
    font-size: 12px;
}

#console-pane.visible {
    display: flex;
}

#console-output {
    flex: 1;
    overflow-y: auto;
    padding: 6px 8px;
    white-space: pre-wrap;
    word-wrap: break-word;
}

#console-input-bar {
    display: flex;
    padding: 4px 8px;
    gap: 6px;
    border-top: 1px solid #333;
    align-items: center;
}

#console-input-field {
    flex: 1;
    background: #2d2d2d;
    color: #ccc;
    border: 1px solid #444;
    padding: 2px 6px;
    font-family: monospace;
    font-size: 12px;
    outline: none;
}

#console-run-btn,
#console-stop-btn {
    padding: 2px 8px;
    cursor: pointer;
    font-size: 11px;
    background: #2d2d2d;
    color: #ccc;
    border: 1px solid #555;
    border-radius: 3px;
}

#console-run-btn:hover { background: #3a3a3a; }
#console-stop-btn:hover { background: #3a3a3a; }
```

---

## 3. actions.ts (iframe)

Ajouter dans `registerActions()`, après le bloc `Alt+Z` :

```ts
// Ctrl+J toggles the integrated console
editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyJ, () => {
    window.parent.postMessage(
        { type: 'toggle-console', context },
        getParentOrigin()
    );
});
```

Ajouter dans le menu contextuel, après `code-files-delete-file` :

```ts
editor.addAction({
    id: 'code-files-open-console',
    label: '🖥️ Open Console',
    contextMenuGroupId: 'code-files',
    contextMenuOrder: 5,
    run: () => {
        window.parent.postMessage(
            { type: 'toggle-console', context },
            getParentOrigin()
        );
    }
});
```

---

## 4. messageHandler.ts (parent)

Ajouter l'import :
```ts
import { Platform } from 'obsidian';
import { spawn, type ChildProcess } from 'child_process';
```

Ajouter une Map pour tracker les process actifs (au niveau module) :
```ts
const activeProcesses = new Map<string, ChildProcess>();
```

Ajouter deux cases avant le `default` :

```ts
case 'toggle-console': {
    if (!Platform.isDesktop) break;
    // Répercute le toggle à l'iframe — l'état visible/caché est géré dans l'iframe
    send('console-toggle', {});
    break;
}

case 'run-command': {
    if (!Platform.isDesktop) break;
    const cmdLine = data.cmd as string;
    if (!cmdLine?.trim()) break;

    // Kill le process précédent pour ce contexte
    activeProcesses.get(codeContext)?.kill();

    const parts = cmdLine.trim().split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);

    // basePath = chemin absolu du vault (FileSystemAdapter, Desktop uniquement)
    const basePath = (plugin.app.vault.adapter as any).basePath;

    try {
        const proc = spawn(cmd, args, {
            cwd: basePath,
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: true  // Délègue au shell système qui a le bon PATH
        });
        activeProcesses.set(codeContext, proc);

        // Streamer stdout/stderr vers l'iframe via postMessage
        proc.stdout?.on('data', (chunk) => {
            send('console-output', { text: chunk.toString() });
        });
        proc.stderr?.on('data', (chunk) => {
            send('console-output', { text: chunk.toString() });
        });
        proc.on('close', (code) => {
            send('console-output', { text: `\nProcess exited with code ${code}\n` });
            activeProcesses.delete(codeContext);
        });
        proc.on('error', (err) => {
            send('console-output', { text: `Error: ${err.message}\n` });
            activeProcesses.delete(codeContext);
        });
    } catch (err) {
        send('console-output', { text: `Failed to start: ${err}\n` });
    }
    break;
}

case 'stop-command': {
    activeProcesses.get(codeContext)?.kill('SIGINT');
    activeProcesses.delete(codeContext);
    break;
}
```

---

## 5. init.ts (iframe)

Ajouter une fonction d'initialisation du panneau console et ses handlers,
appelée à la fin de `applyParams()` :

```ts
function initConsolePane(ctx: string): void {
    const pane = document.getElementById('console-pane');
    const output = document.getElementById('console-output');
    const input = document.getElementById('console-input-field') as HTMLInputElement;
    const runBtn = document.getElementById('console-run-btn');
    const stopBtn = document.getElementById('console-stop-btn');
    if (!pane || !output || !input || !runBtn || !stopBtn) return;

    const sendCommand = (): void => {
        const cmd = input.value.trim();
        if (!cmd) return;
        output.innerHTML += `<span>$ ${cmd}\n</span>`;
        output.scrollTop = output.scrollHeight;
        window.parent.postMessage({ type: 'run-command', cmd, context: ctx }, getParentOrigin());
    };

    runBtn.addEventListener('click', sendCommand);
    stopBtn.addEventListener('click', () => {
        window.parent.postMessage({ type: 'stop-command', context: ctx }, getParentOrigin());
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendCommand();
    });
}
```

Dans le switch de `window.addEventListener('message', ...)`, ajouter :

```ts
case 'console-toggle': {
    const pane = document.getElementById('console-pane');
    pane?.classList.toggle('visible');
    // Forcer Monaco à recalculer sa hauteur après le toggle
    editor?.layout();
    break;
}

case 'console-output': {
    const output = document.getElementById('console-output');
    if (output) {
        // ansi_up n'est pas disponible dans l'iframe — on strip les séquences ANSI
        const clean = (data.text as string).replace(/\x1b\[[0-9;]*m/g, '');
        output.innerHTML += clean;
        output.scrollTop = output.scrollHeight;
    }
    break;
}
```

Appeler `initConsolePane(context)` à la fin de `applyParams()`, après `registerActions()`.

---

## Séquence complète

```
Ctrl+J dans Monaco (iframe)
  └─ postMessage { type: 'toggle-console', context }
       └─ messageHandler.ts → send('console-toggle', {})
            └─ init.ts → classList.toggle('visible') + editor.layout()

Clic Run ou Enter dans #console-input-field (iframe)
  └─ postMessage { type: 'run-command', cmd, context }
       └─ messageHandler.ts → spawn(cmd, args, { cwd: basePath })
            └─ stdout/stderr → send('console-output', { text })
                 └─ init.ts → #console-output.innerHTML += text
```

---

## Notes importantes

- `ansi_up` n'est pas dans l'iframe (pas bundlé dans `monacoBundle.js`). Strip ANSI basique
  avec `/\x1b\[[0-9;]*m/g` dans l'iframe. Si on veut les couleurs, il faut soit bundler
  `ansi_up` dans `monacoBundle.js`, soit l'injecter via `buildBlobUrl.ts` comme les autres assets.
- `activeProcesses` dans `messageHandler.ts` : attention aux fuites si l'iframe est détruite
  avant que le process se termine. Killer dans le `destroy()` du `CodeEditorHandle` en appelant
  `send('stop-command', {})` avant de retirer le listener.
- `editor.layout()` est indispensable après le toggle : Monaco ne détecte pas le changement
  de hauteur de son conteneur si `automaticLayout: true` n'est pas actif ou si le resize
  est trop rapide.
- ENOENT sur `tsc` signifie que le process enfant ne trouve pas l'exécutable dans son PATH. Le `spawn` côté Obsidian hérite d'un PATH limité qui ne contient pas les binaires npm globaux.

  Deux solutions :

  **1. Passer le shell comme interpréteur** (plus simple) :

  Dans `messageHandler.ts`, remplace :
  ```ts
  const proc = spawn(cmd, args, {
      cwd: basePath,
      stdio: ['ignore', 'pipe', 'pipe']
  });
  ```
  par :
  ```ts
  const proc = spawn(cmd, args, {
      cwd: basePath,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true  // délègue au shell système qui a le bon PATH
  });
  ```

  **2. Injecter le PATH explicitement** (plus propre mais plus complexe) :

  ```ts
  const proc = spawn(cmd, args, {
      cwd: basePath,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: process.env.PATH }
  });
  ```

  L'option `shell: true` est la plus rapide à tester. Elle fait passer la commande par `cmd.exe` sur Windows ou `/bin/sh` sur Mac/Linux, qui ont le PATH complet de l'utilisateur. L'inconvénient est que ça rend le parsing de la commande dépendant du shell, mais pour l'usage console c'est acceptable.

---

## État d'avancement

- [x] `monacoEditor.html` : restructuration DOM
- [x] `monacoHtml.css` : styles console
- [x] `actions.ts` : `Ctrl+J` + action menu contextuel
- [x] `messageHandler.ts` : cases `toggle-console`, `run-command`, `stop-command`
- [x] `init.ts` : `initConsolePane()` + cases `console-toggle`, `console-output`
- [x] Tester le toggle et le resize Monaco
- [x] Tester `node`, `python`, `ts-node` sur les trois OS
- [x] Gérer le kill propre dans `destroy()` du CodeEditorHandle

---

## Perspectives d'évolution

**Immédiat et utile**

Historique des commandes avec flèche haut/bas, comme dans un vrai terminal. Un tableau `history: string[]` et un index, géré dans le `keydown` de l'input field.

Pré-remplissage automatique de la commande selon l'extension du fichier ouvert. `.ts` → `ts-node`, `.py` → `python`, `.js` → `node`. Le `context` (chemin du fichier) est disponible dans `initConsolePane`, donc on peut déduire l'extension au moment de l'init et pré-remplir l'input.

**Un peu plus de travail**

Redimensionnement du panneau console par drag sur la bordure du haut, comme dans VSCode. Un `mousedown` sur `#console-pane`'s border top, puis `mousemove` pour ajuster la hauteur.

Couleurs ANSI dans la sortie. Bundler `ansi_up` dans `monacoBundle.js` et remplacer le strip regex par un vrai rendu HTML coloré.

**Plus ambitieux**

Stdin interactif : pour l'instant `stdio: ['ignore', 'pipe', 'pipe']` ignore stdin. Passer à un vrai pipe stdin permettrait d'interagir avec des scripts qui attendent une saisie (`input()` en Python, `readline` en Node).

Lequel t'intéresse en premier ?
