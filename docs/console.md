# Terminal intégré sous Monaco

## Vision

Ouvrir une console directement sous l'éditeur Monaco via `Ctrl+J`. La console connaît le fichier en cours et peut le lancer immédiatement. Elle est indépendante de l'éditeur : elle persiste si on change d'onglet, et plusieurs instances peuvent coexister.

Feature Desktop uniquement (`Platform.isDesktop`). Sur mobile : no-op silencieux.

**Cas d'usage principal : lancer le fichier courant.** `node fichier.js`, `python script.py`, `ts-node fichier.ts`. Le reste (grep, npm install, tests) est secondaire.

---

## Architecture : Monaco comme zone de saisie

Plutôt que xterm.js (émulateur de terminal complet), on réutilise `mountCodeEditor` — déjà utilisé pour l'éditeur principal et les mini-éditeurs dans les settings. La ConsoleView est divisée en deux zones :

```
┌─────────────────────────────────────┐
│  Zone de sortie (div scrollable)    │  ← stdout / stderr du process
│  logs, erreurs, résultat du script  │
│                                     │
├─────────────────────────────────────┤
│  Zone de saisie (mini Monaco)       │  ← mountCodeEditor, language: 'shell'
│  $ node mon-fichier.ts              │  ← hauteur fixe ~60-80px
└─────────────────────────────────────┘
```

**Pourquoi pas xterm.js ?**
xterm.js est un émulateur de terminal complet (~500 ko) conçu pour interpréter les séquences ANSI d'un vrai shell. C'est la solution de VSCode. Mais VSCode hérite aussi de ses limitations : pas d'insertion libre du curseur en milieu de ligne, édition de ligne gérée par readline/bash et non par l'éditeur lui-même.

**Pourquoi Monaco est meilleur ici ?**
La zone de saisie Monaco offre nativement : insertion libre du curseur n'importe où sur la ligne, sélection, copier-coller, historique gérable en JS, et potentiellement l'autocomplétion. C'est une expérience d'édition supérieure à ce que propose VSCode dans son terminal intégré. Pas de nouvelle dépendance : `mountCodeEditor` existe déjà.

La zone de sortie est un simple `<div>` scrollable. Pour les séquences ANSI de couleur dans la sortie (ex. logs colorés de Node.js), un parser ANSI léger suffit (`ansi_up`, ~10 ko) — pas besoin d'un émulateur complet.

---

## Flux de déclenchement

```
Monaco (iframe)
  └─ Ctrl+J détecté dans onKeyDown
       └─ postMessage { type: 'open-console', context: filePath }
            └─ messageHandler.ts (côté parent)
                 └─ app.workspace.splitActiveLeaf('horizontal')
                      └─ new ConsoleView(filePath)
```

1. `actions.ts` : ajouter `Ctrl+J` dans `registerActions` → `postMessage { type: 'open-console', context }`.
2. `messageHandler.ts` : nouveau case `'open-console'` → ouvre la leaf en dessous.
3. `ConsoleView` : vue Obsidian avec zone de sortie + mini Monaco.

---

## Raccourci dans Monaco

Dans `actions.ts`, ajouter dans `registerActions` :

```ts
editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyJ, () => {
  window.parent.postMessage(
    { type: 'open-console', context },
    getParentOrigin()
  );
});
```

Dans `messageHandler.ts`, case `'open-console'` :

```ts
case 'open-console': {
  if (!Platform.isDesktop) break;
  const leaf = plugin.app.workspace.splitActiveLeaf('horizontal');
  await leaf.setViewState({
    type: 'console-view',
    state: { file: codeContext }
  });
  break;
}
```

---

## Architecture de ConsoleView

```ts
// src/editor/consoleView/index.ts
export class ConsoleView extends ItemView {
  private outputEl: HTMLDivElement;
  private inputEditor: CodeEditorHandle | null = null;
  private currentProcess: ChildProcess | null = null;
  private filePath: string;

  async onOpen(): Promise<void> {
    // Zone de sortie
    this.outputEl = this.contentEl.createDiv({ cls: 'console-output' });

    // Mini Monaco pour la saisie (réutilise mountCodeEditor)
    const inputContainer = this.contentEl.createDiv({ cls: 'console-input' });
    this.inputEditor = await mountCodeEditor({
      plugin: this.plugin,
      language: 'shell',
      initialValue: `node ${this.filePath}`,
      codeContext: 'console-input',
      containerEl: inputContainer,
      onSave: () => this.runCommand()  // Entrée → lancer
    });
  }

  private runCommand(): void {
    // Killer le process précédent si actif
    this.currentProcess?.kill();
    const cmd = this.inputEditor?.getValue() ?? '';
    // Parser cmd et spawner le process
    // Pipe stdout/stderr → this.outputEl
  }

  async onClose(): Promise<void> {
    this.currentProcess?.kill();
    this.inputEditor?.destroy();
  }
}
```

### Interaction avec le fichier courant

- `filePath` est transmis via le postMessage depuis Monaco.
- La zone de saisie est pré-remplie avec la commande d'exécution par défaut selon l'extension (`.ts` → `ts-node`, `.py` → `python`, `.js` → `node`).
- Un bouton "Run" relance la dernière commande sans retaper.
- `Ctrl+C` envoie `SIGINT` au process enfant.

---

## Console de debug : eruda (optionnel, séparé)

Pour déboguer l'iframe Monaco elle-même, pas le fichier utilisateur.

- **eruda** : ~350 ko minifié, ~100 ko gzippé. Négligeable (plugin = 21,4 Mo).
- Injecté dans l'iframe via `buildBlobUrl.ts`, chargé uniquement à la demande.
- Expose un panneau DevTools miniature dans l'iframe : logs Monaco internes, erreurs silencieuses dans `registerFormatters()` ou `buildRevertWidgets()`, messages postMessage, état du DOM de l'iframe (diff overlay, glyph widgets). Sans eruda, ces infos ne sont accessibles qu'en ouvrant les DevTools Electron et en naviguant manuellement dans le bon frame.
- Conditionné à un flag debug dans les settings du plugin. Pas destiné aux utilisateurs finaux.

Usage distinct de la ConsoleView : eruda inspecte l'iframe Monaco, la ConsoleView exécute des fichiers sur le système de fichiers réel.

---

## Poids des dépendances

| Package | Rôle | Taille minifiée | Taille gzippée |
|---|---|---|---|
| `ansi_up` | Parser ANSI pour la zone de sortie | ~10 ko | ~4 ko |
| `eruda` (optionnel) | Debug iframe Monaco | ~350 ko | ~100 ko |

`mountCodeEditor` et `child_process` (Node.js natif) : zéro dépendance supplémentaire.

Contexte : plugin actuel = 21,4 Mo.

---

## État d'avancement

- [ ] Ajouter `Ctrl+J` dans `actions.ts`
- [ ] Ajouter case `'open-console'` dans `messageHandler.ts`
- [ ] Créer `ConsoleView` avec zone de sortie + mini Monaco
- [ ] Enregistrer le view type dans `main.ts`
- [ ] Connecter `child_process.spawn` à la zone de sortie
- [ ] Parser les séquences ANSI dans la sortie (`ansi_up`)
- [ ] Détecter l'extension du fichier pour pré-remplir la commande
- [ ] Gérer `Ctrl+C` → `SIGINT` sur le process enfant
- [ ] Gérer la fermeture propre du process enfant
- [ ] Protéger avec `Platform.isDesktop`
- [ ] (Optionnel) Intégrer eruda pour le debug de l'iframe Monaco
