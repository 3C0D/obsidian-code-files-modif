# Fonctionnement de la Console intégrée (Monaco Iframe)

La console est intégrée directement dans l'iframe Monaco. Elle permet d'exécuter des commandes système (Node.js, Python, etc.) sur le fichier actuellement ouvert sans utiliser de vue Obsidian séparée.

## Architecture Globale

Le panneau de console est un élément du DOM interne à l'iframe Monaco. Le processus (`child_process.spawn`) tourne côté parent (Obsidian) et communique avec l'iframe via postMessage.

- **Isolation** : L'iframe (blob URL) ne peut pas exécuter de code système elle-même. Elle délègue tout au parent via `postMessage`.
- **Modularité** : La logique métier est isolée dans `src/editor/iframe/console.ts`.
- **Typage** : Les communications sont sécurisées par des types définis dans `src/editor/iframe/types/console.ts`.
- **Desktop uniquement** : L'exécution est réservée à la version Desktop d'Obsidian.

## Structure UI (monacoEditor.html)

L'éditeur Monaco et la console sont encapsulés dans un `#wrapper` flex (direction colonne) :
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

## Intégration dans Monaco (actions.ts)

La console est enregistrée comme une action et une commande dans Monaco :

### 1. Raccourci Clavier (Ctrl+J)
```ts
editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyJ, () => {
    window.parent.postMessage({ type: 'toggle-console', context }, getParentOrigin());
});
```

### 2. Menu Contextuel
Une action "🖥️ Open Console" est ajoutée au groupe `code-files` du menu contextuel.

---

## Logique Iframe (console.ts)

### Le mécanisme `isRunning` (Mode Commande vs Mode Stdin)
C'est le point clé pour l'interactivité. L'iframe maintient un état interne `isRunning` pour savoir comment interpréter la touche **Enter** :

1. **Si `isRunning` est FAUX** :
   - L'utilisateur tape une commande (ex: `python script.py`).
   - L'iframe envoie `run-command` au parent.
   - Le parent lance (`spawn`) le processus.
   - L'iframe passe `isRunning` à **VRAI**.

2. **Si `isRunning` est VRAI** :
   - Un programme est déjà en cours d'exécution.
   - Si l'utilisateur tape du texte, c'est probablement une réponse à une demande du programme (ex: un `input()` en Python).
   - L'iframe envoie `send-stdin` au parent.
   - Le parent écrit ce texte dans l'entrée standard (`stdin`) du processus existant.

3. **Retour à l'état initial** :
   - Dès que le parent détecte que le processus est terminé, il envoie un message structuré `console-process-exited`.
   - L'iframe repasse `isRunning` à **FAUX**, libérant la console pour une nouvelle commande.
   - > [!NOTE]
     > Ce mécanisme est désormais robuste et ne dépend plus d'un scan textuel de la sortie standard.

### Redimensionnement optimisé (Performance)
Pour éviter que l'interface ne se fige pendant le drag, la logique de redimensionnement est séparée en deux flux :
1.  **Mise à jour visuelle (Synchrone)** : La hauteur du DOM (`pane.style.height`) change immédiatement.
2.  **Mise à jour logique (Throttled)** : L'appel coûteux `editor.layout()` est limité à une exécution toutes les 50ms via un utilitaire `throttle` générique intégré.

### Gestion des entrées et UX
- **Nettoyage** : Le champ d'entrée est systématiquement vidé après l'envoi.
- **Historique** : Navigation avec les flèches Haut/Bas. L'historique est persisté dans les réglages du plugin par fichier.
- **Auto-fill** : Pré-remplissage intelligent basé sur l'extension du fichier (supporte TS, JS, PY, C++, Rust, Go, etc.). Utilise `tsx` pour le TypeScript.
- **Prompt visuel** : Affiche le dossier courant (CWD) devant le symbole `$`.
- **Copie** : Clic droit sur la sortie pour copier la sélection dans le presse-papier.
- **Drag-and-Drop** : Possibilité de glisser des fichiers depuis l'explorateur vers l'input pour insérer leurs chemins.
- **ANSI** : Rendu des couleurs via `ansi_up`.
- **Truncate** : La sortie est limitée aux 5000 dernières lignes pour préserver les performances du DOM.

---

## Gestion des Processus (messageHandler.ts)

Le parent gère l'exécution réelle via Node.js `child_process.spawn`.

### 1. Lancement (`run-command`)
Le processus est lancé avec `stdio: ['pipe', 'pipe', 'pipe']` et un environnement enrichi (`PYTHONIOENCODING: 'utf-8'`, `FORCE_COLOR: '1'`).

### 2. Interruption et Nettoyage (`stop-command`)
- **Arbre de processus** : Utilise une logique de "tree-kill" (via `taskkill` sur Windows et les groupes de processus sur Unix) pour s'assurer que les sous-processus sont également arrêtés.
- **Persistance** : Sauvegarde la hauteur de la console dans les réglages du plugin lors du redimensionnement.

---

## Problèmes connus & TODO

- [ ] **Ctrl+C Global** : Actuellement, un Ctrl+C n'importe où dans Obsidian peut interférer si le listener n'est pas assez ciblé.
- [ ] **Interactivité avancée** : Support de l'auto-complétion dans la console.

---

## Notes Techniques
- **Race Condition** : Délai de 50ms à la fin pour vider les buffers.
- **Performance** : `editor.layout()` est appelé uniquement lors des changements de taille ou de visibilité.
- **Dispatching** : Routage automatique des messages `console-*` dans `init.ts`.

---

## Fichiers concernés
- [src/editor/iframe/console.ts](../src/editor/iframe/console.ts) : Logique métier de la console.
- [src/editor/iframe/init.ts](../src/editor/iframe/init.ts) : Dispatcher des messages.
- [src/editor/mountCodeEditor/messageHandler.ts](../src/editor/mountCodeEditor/messageHandler.ts) : Gestion des processus côté Obsidian.
- [src/editor/monacoHtml.css](../src/editor/monacoHtml.css) : Styles et thémage ANSI.
- [src/editor/monacoEditor.html](../src/editor/monacoEditor.html) : Structure DOM de la console.
- [src/editor/iframe/actions.ts](../src/editor/iframe/actions.ts) : Actions et raccourcis clavier.
- [src/editor/mountCodeEditor/mountCodeEditor.ts](../src/editor/mountCodeEditor/mountCodeEditor.ts) : Orchestration du montage de l'iframe.
