# Fonctionnement de la Console intégrée (Monaco Iframe)

La console est intégrée directement dans l'iframe Monaco. Elle permet d'exécuter des commandes système (Node.js, Python, etc.) sur le fichier actuellement ouvert sans utiliser de vue Obsidian séparée.

## Architecture Globale

Le panneau de console est un élément du DOM interne à l'iframe Monaco. Le processus (`child_process.spawn`) tourne côté parent (Obsidian) et communique avec l'iframe via postMessage.

- **Isolation** : L'iframe (blob URL) ne peut pas exécuter de code système elle-même. Elle délègue tout au parent.
- **Modularité** : La logique métier est isolée dans `src/editor/iframe/console.ts`.
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
   - Dès que le parent détecte que le processus est terminé, il envoie un message contenant "Process exited with code".
   - L'iframe repasse `isRunning` à **FAUX**, libérant la console pour une nouvelle commande.
   - > [!CAUTION]
     > Cette détection repose sur une comparaison de sous-chaîne dans le flux de sortie. Si le message de sortie change dans `messageHandler.ts` sans être mis à jour ici, l'état `isRunning` pourrait rester bloqué à vrai.

### Redimensionnement optimisé (Performance)
Pour éviter que l'interface ne se fige pendant le drag, la logique de redimensionnement est séparée en deux flux :
1.  **Mise à jour visuelle (Synchrone)** : La hauteur du DOM (`pane.style.height`) change immédiatement.
2.  **Mise à jour logique (Throttled)** : L'appel coûteux `editor.layout()` est limité à une exécution toutes les 50ms via un utilitaire `throttle` générique intégré.

### Gestion des entrées
- **Nettoyage** : Le champ d'entrée est systématiquement vidé (`input.value = ''`) après l'envoi d'une commande (mode commande ou mode stdin).
- **Historique** : Navigation avec les flèches Haut/Bas.
- **ANSI** : Rendu des couleurs via `ansi_up`.

---

## Gestion des Processus (messageHandler.ts)

Le parent gère l'exécution réelle via Node.js `child_process.spawn`.

### 1. Lancement (`run-command`)
Le processus est lancé avec `stdio: ['pipe', 'pipe', 'pipe']`. Cela signifie que les trois flux (Entrée, Sortie, Erreur) sont "branchés" et peuvent être lus/écrits par le plugin.

### 2. Interruption et Nettoyage (`stop-command`)
- **Windows** : `taskkill /pid [pid] /T /F` (tue l'arbre complet).
- **Unix** : `process.kill(-proc.pid, 'SIGINT')` (tue le groupe de processus).
- **Reset UI** : Un message de sortie forcé est envoyé à l'iframe pour garantir que `isRunning` repasse à faux.

---

## Problèmes connus & TODO

- [ ] **Ctrl+C Global** : Actuellement, un Ctrl+C n'importe où dans Obsidian peut interférer si le listener n'est pas assez ciblé.
- [ ] **Prompt visuel** : Ajouter le chemin courant et un symbole `>` (ex: `C:\Users\>`) devant l'input pour imiter un vrai terminal.
- [ ] **Persistance du Resize** : Sauvegarder la hauteur de la console dans les paramètres.

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
