# Raccourcis dans le menu contextuel de Monaco Editor

## Vue d'ensemble

Les raccourcis ajoutés au menu contextuel de Monaco Editor sont implémentés via l'API `editor.addAction()` avec le paramètre `contextMenuGroupId` défini sur `'code-files'`. Cela permet d'afficher ces actions dans le menu contextuel qui apparaît lors d'un clic droit dans l'éditeur.

## Mécanismes d'enregistrement

### Actions statiques

Les actions sont enregistrées dans la fonction `registerActions()` du fichier `src/editor/iframe/actions.ts`. Chaque action définit :

- `id` : Identifiant unique de l'action
- `label` : Texte affiché dans le menu avec un emoji descriptif
- `contextMenuGroupId` : `'code-files'` pour grouper les actions personnalisées
- `contextMenuOrder` : Numéro d'ordre pour l'organisation dans le menu
- `keybindings` (optionnel) : Raccourci clavier associé
- `run` : Fonction exécutée lors de l'activation

### Actions dynamiques (Hotkeys)

Certaines actions utilisent des raccourcis configurables via les hotkeys d'Obsidian (et overridables via le plugin settings tab) :

- **Command Palette** : Ouvre la palette de commandes d'Obsidian
- **Settings** : Ouvre les paramètres d'Obsidian
- **Delete File** : Supprime le fichier actuel

Ces actions sont gérées par :

1. `registerHotkeyActions()` : Enregistre les actions avec les raccourcis initiaux
2. `updateHotkeys()` : Met à jour les raccourcis lors des changements de configuration
3. `editor.onKeyDown()` : Gestionnaire d'événements pour les raccourcis dynamiques

## Conversion des hotkeys

Les hotkeys d'Obsidian sont convertis en keybindings Monaco via `hotkeyToMonacoKeybinding()` dans `src/editor/iframe/keybindingUtils.ts` :

- Mappe les clés (lettres, chiffres, F-keys, etc.) vers les codes Monaco
- Combine avec les modificateurs (Ctrl/Cmd, Shift, Alt)
- Retourne un bitmask pour les keybindings statiques

## Types de raccourcis

Le plugin gère deux types de raccourcis clavier pour le menu contextuel :

### Raccourcis liés à Obsidian (overridables)

Trois actions utilisent des raccourcis issus de la configuration hotkeys d'Obsidian, mais peuvent être personnalisés via les paramètres du plugin :

- **Command Palette** : Ouvre la palette de commandes d'Obsidian (défaut : Ctrl+P)
- **Settings** : Ouvre les paramètres d'Obsidian (défaut : Ctrl+,)
- **Delete File** : Supprime le fichier actuel (défaut : variable selon Obsidian)

Ces raccourcis sont marqués "(Obsidian default)" dans l'interface si aucun override n'est défini. Ils sont configurables dans l'onglet "Monaco Hotkey Overrides" des paramètres du plugin.

### Raccourcis directs

Un raccourci est défini directement dans le plugin (via les paramètres du plugin), sans lien avec les raccourcis d'Obsidian :

- **Open Console** : Ouvre la console Monaco (défaut : Ctrl+J)

## Fonctionnement dynamique

Les keybindings des actions dynamiques sont mis à jour en temps réel lors des changements de configuration. Les actions sont re-enregistrées avec les nouveaux raccourcis via `registerHotkeyActions()`, ce qui met à jour leur affichage dans le menu contextuel et la palette de commandes de Monaco.

Les raccourcis dynamiques utilisent également `editor.onKeyDown()` pour une gestion flexible indépendante de la disposition clavier.

## Actions disponibles

Voici la liste des actions ajoutées au menu contextuel :

1. **Return to Default View** (uniquement pour extensions non enregistrées)
2. **Toggle Word Wrap** (Alt+Z)
3. **Format Document** (Shift+Alt+F)
4. **Show Format Diff**
5. **Rename Extension**
6. **Change Theme**
7. **Formatter Config**
8. **Delete File** (raccourci lié à Obsidian, overridable)
9. **Open Console** (raccourci direct, configurable, défaut Ctrl+J)
10. **Save** (Ctrl+S)

Toutes ces actions communiquent avec Obsidian via `window.parent.postMessage()` pour déclencher les actions appropriées.
