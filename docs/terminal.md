# Fonctionnement du Plugin Terminal (xterm.js)

Ce document détaille l'architecture et le fonctionnement interne du plugin `obsidian-terminal`. Contrairement à la console intégrée (Monaco), ce plugin fournit un véritable émulateur de terminal complet (PTY) capable de gérer des shells interactifs (bash, zsh, powershell), des outils en ligne de commande et des applications textuelles complexes (ncurses).

## Architecture en Couches

L'implémentation est divisée en trois couches principales pour séparer l'interface Obsidian, le moteur de rendu du terminal et la logique système du processus.

### 1. La Vue Obsidian (`TerminalView`)
Située dans `src/terminal/view.ts`, c'est une `ItemView` qui s'intègre dans le workspace d'Obsidian.
- **Rôle** : Gérer le cycle de vie de l'onglet, la persistance de l'état (sérialisation) et l'interface utilisateur (menus, recherche).
- **Sérialisation** : Elle sauvegarde non seulement les paramètres du profil, mais aussi le buffer xterm actuel et la position du défilement via la propriété dynamique `serial` ([view.ts:L413](file:///C:/Users/dd200/Desktop/polyipseity/obsidian-terminal/src/terminal/view.ts#L413)).

### 2. L'Émulateur de Terminal (`XtermTerminalEmulator`)
Situé dans `src/terminal/emulator.ts`, il s'agit d'un wrapper autour de **xterm.js**.
- **Rôle** : Faire le pont entre le composant de rendu (frontend) et le pseudo-terminal (backend).
- **Addons** : Il charge dynamiquement des extensions comme `fit` (redimensionnement), `serialize` (sauvegarde du texte), `webgl` (rendu accéléré) et `ligatures` ([emulator.ts:L204](file:///C:/Users/dd200/Desktop/polyipseity/obsidian-terminal/src/terminal/emulator.ts#L204)).
- **Resizing** : Gère le redimensionnement synchronisé du frontend et du backend avec un mécanisme de *debounce* pour éviter les saccades ([emulator.ts:L123-L175](file:///C:/Users/dd200/Desktop/polyipseity/obsidian-terminal/src/terminal/emulator.ts#L123-L175)).

### 3. Le Pseudo-terminal (PTY)
C'est la partie la plus complexe, située dans `src/terminal/pseudoterminal.ts`. Elle définit une interface `Pseudoterminal` qui abstrait la communication avec le processus système.

---

## Gestion Multi-plateforme du PTY

Node.js ne fournit pas de PTY (Pseudo-Terminal) natif de manière cross-platform sans modules natifs binaires (comme `node-pty`). Pour éviter les dépendances binaires difficiles à distribuer, ce plugin utilise des scripts **Python** auxiliaires.

### Windows (`WindowsPseudoterminal`)
Sur Windows, Node.js ne peut pas créer de PTY réel. 
1. **Lancement** : Le plugin génère un fichier `.bat` temporaire pour lancer la commande cible. Cela permet de contourner les bugs d'échappement de `conhost.exe` ([pseudoterminal.ts:L907](file:///C:/Users/dd200/Desktop/polyipseity/obsidian-terminal/src/terminal/pseudoterminal.ts#L907)).
2. **Redimensionnement** : Il lance un script Python `win32_resizer.py` qui utilise les API Win32 natives pour ajuster la taille de la fenêtre de console cachée associée au processus ([pseudoterminal.ts:L848](file:///C:/Users/dd200/Desktop/polyipseity/obsidian-terminal/src/terminal/pseudoterminal.ts#L848)).

### Unix / macOS (`UnixPseudoterminal`)
Sur macOS et Linux, le plugin utilise le module Python natif `pty`.
- **Mécanisme** : Le script `unix_pseudoterminal.py` crée un "master/slave PTY" et y attache le processus. Cela garantit que les programmes comme `vim` ou `top` croient tourner dans un vrai terminal ([pseudoterminal.ts:L1129](file:///C:/Users/dd200/Desktop/polyipseity/obsidian-terminal/src/terminal/pseudoterminal.ts#L1129)).

---

## Types de Terminaux Spéciaux

Le plugin propose des implémentations de PTY qui ne sont pas des shells système :

### Console de Développement (`DeveloperConsolePseudoterminal`)
Permet d'interagir directement avec l'environnement d'Obsidian.
- **REPL** : Évalue du code JavaScript dans le contexte de la fenêtre Obsidian ([pseudoterminal.ts:L514](file:///C:/Users/dd200/Desktop/polyipseity/obsidian-terminal/src/terminal/pseudoterminal.ts#L514)).
- **Logs** : Intercepte les messages de `console.log` d'Obsidian (via `patch.ts`) pour les afficher de manière stylisée avec des couleurs ANSI dans le terminal ([pseudoterminal.ts:L458](file:///C:/Users/dd200/Desktop/polyipseity/obsidian-terminal/src/terminal/pseudoterminal.ts#L458)).

### Texte Statique (`TextPseudoterminal`)
Une implémentation simple qui affiche du texte brut, utilisée principalement pour l'affichage de documentation ou de messages d'erreur persistants.

---

## Points Techniques Clés

### Partage de PTY (`RefPsuedoterminal`)
Pour permettre de déplacer des onglets de terminal sans tuer le processus, le plugin utilise un système de **compteur de références** ([pseudoterminal.ts:L116](file:///C:/Users/dd200/Desktop/polyipseity/obsidian-terminal/src/terminal/pseudoterminal.ts#L116)). Le PTY n'est réellement tué (`kill`) que lorsque le dernier onglet l'utilisant est fermé.

### Flux de Données (`pipe`)
La méthode `pipe(terminal: Terminal)` connecte les flux :
- `stdin` (clavier) -> `shell.stdin`
- `stdout/stderr` (affichage) -> `terminal.write()`
Un `DisposerAddon` assure le nettoyage des listeners lorsque le terminal est détruit pour éviter les fuites de mémoire ([pseudoterminal.ts:L1070](file:///C:/Users/dd200/Desktop/polyipseity/obsidian-terminal/src/terminal/pseudoterminal.ts#L1070)).

---

## Fichiers de Référence (Projet `obsidian-terminal`)

- [src/terminal/view.ts](file:///C:/Users/dd200/Desktop/polyipseity/obsidian-terminal/src/terminal/view.ts) : Vue Obsidian et intégration UI.
- [src/terminal/emulator.ts](file:///C:/Users/dd200/Desktop/polyipseity/obsidian-terminal/src/terminal/emulator.ts) : Gestion d'xterm.js et des addons.
- [src/terminal/pseudoterminal.ts](file:///C:/Users/dd200/Desktop/polyipseity/obsidian-terminal/src/terminal/pseudoterminal.ts) : Logique PTY et gestion des processus (Windows/Unix).
- [src/terminal/win32_resizer.py](file:///C:/Users/dd200/Desktop/polyipseity/obsidian-terminal/src/terminal/win32_resizer.py) : Script de redimensionnement Windows.
- [src/terminal/unix_pseudoterminal.py](file:///C:/Users/dd200/Desktop/polyipseity/obsidian-terminal/src/terminal/unix_pseudoterminal.py) : Script PTY pour Unix.
