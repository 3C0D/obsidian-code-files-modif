# Fonctionnement de la Console intégrée (Monaco Iframe)

La console est intégrée directement dans l'iframe Monaco. Elle permet d'exécuter des commandes système (Node.js, Python, etc.) sur le fichier actuellement ouvert sans utiliser de vue Obsidian séparée.

## Architecture Globale

Le panneau de console est un élément du DOM interne à l'iframe Monaco. Le processus (`child_process.spawn`) tourne côté parent (Obsidian) et communique avec l'iframe via `postMessage`.

- **Isolation** : L'iframe (blob URL) ne peut pas exécuter de code système elle-même. Elle délègue tout au parent via `postMessage`.
- **Modularité** : La logique métier est isolée dans `src/editor/iframe/console.ts`.
- **Typage** : Les communications sont sécurisées par des types définis dans `src/editor/iframe/types/console.ts`.
- **Desktop uniquement** : L'exécution est réservée à la version Desktop d'Obsidian (Electron expose Node.js ; la version mobile ne l'a pas).

---

## Structure UI (monacoEditor.html)

L'éditeur Monaco et la console sont encapsulés dans un `#wrapper` flex (direction colonne) :

```html
<div id="wrapper">
    <div id="container"></div>
    <div id="console-pane" tabindex="0">
        <div id="console-resize-handle"></div>
        <div id="console-output"></div>
        <div id="console-prompt-line">
            <span id="console-prompt-cwd"></span>
            <span id="console-prompt-symbol">$</span>
            <input id="console-input-field" type="text" spellcheck="false" />
        </div>
    </div>
</div>
```

`tabindex="0"` rend le `div` focusable, ce qui permet de capturer les raccourcis clavier (Ctrl+C, Ctrl+J) même quand le curseur n'est pas dans le champ de saisie.

---

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
   - L'utilisateur tape une commande (ex : `python script.py`).
   - L'iframe envoie `run-command` au parent.
   - Le parent lance (`spawn`) le processus.
   - L'iframe passe `isRunning` à **VRAI**.

2. **Si `isRunning` est VRAI** :
   - Un programme est déjà en cours d'exécution.
   - Le texte saisi est une réponse à une demande du programme (ex : un `input()` Python).
   - L'iframe envoie `send-stdin` au parent.
   - Le parent écrit ce texte dans le flux d'entrée standard (`stdin`) du processus existant.

3. **Retour à l'état initial** :
   - Dès que le parent détecte que le processus est terminé, il envoie un message structuré `console-process-exited`.
   - L'iframe repasse `isRunning` à **FAUX**, libérant la console pour une nouvelle commande.

> [!NOTE]
> Ce mécanisme est robuste : il repose sur un message dédié (`console-process-exited`) et non sur un scan textuel de la sortie, ce qui élimine tout risque de faux positif si un programme écrivait lui-même du texte contenant "Process exited".

### Redimensionnement optimisé (Performance)

Pour éviter que l'interface ne se fige pendant le drag de la poignée, la logique est séparée en deux flux :

1. **Mise à jour visuelle (Synchrone)** : La hauteur du DOM (`pane.style.height`) change immédiatement à chaque `mousemove`. La bordure suit le curseur de façon fluide.
2. **Mise à jour logique (Throttled)** : L'appel coûteux `editor.layout()` est encapsulé dans un utilitaire `throttle` générique, limité à une exécution toutes les 50 ms. Monaco se réajuste régulièrement sans saturer le thread principal.

La hauteur choisie est persistée dans les paramètres du plugin lors du relâchement de la souris.

### Gestion des entrées et UX

- **Nettoyage** : Le champ d'entrée est systématiquement vidé après l'envoi.
- **Historique** : Navigation avec les flèches Haut/Bas. L'historique est persisté dans les réglages du plugin par fichier.
- **Auto-fill** : Pré-remplissage intelligent basé sur l'extension du fichier (supporte TS, JS, PY, C++, Rust, Go, etc.). Utilise `tsx` pour le TypeScript.
- **Prompt visuel (Inline)** : Affiche le dossier courant (CWD) et un symbole `$` directement dans le flux. L'input est transparent et sans bordure pour une intégration fluide. Le prompt se masque automatiquement (`display: none`) quand un processus est en cours pour indiquer le mode stdin.
- **Navigation (cd)** : Les commandes `cd` sont interceptées par le parent. Au lieu de lancer un processus, le parent résout le chemin cible, vérifie son existence, et met à jour un état `currentCwd` persistant pour la session. Toutes les commandes suivantes utiliseront ce nouveau répertoire.
- **Auto-fill** : Pré-remplissage intelligent basé sur l'extension du fichier (supporte TS, JS, PY, C++, Rust, Go, etc.). Utilise `tsx` pour le TypeScript.

  | Extension | Commande pré-remplie |
  |---|---|
  | `.ts`, `.mts`, `.cts` | `npx tsx <fichier>` |
  | `.js`, `.mjs`, `.cjs` | `node <fichier>` |
  | `.py` | `python <fichier>` |
  | `.sh` | `bash <fichier>` |
  | `.ps1` | `powershell -File <fichier>` |
  | `.rb` | `ruby <fichier>` |
  | `.go` | `go run <fichier>` |
  | `.rs` | `cargo run` |
  | `.java` | `java <fichier>` |
  | `.lua`, `.php`, `.r`, `.pl` | commande spécifique + fichier |

- **Copie** : Clic droit sur la sortie pour copier la sélection dans le presse-papier via `navigator.clipboard`.
- **Drag-and-Drop** : Glisser des fichiers depuis l'explorateur vers l'input insère leur chemin (entre guillemets si nécessaire).
- **Paste multi-ligne (mode stdin)** : En mode interactif, coller un texte contenant des sauts de ligne envoie chaque ligne séparément.
- **ANSI** : Rendu des couleurs via `ansi_up`.
- **Truncate** : La sortie est limitée aux 5 000 dernières lignes pour préserver les performances du DOM.

---

## Gestion des Processus (messageHandler.ts)

Le parent gère l'exécution réelle via Node.js `child_process.spawn`.

### 1. Lancement (`run-command`)

Le processus est lancé avec `stdio: ['pipe', 'pipe', 'pipe']` : les trois flux (entrée, sortie standard, erreurs) sont branchés et contrôlés par le plugin.

L'environnement est enrichi pour garantir la compatibilité :

```ts
env: {
  ...process.env,        // Hérite du PATH et des variables système
  PYTHONIOENCODING: 'utf-8', // Force l'encodage UTF-8 pour Python
  GIT_PAGER: '',         // Désactive le pager de git (évite que git log bloque)
  FORCE_COLOR: '1',      // Demande aux programmes de produire des couleurs ANSI
}
```

Le CWD (répertoire de travail) est maintenu par le parent dans une `Map` par contexte. Il est initialisé au répertoire du fichier mais peut être modifié via la commande `cd` interceptée.

### 2. Signalement de fin de processus

À la fermeture du processus, le parent envoie deux messages distincts :

- `console-output` avec le texte `"\nProcess exited with code N\n"` (pour l'affichage).
- `console-process-exited` avec le code de sortie structuré (pour réinitialiser `isRunning`).

Un délai de 50 ms est appliqué avant l'envoi pour s'assurer que tous les événements `data` de `stdout`/`stderr` ont été traités (race condition inévitable avec les streams Node.js).

### 3. Interruption et Nettoyage (`stop-command` et `cleanup`)

La logique de kill est centralisée dans une fonction `killProcessTree` réutilisée par `stop-command` et par le nettoyage à la destruction de la vue :

- **Windows** : `taskkill /pid [pid] /T /F` tue l'arbre de processus complet (le shell `cmd.exe` et tous ses enfants).
- **Unix** : `process.kill(-proc.pid, 'SIGINT')` envoie le signal au groupe de processus entier (nécessite `detached: true` au spawn).
- **Fallback** : `proc.kill('SIGINT')` si le tree-kill échoue.

Après un `stop-command`, un message `console-process-exited` est envoyé manuellement pour garantir que `isRunning` repasse à `false`, car le kill forcé peut empêcher l'événement `close` de se déclencher normalement.

### 4. Gestion de l'encodage et décodage des flux

Pour garantir que les caractères accentués (comme le `é` en français) s'affichent correctement, une double stratégie est employée :

- **Côté Shell (Windows)** : Avant chaque commande, on force la page de code `65001` (UTF-8) via `chcp 65001 >nul 2>&1`. Cela assure que les utilitaires système (`dir`, `python`, etc.) produisent une sortie en UTF-8 au lieu du format OEM local (CP850).
- **Côté Node.js (Décodage)** : Au lieu d'utiliser `chunk.toString()`, on utilise `TextDecoder` avec l'option `{ stream: true }`. Cela permet de gérer les cas où un caractère UTF-8 multi-octets est coupé entre deux paquets de données (chunks).

> [!IMPORTANT]
> Deux instances de `TextDecoder` distinctes sont utilisées (une pour `stdout`, une pour `stderr`) afin de maintenir l'état interne de chaque flux indépendamment et éviter toute corruption de texte si les deux flux émettent simultanément.

---

## Problèmes connus & TODO

- [ ] **Ctrl+C Global** : Un Ctrl+C n'importe où dans Obsidian peut interférer si le listener sur le `pane` n'est pas assez ciblé — à investiguer avec `stopPropagation`.
- [ ] **Interactivité avancée** : Support de l'auto-complétion (Tab) dans la console.

---

## Notes Techniques

- **Race Condition** : Délai de 50 ms à la fin du processus pour vider les buffers `stdout`/`stderr` avant de signaler l'exit.
- **Performance** : `editor.layout()` est appelé uniquement lors des changements de taille ou de visibilité, jamais en continu.
- **Dispatching** : Routage automatique des messages `console-*` dans `init.ts`.
- **Historique** : Persisté dans `plugin.settings.consoleHistories` (objet indexé par chemin de fichier, cap à 50 entrées par fichier).

---

## Fichiers concernés

- [`src/editor/iframe/console.ts`](../src/editor/iframe/console.ts) : Logique métier de la console (UI, états, messages entrants).
- [`src/editor/iframe/init.ts`](../src/editor/iframe/init.ts) : Dispatcher des messages.
- [`src/editor/iframe/types/console.ts`](../src/editor/iframe/types/console.ts) : Types des messages `postMessage` (entrée/sortie).
- [`src/editor/mountCodeEditor/messageHandler.ts`](../src/editor/mountCodeEditor/messageHandler.ts) : Gestion des processus côté Obsidian.
- [`src/editor/monacoHtml.css`](../src/editor/monacoHtml.css) : Styles et thémage ANSI.
- [`src/editor/monacoEditor.html`](../src/editor/monacoEditor.html) : Structure DOM de la console.
- [`src/editor/iframe/actions.ts`](../src/editor/iframe/actions.ts) : Actions et raccourcis clavier Monaco.
- [`src/editor/mountCodeEditor/mountCodeEditor.ts`](../src/editor/mountCodeEditor/mountCodeEditor.ts) : Orchestration du montage de l'iframe.

---

## Annexe — Théorie : Qu'est-ce qu'une console embarquée ?

### Le modèle standard : stdin / stdout / stderr

Tout programme en ligne de commande communique via trois flux (streams) standard :

- **stdin** (entrée standard) : ce que le programme reçoit comme données. Dans un terminal classique, c'est ce que l'utilisateur tape.
- **stdout** (sortie standard) : ce que le programme écrit comme résultat normal. Par exemple, `print("bonjour")` en Python écrit sur stdout.
- **stderr** (sortie d'erreur) : réservé aux messages d'erreur et d'avertissement. Séparé de stdout pour pouvoir rediriger les erreurs indépendamment.

`spawn` avec `stdio: ['pipe', 'pipe', 'pipe']` connecte ces trois flux au plugin, qui peut ainsi les lire et y écrire à la demande.

### Ce que nous avons construit : un "Run Panel"

Notre console est ce qu'on appelle un **run panel** : un panneau d'exécution contextuel. Elle lance un programme, collecte sa sortie et permet d'envoyer des données à son entrée. C'est le modèle utilisé par les IDE intégrés (VSCode "Terminal", PyCharm "Run", etc.) pour les exécutions simples.

Ce modèle convient parfaitement pour :
- Exécuter des scripts (Python, Node.js, Go, Rust, etc.)
- Voir la sortie colorée (ANSI)
- Interagir avec des programmes qui demandent des saisies simples (`input()` Python, `readline` Node.js)

### Ce que nous n'avons pas construit : un émulateur de terminal (PTY)

Un **PTY** (Pseudo-Terminal) est un composant système qui simule un vrai terminal matériel. Il gère des protocoles de bas niveau : positionnement du curseur, effacement de lignes, modes raw/cooked, taille de fenêtre (TIOCGWINSZ), etc.

Les projets comme `obsidian-terminal` implémentent un PTY complet avec `xterm.js` (rendu) et des scripts auxiliaires (Python ou C pour le côté système) pour supporter des programmes qui requièrent un vrai terminal : `vim`, `htop`, `ssh`, `man`, shells interactifs avec complétion, etc.

Ce niveau de complexité n'est pas justifié dans notre cas pour deux raisons :

1. Notre usage cible l'exécution de scripts, pas l'émulation d'un shell généraliste.
2. Un PTY complet implique des dépendances natives multiplateformes, un rendu par canvas WebGL, et une surface de maintenance significativement plus grande.

### Résumé comparatif

| Capacité | Run Panel (notre approche) | Émulateur PTY complet |
|---|---|---|
| Exécuter un script | Oui | Oui |
| Voir la sortie colorée (ANSI) | Oui (via `ansi_up`) | Oui (natif xterm.js) |
| Envoyer du texte au programme | Oui (stdin pipe) | Oui (PTY master) |
| Shell interactif (`bash`, `cmd`) | Partiel | Oui |
| `vim`, `htop`, `ssh` | Non | Oui |
| Taille de fenêtre dynamique (resize PTY) | Non nécessaire | Oui |
| Complexité d'implémentation | Faible | Élevée |
| Dépendances natives | Aucune | Oui (scripts Python/C) |

### Les signaux Unix

Quand un processus doit être interrompu, le système utilise des **signaux** : des notifications asynchrones envoyées à un processus.

- **SIGINT** : Interruption (équivalent de Ctrl+C). Demande au programme de s'arrêter proprement.
- **SIGTERM** : Terminaison douce. Le programme peut choisir d'ignorer ce signal.
- **SIGKILL** : Terminaison forcée. Irrattrapable, le noyau tue le processus immédiatement.

Sur Windows, ce modèle n'existe pas nativement. On utilise `taskkill /T /F` pour tuer un arbre de processus de force.

### Le problème du "process group"

Quand on lance `npx tsx script.ts` avec `shell: true`, le système crée en réalité une chaîne : un shell (cmd.exe ou sh) qui lui-même lance `npx`, qui lui-même lance `node`. Si on envoie SIGINT seulement au shell, les processus enfants peuvent continuer à tourner en arrière-plan.

`detached: true` sur Unix détache le processus dans son propre groupe. `process.kill(-pid, 'SIGINT')` (noter le `-` devant le PID) envoie alors le signal à tout le groupe simultanément, garantissant un arrêt complet de la chaîne.
