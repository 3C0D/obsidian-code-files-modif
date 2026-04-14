# Revert Block — Bouton ↩ par hunk dans le diff viewer

## Objectif

Reproduire le comportement de VS Code : quand le diff viewer s'ouvre après un formatage,
un **bouton ↩ (Revert Block)** apparaît dans la gouttière de chaque bloc de changement.
Cliquer dessus annule **uniquement ce bloc** et restaure les lignes originales (pré-format).

Si **tous les blocs** ont été revert, le diff overlay et le bouton diff dans le header
doivent disparaître automatiquement (il n'y a plus rien à montrer).

Le bouton "Revert All" est conservé en bonus dans la toolbar.

---

## État actuel du code

> [!IMPORTANT]
> Une première implémentation partielle a déjà été ajoutée au codebase (probablement
> par un LLM précédent). Elle utilise des `ContentWidget` sur le pane **modifié** (droit)
> avec affichage au survol. **Cette approche est incorrecte :**
> - Les widgets apparaissent à droite (côté formatted), pas à côté des lignes supprimées
> - Le comportement "hover pour révéler" via `onMouseMove` crée des listeners qui ne sont
>   jamais nettoyés (memory leak)
> - `readOnly: true` dans `DIFF_EDITOR_OPTIONS` empêche `pushEditOperations` de fonctionner
> - La gestion des cas limites (insertions pures, suppressions pures) est manquante
> - Aucune disparition automatique quand tout est revert

**L'implémentation existante doit être remplacée, pas corrigée.**

---

## Fichiers à modifier

| Fichier | Rôle |
|---------|------|
| [monacoHtml.js](file:///c:/Users/dd200/Documents/Mes_projets/Mes%20repo%20obsidian%20new/obsidian-code-files-modif/monacoHtml.js) | Changer `readOnly` → `domReadOnly` |
| [monacoHtml.css](file:///c:/Users/dd200/Documents/Mes_projets/Mes%20repo%20obsidian%20new/obsidian-code-files-modif/monacoHtml.css) | Styles du bouton ↩ revert-block dans la gouttière |
| [monacoEditor.html](file:///c:/Users/dd200/Documents/Mes_projets/Mes%20repo%20obsidian%20new/obsidian-code-files-modif/monacoEditor.html) | Cœur : `buildRevertWidgets`, `revertBlock`, auto-close |
| [mountCodeEditor.ts](file:///c:/Users/dd200/Documents/Mes_projets/Mes%20repo%20obsidian%20new/obsidian-code-files-modif/src/editor/mountCodeEditor.ts) | Nouveau case `format-diff-reverted` |
| [codeEditorView.ts](file:///c:/Users/dd200/Documents/Mes_projets/Mes%20repo%20obsidian%20new/obsidian-code-files-modif/src/editor/codeEditorView.ts) | `hideDiffAction()` + callback revert |
| [architecture.md](file:///c:/Users/dd200/Documents/Mes_projets/Mes%20repo%20obsidian%20new/obsidian-code-files-modif/docs/architecture.md) | Nouveau message dans le protocole |

---

## Changements détaillés

---

### 1. `monacoHtml.js` — Options du DiffEditor

#### [MODIFY] [monacoHtml.js](file:///c:/Users/dd200/Documents/Mes_projets/Mes%20repo%20obsidian%20new/obsidian-code-files-modif/monacoHtml.js)

Remplacer les options du diff editor :

```diff
 var DIFF_EDITOR_OPTIONS = {
-    // Make the diff editor read-only (users can't edit in diff view)
-    readOnly: true,
+    // readOnly: false allows pushEditOperations (used by revertBlock)
+    // domReadOnly: true blocks keyboard input while keeping programmatic edits
+    readOnly: false,
+    domReadOnly: true,

     // Show side-by-side comparison (true) or inline diff (false)
     renderSideBySide: true,

     // Automatically adjust layout when container size changes
     automaticLayout: true,

     // Show whitespace changes (spaces, tabs, line breaks)
     // Set to true to ignore whitespace-only changes
-    ignoreTrimWhitespace: false
+    ignoreTrimWhitespace: false,
+
+    // Enables the built-in accessibility diff viewer
+    // (Monaco >= 0.44: "accessibleDiffViewer")
+    enableSplitViewResizing: true
 };
```

> [!IMPORTANT]
> **`readOnly: true` vs `domReadOnly: true`** — C'est la différence critique.
> `readOnly: true` empêche **toute** modification du modèle, y compris via
> `model.pushEditOperations()`. `domReadOnly: true` bloque uniquement les entrées
> clavier/souris de l'utilisateur, mais les éditions programmatiques restent possibles.
> C'est exactement ce qu'on veut : l'utilisateur ne peut pas taper dans le diff,
> mais `revertBlock()` peut modifier le modèle.

---

### 2. `monacoHtml.css` — Style du bouton Revert Block

#### [MODIFY] [monacoHtml.css](file:///c:/Users/dd200/Documents/Mes_projets/Mes%20repo%20obsidian%20new/obsidian-code-files-modif/monacoHtml.css)

**Remplacer** le style `.diff-revert-widget` existant par un style pour le
bouton qui apparaît dans la **gouttière** (margin area) du pane
**original** (gauche), exactement comme VS Code.

Le bouton est positionné en `position: absolute` dans la marge de la ligne
(dans la zone gutter/margin), aligné verticalement avec le bloc de diff.
Il est toujours visible (pas de hover nécessaire — comme VS Code).

```css
/* ↩ Revert Block button — gutter of the original (left) pane */
/* Positioned as a GlyphMarginWidget on the original editor */
.diff-revert-block-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    cursor: pointer;
    border-radius: 3px;
    background: transparent;
    color: #ccc;
    font-size: 14px;
    line-height: 1;
    transition: color 0.1s, background 0.1s;
    border: none;
    padding: 0;
    margin: 0;
}
.diff-revert-block-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
}
```

> [!NOTE]
> On garde aussi le style du `.diff-revert-all-btn` et `.diff-revert-widget`
> existants au cas où, mais le `.diff-revert-widget` n'est plus utilisé et
> peut être supprimé. Le `.diff-revert-all-btn` reste utile pour le bouton
> "Revert All" dans la toolbar.

---

### 3. `monacoEditor.html` — Cœur de l'implémentation

#### [MODIFY] [monacoEditor.html](file:///c:/Users/dd200/Documents/Mes_projets/Mes%20repo%20obsidian%20new/obsidian-code-files-modif/monacoEditor.html)

**Supprimer** tout le code de l'implémentation existante (lignes ~91-184) et le
**remplacer** par l'implémentation correcte décrite ci-dessous.

#### 3a. Variables d'état (garder les existantes, ajuster)

```js
// Diff editor singleton - created once, reused
var diffEditorInstance = null;
var diffOverlayEl = null;
// Active revert zone widgets (one per diff hunk)
var revertZoneWidgets = [];
// Disposables for the diff update listener
var diffUpdateDisposable = null;
```

#### 3b. `closeDiffModal()` — cleanup des widgets et listeners

```js
function closeDiffModal() {
    if (diffOverlayEl) {
        diffOverlayEl.style.display = 'none';
    }
    clearRevertWidgets();
    if (diffUpdateDisposable) {
        diffUpdateDisposable.dispose();
        diffUpdateDisposable = null;
    }
}
```

#### 3c. `clearRevertWidgets()` — supprime tous les widgets de revert

```js
function clearRevertWidgets() {
    if (!diffEditorInstance) return;
    var origEditor = diffEditorInstance
        .getOriginalEditor();
    revertZoneWidgets.forEach(function (w) {
        origEditor.removeOverlayWidget(w);
    });
    revertZoneWidgets = [];
}
```

#### 3d. `buildRevertWidgets()` — RÉÉCRITURE COMPLÈTE

Logique : on utilise `addOverlayWidget()` sur le pane **original** (gauche)
de façon à placer un bouton ↩ dans la zone de marge de chaque hunk.

Le positionnement utilise la coordonnée top de la ligne dans le viewport
de l'éditeur original. On écoute `onDidScrollChange` pour reposition
les widgets quand l'utilisateur scrolle.

> [!IMPORTANT]
> **Pourquoi OverlayWidget et pas GlyphMarginWidget ?**
> L'API `GlyphMarginWidget` existe dans Monaco ≥ 0.44 (`addGlyphMarginWidget`).
> Vérifier la version de Monaco utilisée par le plugin. Si elle est ≥ 0.44,
> préférer `addGlyphMarginWidget` qui est l'API exacte pour ce use-case.
> Sinon, utiliser `addOverlayWidget` avec positionnement CSS calculé.
>
> **Vérification :** Chercher la version dans [vs/loader.js](file:///c:/Users/dd200/Documents/Mes_projets/Mes%20repo%20obsidian%20new/obsidian-code-files-modif/vs/loader.js)
> ou dans `package.json` / le dossier `vs/`. Si `addGlyphMarginWidget`
> existe sur `ICodeEditor`, l'utiliser.

```js
function buildRevertWidgets() {
    clearRevertWidgets();

    var changes = diffEditorInstance.getLineChanges();
    if (!changes || changes.length === 0) return;

    var origEditor = diffEditorInstance
        .getOriginalEditor();

    changes.forEach(function (change, idx) {
        // Pick the first line of the original block
        // (for pure insertions, originalStart is 0 → skip,
        // there's nothing to revert in the original)
        var origLine = change.originalStartLineNumber;
        if (origLine === 0) {
            // Pure insertion: the formatter added lines.
            // Place the button at the modified side's start
            // line mapped back via the diff. For now, use
            // originalEndLineNumber + 1 as anchor.
            origLine = change.originalEndLineNumber + 1;
        }

        // Create the ↩ button DOM
        var btn = document.createElement('button');
        btn.className = 'diff-revert-block-btn';
        btn.textContent = '↩';
        btn.title = 'Revert Block';
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            e.preventDefault();
            revertBlock(change);
        });

        // Wrap in a container for positioning
        var container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.zIndex = '100';
        container.appendChild(btn);

        var widgetId = 'revert-glyph-' + idx;

        // Approach: if addGlyphMarginWidget exists (Monaco ≥ 0.44),
        // use it. Otherwise fall back to overlay widget.
        if (typeof origEditor.addGlyphMarginWidget
            === 'function') {
            // GlyphMarginWidget API (preferred)
            var glyphWidget = {
                getId: function () {
                    return widgetId;
                },
                getDomNode: function () {
                    return btn;
                },
                getPosition: function () {
                    return {
                        lane:
                            monaco.editor
                                .GlyphMarginLane.Left,
                        zIndex: 100,
                        range: {
                            startLineNumber: origLine,
                            startColumn: 1,
                            endLineNumber: origLine,
                            endColumn: 1
                        }
                    };
                }
            };
            origEditor
                .addGlyphMarginWidget(glyphWidget);
            revertZoneWidgets.push({
                type: 'glyph',
                widget: glyphWidget
            });
        } else {
            // Fallback: overlay widget positioned manually
            var overlayWidget = {
                getId: function () {
                    return widgetId;
                },
                getDomNode: function () {
                    return container;
                },
                getPosition: function () {
                    return null; // manual positioning
                }
            };
            origEditor
                .addOverlayWidget(overlayWidget);
            revertZoneWidgets.push({
                type: 'overlay',
                widget: overlayWidget,
                line: origLine,
                container: container
            });
            // Position the widget
            positionOverlayWidget(
                origEditor, container, origLine
            );
        }
    });

    // For overlay widgets: reposition on scroll
    if (revertZoneWidgets.some(
        function (w) { return w.type === 'overlay'; }
    )) {
        if (diffUpdateDisposable) {
            diffUpdateDisposable.dispose();
        }
        diffUpdateDisposable = origEditor
            .onDidScrollChange(function () {
                revertZoneWidgets.forEach(function (w) {
                    if (w.type === 'overlay') {
                        positionOverlayWidget(
                            origEditor,
                            w.container,
                            w.line
                        );
                    }
                });
            });
    }
}

function positionOverlayWidget(
    editor, container, lineNumber
) {
    var top = editor.getTopForLineNumber(lineNumber)
        - editor.getScrollTop();
    var lineHeight = editor
        .getOption(
            monaco.editor.EditorOption.lineHeight
        );
    container.style.top = top + 'px';
    container.style.left = '0px';
    container.style.height = lineHeight + 'px';
    container.style.display = 'flex';
    container.style.alignItems = 'center';
}
```

#### 3e. `clearRevertWidgets()` — mise à jour pour les deux types

```js
function clearRevertWidgets() {
    if (!diffEditorInstance) return;
    var origEditor = diffEditorInstance
        .getOriginalEditor();
    revertZoneWidgets.forEach(function (w) {
        if (w.type === 'glyph') {
            origEditor
                .removeGlyphMarginWidget(w.widget);
        } else {
            origEditor
                .removeOverlayWidget(w.widget);
        }
    });
    revertZoneWidgets = [];
}
```

#### 3f. `revertBlock(change)` — RÉÉCRITURE COMPLÈTE

Logique :
1. Extraire les lignes originales du modèle `original` pour ce hunk
2. Remplacer les lignes correspondantes dans le modèle `modified`
3. Mettre à jour le contenu de l'éditeur principal
4. Recalculer le diff. **Si plus aucun changement** → fermer le diff et notifier le parent

```js
/**
 * Reverts a single diff hunk:
 * replaces the modified range with the original text.
 *
 * @param {ILineChange} change — from getLineChanges()
 *  .originalStartLineNumber (0 = pure insertion)
 *  .originalEndLineNumber
 *  .modifiedStartLineNumber (0 = pure deletion)
 *  .modifiedEndLineNumber
 */
function revertBlock(change) {
    var models = diffEditorInstance.getModel();
    if (!models) return;
    var origModel = models.original;
    var modModel = models.modified;

    // ── Extract original text ─────────────────────
    var origText = '';
    var hasOriginal =
        change.originalStartLineNumber > 0
        && change.originalEndLineNumber
            >= change.originalStartLineNumber;
    if (hasOriginal) {
        var lines = [];
        for (
            var i = change.originalStartLineNumber;
            i <= change.originalEndLineNumber;
            i++
        ) {
            lines.push(origModel.getLineContent(i));
        }
        origText = lines.join('\n');
    }

    // ── Build the edit ────────────────────────────
    var hasModified =
        change.modifiedStartLineNumber > 0
        && change.modifiedEndLineNumber
            >= change.modifiedStartLineNumber;
    var edit;

    if (hasModified && hasOriginal) {
        // Standard case: replace modified range with original
        edit = {
            range: {
                startLineNumber:
                    change.modifiedStartLineNumber,
                startColumn: 1,
                endLineNumber:
                    change.modifiedEndLineNumber,
                endColumn: modModel.getLineMaxColumn(
                    change.modifiedEndLineNumber
                )
            },
            text: origText
        };
    } else if (hasModified && !hasOriginal) {
        // Pure insertion by formatter → delete those lines
        var endLn = change.modifiedEndLineNumber;
        var range;
        if (endLn >= modModel.getLineCount()) {
            // Last line: go to end of previous line
            if (change.modifiedStartLineNumber > 1) {
                range = {
                    startLineNumber:
                        change.modifiedStartLineNumber - 1,
                    startColumn: modModel.getLineMaxColumn(
                        change.modifiedStartLineNumber - 1
                    ),
                    endLineNumber: endLn,
                    endColumn:
                        modModel.getLineMaxColumn(endLn)
                };
            } else {
                range = {
                    startLineNumber: 1,
                    startColumn: 1,
                    endLineNumber: endLn,
                    endColumn:
                        modModel.getLineMaxColumn(endLn)
                };
            }
        } else {
            // Delete lines including the trailing newline
            range = {
                startLineNumber:
                    change.modifiedStartLineNumber,
                startColumn: 1,
                endLineNumber: endLn + 1,
                endColumn: 1
            };
        }
        edit = { range: range, text: '' };
    } else if (!hasModified && hasOriginal) {
        // Pure deletion by formatter → insert original lines
        // Insert after the line preceding the deletion
        var insertLine =
            change.modifiedStartLineNumber > 0
                ? change.modifiedStartLineNumber
                : 1;
        edit = {
            range: {
                startLineNumber: insertLine,
                startColumn:
                    modModel.getLineMaxColumn(insertLine),
                endLineNumber: insertLine,
                endColumn:
                    modModel.getLineMaxColumn(insertLine)
            },
            text: '\n' + origText
        };
    } else {
        // No original, no modified (shouldn't happen)
        return;
    }

    // ── Apply the edit ────────────────────────────
    modModel.pushEditOperations(
        [], [edit], function () { return null; }
    );

    // ── Sync to main editor ───────────────────────
    var newContent = modModel.getValue();
    editor.setValue(newContent);
    lastFormatFormatted = newContent;

    // ── Check if any diff remains ─────────────────
    // Wait for Monaco to recompute the diff
    setTimeout(function () {
        var remaining =
            diffEditorInstance.getLineChanges();
        if (!remaining || remaining.length === 0) {
            // All blocks reverted → close diff & notify
            lastFormatOriginal = null;
            lastFormatFormatted = null;
            closeDiffModal();
            window.parent.postMessage({
                type: 'format-diff-reverted',
                context: context
            }, '*');
        } else {
            // Rebuild the revert widgets for remaining hunks
            buildRevertWidgets();
        }
    }, 300); // 300ms for Monaco diff recomputation
}
```

#### 3g. `revertAll()` — reset + fermeture + notification

```js
function revertAll() {
    if (!lastFormatOriginal) return;
    editor.setValue(lastFormatOriginal);
    lastFormatOriginal = null;
    lastFormatFormatted = null;
    closeDiffModal();
    window.parent.postMessage({
        type: 'format-diff-reverted',
        context: context
    }, '*');
}
```

#### 3h. `openDiffModal()` — ajouter listener sur diff update

Le code existant de `openDiffModal` est bon dans l'ensemble. Il faut juste
s'assurer que `buildRevertWidgets()` est appelé après la recomputation du
diff et que les widgets sont nettoyés avant leur re-création.

La partie `requestAnimationFrame` existante avec le double rAF est correcte.

---

### 4. `mountCodeEditor.ts` — handler pour `format-diff-reverted`

#### [MODIFY] [mountCodeEditor.ts](file:///c:/Users/dd200/Documents/Mes_projets/Mes%20repo%20obsidian%20new/obsidian-code-files-modif/src/editor/mountCodeEditor.ts)

Dans le switch `onMessage`, ajouter un nouveau case après `format-diff-available` (ligne ~422) :

```typescript
case 'format-diff-reverted': {
    if (data.context === codeContext) {
        onFormatDiffReverted?.();
    }
    break;
}
```

Ajouter le paramètre `onFormatDiffReverted` à la signature de `mountCodeEditor` :

```diff
 export const mountCodeEditor = async (
     plugin: CodeFilesPlugin,
     language: string,
     initialValue: string,
     codeContext: string,
     containerEl: HTMLElement,
     onChange?: () => void,
     onSave?: () => void,
-    onFormatDiff?: () => void
+    onFormatDiff?: () => void,
+    onFormatDiffReverted?: () => void
 ): Promise<CodeEditorInstance> => {
```

---

### 5. `codeEditorView.ts` — disparition automatique du bouton diff

#### [MODIFY] [codeEditorView.ts](file:///c:/Users/dd200/Documents/Mes_projets/Mes%20repo%20obsidian%20new/obsidian-code-files-modif/src/editor/codeEditorView.ts)

Ajouter une méthode `hideDiffAction()` :

```typescript
/** Hides the diff action button immediately (called when all blocks are reverted) */
private hideDiffAction(): void {
    if (this.diffTimer) {
        clearTimeout(this.diffTimer);
        this.diffTimer = null;
    }
    this.diffAction?.remove();
    this.diffAction = null;
}
```

Modifier `mountEditor()` pour passer le nouveau callback :

```diff
 this.codeEditor = await mountCodeEditor(
     this.plugin,
     getLanguage(file.extension),
     this.data,
     this.getContext(file),
     this.contentEl,
     () => { this.setDirty(true); this.requestSave(); },
     () => { /* onSave */ },
-    () => { this.showDiffAction(); }
+    () => { this.showDiffAction(); },
+    () => { this.hideDiffAction(); }
 );
```

---

### 6. `architecture.md` — nouveau message dans le protocole

#### [MODIFY] [architecture.md](file:///c:/Users/dd200/Documents/Mes_projets/Mes%20repo%20obsidian%20new/obsidian-code-files-modif/docs/architecture.md)

Ajouter dans la table **iframe → parent** :

| Type | Payload | Meaning |
|------|---------|---------|
| `format-diff-reverted` | `{ context }` | All blocks reverted (or Revert All clicked) — diff cleared |

---

## Résumé visuel du comportement

```
┌──────────────────────────────────────────────────┐
│ diff-toolbar      [↩ Revert All]     [✕ Close]   │
├────────────────────┬─────────────────────────────┤
│  Original (left)   │  Modified (right)            │
│                    │                              │
│  ↩ │ line 20: old  │  line 20: new (formatted)   │
│    │ line 21: old  │  line 21: new (formatted)   │
│    │               │                              │
│  ↩ │ line 45: old  │  line 45: new (formatted)   │
│    │               │                              │
└────────────────────┴─────────────────────────────┘
      ↑
   Bouton ↩ dans la gouttière (glyph margin)
   du pane original, au niveau de chaque hunk
```

Cliquer sur ↩ :
1. Les lignes `old` remplacent les lignes `new` dans le modèle modifié
2. Le contenu de l'éditeur principal est mis à jour
3. Le diff est recalculé — si plus de différences, tout se ferme

---

## Notes critiques pour le LLM implémentant

> [!IMPORTANT]
> **Ne JAMAIS appeler `diffEditorInstance.dispose()`.** Le singleton
> pattern documenté dans `docs/diff-editor-singleton-fix.md` doit être
> respecté. Disposer le diff editor corrompt `StandaloneServices`.

> [!IMPORTANT]
> **`readOnly: false` + `domReadOnly: true`** dans `DIFF_EDITOR_OPTIONS`.
> `readOnly: true` empêche `model.pushEditOperations()` de fonctionner.
> `domReadOnly: true` bloque le clavier mais pas les éditions programmatiques.

> [!WARNING]
> **`getLineChanges()`** peut retourner `null` si le diff n'a pas encore
> été calculé. Toujours garder avec `if (!changes) return;`.

> [!WARNING]
> **Les numéros de ligne dans `ILineChange`** utilisent `0` comme
> valeur sentinelle (pas `-1`). `modifiedStartLineNumber === 0`
> signifie suppression pure (lignes supprimées par le formatter).
> `originalStartLineNumber === 0` signifie insertion pure.

> [!TIP]
> **Vérifier la version de Monaco.** Si `addGlyphMarginWidget` existe
> sur `ICodeEditor`, c'est l'API idéale pour le bouton ↩ dans la
> gouttière. Sinon, fallback sur `addOverlayWidget` avec positionnement
> CSS manuel + listener `onDidScrollChange`.

> [!TIP]
> **Timeout de 300ms dans `revertBlock`** pour la recomputation du diff.
> Monaco calcule les diffs de manière asynchrone. Si 300ms est
> insuffisant pour les gros fichiers, envisager d'utiliser 
> `diffEditorInstance.onDidUpdateDiff(callback)` si cette API existe.

> [!NOTE]
> **Nettoyage des listeners.** Chaque `onDidScrollChange` et
> `onMouseMove` crée un disposable. Le stocker dans une variable et
> le `.dispose()` dans `closeDiffModal()` et avant chaque rebuild.
> L'implémentation existante avec `onMouseMove` dans le forEach
> **NE DISPOSE JAMAIS** les listeners → memory leak.

> [!NOTE]
> **Règle des 100 caractères.** Toutes les lignes JavaScript dans
> `monacoEditor.html` doivent rester ≤ 100 caractères.

---

## Vérification

### Tests manuels obligatoires

1. Ouvrir un `.ts` → Ctrl+S (avec formatOnSave) → bouton diff apparaît
2. Cliquer le diff → overlay s'ouvre → boutons ↩ visibles dans la gouttière gauche
3. Cliquer ↩ sur un bloc → ce bloc revient à l'original, les autres restent
4. L'éditeur principal reflète le changement
5. Répéter jusqu'à ce que tous les blocs soient revert → **le diff se ferme automatiquement et le bouton diff disparaît**
6. Re-formater → le cycle fonctionne à nouveau
7. Tester "Revert All" → fermeture immédiate, contenu = original
8. Vérifier qu'aucune erreur `InstantiationService` n'apparaît (right-click après diff)

### Edge cases

| Cas | Comportement attendu |
|-----|---------------------|
| Un seul hunk → revert → plus de diff | Diff + bouton disparaissent |
| Pure insertion (formatter ajoute des lignes) | Le ↩ supprime les lignes ajoutées |
| Pure suppression (formatter retire des lignes) | Le ↩ réinsère les lignes supprimées |
| Gros fichier (>1000 lignes) | Les widgets se repositionnent au scroll |
| Format → revert partiel → Ctrl+S → re-format | Nouveau diff basé sur l'état actuel |
