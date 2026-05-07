# Fonctionnement de la Console intégrée (Monaco Iframe)

La console est intégrée directement dans l'iframe Monaco. Elle permet d'exécuter des commandes système (Node.js, Python, etc.) sur le fichier actuellement ouvert sans utiliser de vue Obsidian séparée.

## Architecture

Le panneau de console est un élément du DOM interne à l'iframe Monaco. Le processus (`child_process.spawn`) tourne côté parent (Obsidian) et communique avec l'iframe via postMessage.

- **Cas d'usage principal** : Lancer le fichier courant (`node`, `python`, `npx ts-node`).
- **Desktop uniquement** : L'exécution de commandes est réservée à la version Desktop d'Obsidian.
- **Modularité** : La logique est isolée dans `src/editor/iframe/console.ts`.

## Structure UI (monacoEditor.html)

L'éditeur Monaco et la console sont encapsulés dans un `#wrapper` flex :
```html
<div id="wrapper">
    <div id="container"></div>
    <div id="console-pane" tabindex="0">
        <div id="console-resize-handle"></div>
        <div id="console-output"></div>
        <div id="console-input-bar">
            <input id="console-input-field" type="text" spellcheck="false" />
            <button id="console-run-btn">Run</button>
            <button id="console-stop-btn">Stop</button>
        </div>
    </div>
</div>
```

## Fonctionnalités Implémentées

### 1. Exécution et Stdin Interactif
- **Exécution** : Lance les commandes via le shell système (`shell: true`).
- **Stdin** : Support complet des entrées interactives (`input()` en Python, `readline` en Node). Le flag `isRunning` dans l'iframe détermine si l'input envoie une commande (`run-command`) ou du texte au processus (`send-stdin`).
- **Auto-remplissage** : Détection de l'extension pour suggérer la commande appropriée (`.ts` -> `npx ts-node`, etc.).

### 2. Contrôle et Robustesse
- **Interruption (Ctrl+C)** : Utilise `taskkill /T /F` sur Windows et les groupes de processus (`-pid`) sur Unix pour tuer proprement l'arbre de processus (shell + enfants).
- **Reset de l'UI** : Le parent envoie une notification de fin forcée pour garantir que l'interface se débloque même si le processus est tué brutalement.
- **Historique** : Navigation dans les commandes précédentes avec les flèches **Haut** et **Bas** dans le champ de saisie.

### 3. Rendu et Ergonomie
- **Couleurs ANSI** : Intégration de `ansi_up` (bundlé dans `monacoBundle.js`) pour un rendu fidèle des sorties colorées.
- **Redimensionnement** : Un handle de drag en haut du panneau permet d'ajuster la hauteur (entre 80px et 80% de la fenêtre).
- **Nettoyage** : Les processus sont automatiquement tués lors de la fermeture du fichier ou de la destruction de l'éditeur.

## Flux de Communication

### Séquence de lancement
```
Enter dans #console-input-field (iframe)
  └─ postMessage { type: 'run-command', cmd, context }
       └─ messageHandler.ts → spawn(cmd, args, { stdio: 'pipe', shell: true })
            └─ stdout/stderr → send('console-output', { text })
                 └─ console.ts → rendu ANSI + scroll automatique
```

### Séquence Stdin
```
Enter dans #console-input-field (si isRunning === true)
  └─ postMessage { type: 'send-stdin', text, context }
       └─ messageHandler.ts → proc.stdin.write(text + '\n')
```

## Configuration Technique (messageHandler.ts)

Le processus est lancé avec des options spécifiques pour permettre l'interaction et un arrêt propre :
```ts
const proc = spawn(cmd, args, {
    cwd: fileDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: true,
    detached: process.platform !== 'win32'
});
```

- **`shell: true`** : Indispensable pour hériter du PATH utilisateur et trouver les binaires comme `node` ou `python`.
- **`detached: true`** : Permet de créer un groupe de processus sur Unix pour que `process.kill(-pid)` tue aussi les processus enfants.

## Raccourcis Clavier
- **Ctrl + J** : Basculer l'affichage de la console (depuis l'éditeur ou le panneau).
- **Ctrl + C** : Interrompre le processus en cours (lorsque le panneau a le focus).

---

## Fichiers concernés
- `src/editor/iframe/console.ts` : Logique métier de la console.
- `src/editor/iframe/init.ts` : Dispatcher des messages.
- `src/editor/mountCodeEditor/messageHandler.ts` : Gestion des processus côté Obsidian.
- `src/editor/monacoHtml.css` : Styles et thémage ANSI.
