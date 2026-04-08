# Intégration Monaco Editor en local dans un plugin Obsidian

## Contexte

Le plugin utilisait initialement `https://embeddable-monaco.lukasbach.com` pour charger Monaco dans une iframe. L'objectif était de remplacer cette dépendance externe par une version locale embarquée dans le plugin.

---

## Ce qu'on a mis en place

### 1. Installer Monaco

```bash
yarn add -D monaco-editor
```

### 2. Créer `src/monacoEditor.html`

Page HTML minimale qui charge Monaco depuis `./vs/loader.js`, émet `ready` quand Monaco est prêt, et communique via `postMessage`.

### 3. Copier les fichiers Monaco au build (`esbuild.config.ts`)

- `node_modules/monaco-editor/min/vs/` → `{buildPath}/vs/`
- `src/monacoEditor.html` → `{buildPath}/monacoEditor.html`

Ces fichiers sont dans `.gitignore` (`vs/` et `monacoEditor.html` à la racine).

### 4. Modifier `mountCodeEditor.ts`

Les paramètres qui étaient dans la query string de l'URL externe passent maintenant via `postMessage` (`init`).

### 5. Remplacer la liste statique de langages par une map dynamique

Monaco est local, donc on peut interroger `monaco.languages.getLanguages()` depuis l'iframe et construire la map extension → langage dynamiquement. Cela évite de maintenir une liste à la main et couvre automatiquement tous les langages Monaco.

La map est **persistée dans `data.json`** du plugin pour être disponible dès le prochain démarrage, avant même qu'un éditeur soit ouvert.

---

## Les problèmes rencontrés

### Problème 1 — `loader.js` bloqué, chemins cassés

**Tentative :** utiliser `getResourcePath()` directement comme `src` de l'iframe.

**Erreur :** `getResourcePath` ajoute un timestamp (`?1775...`) à la fin. Les chemins relatifs `./vs/loader.js` se résolvent en `vs?timestamp/loader.js` — invalide.

**Tentative :** utiliser `file://` via `adapter.getBasePath()`.

**Erreur :** Electron bloque les URLs `file://` dans les iframes.

**Solution :** fetch du HTML via `getResourcePath`, remplacement des chemins `./vs` par l'URL `app://` absolue (timestamp supprimé avec `.replace(/\?.*$/, '')`), injection via une **blob URL**.

```typescript
const htmlUrl = plugin.app.vault.adapter.getResourcePath(`${pluginBase}/monacoEditor.html`);
const vsBase = plugin.app.vault.adapter.getResourcePath(`${pluginBase}/vs`).replace(/\?.*$/, '');

let html = await (await fetch(htmlUrl)).text();
html = html
    .replace("'./vs'", `'${vsBase}'`)
    .replace('"./vs/loader.js"', `"${vsBase}/loader.js"`);

const blob = new Blob([html], { type: 'text/html' });
iframe.src = URL.createObjectURL(blob);
```

La blob URL est révoquée dans `destroy()`.

---

### Problème 2 — CSS Monaco bloqué par la CSP d'Obsidian

**Erreur :** Monaco injecte dynamiquement un `<link rel="stylesheet">`. La CSP d'Obsidian le bloque.

**Tentative :** ajouter `<meta http-equiv="Content-Security-Policy">` dans le HTML de l'iframe.

**Erreur :** la CSP du parent (Obsidian) s'applique aux frames enfants et écrase celle du `<meta>`. Impossible à surcharger depuis l'iframe.

**Solution :** inliner le CSS Monaco dans le HTML avant de créer la blob URL, et intercepter `appendChild` pour bloquer les `<link>` que Monaco tente d'injecter ensuite.

```typescript
const cssText = await (await fetch(`${vsBase}/editor/editor.main.css`)).text();
html = html.replace('</head>', `<style>${cssText}</style>
<script>
const _orig = Element.prototype.appendChild;
Element.prototype.appendChild = function(node) {
    if (node.tagName === 'LINK' && node.rel === 'stylesheet') return node;
    return _orig.call(this, node);
};
</script>
</head>`);
```

---

### Problème 3 — Polices bloquées par la CSP

**Erreur :** le CSS Monaco contient des `@font-face` avec des polices en `data:font/ttf;base64,...`. La CSP d'Obsidian bloque `data:` pour les polices.

**Tentative :** remplacer les `data:` par des blob URLs.

**Erreur :** `blob:app://...` est aussi bloqué par la même CSP.

**Tentative :** remplacer par des URLs `app://` absolues.

**Erreur :** les polices Monaco sont déjà inline en `data:` dans le CSS, il n'y a pas de fichiers `.ttf` séparés à référencer.

**Solution :** supprimer les `@font-face` du CSS. Monaco se rabat sur les polices système (monospace), ce qui est fonctionnel pour un éditeur de code.

```typescript
cssText = cssText.replace(/@font-face\s*\{[^}]*\}/g, '');
```

---

### Problème 4 — SVG des décorations d'erreur bloqués par la CSP

**Erreur :** Monaco charge ses squiggles (vagues rouges sous les erreurs) via des SVG inline en `data:image/svg+xml`. La CSP bloque `data:` pour les images.

**Solution :** ajouter `data:` à `img-src` dans la CSP du `<meta>` du HTML. Contrairement aux polices et stylesheets, `img-src` n'est pas écrasé par la CSP parent pour le contenu inline d'une blob URL.

```html
<meta http-equiv="Content-Security-Policy" content="... img-src 'self' app: data:; ..." />
```

---

### Problème 5 — Éditeur vide, mauvais ordre des messages

**Erreur :** l'éditeur apparaissait vide.

**Cause :** `ready` était émis à l'intérieur de `applyParams` (après création de l'éditeur). Le flux était cassé :

1. Monaco charge → attend un message (pas de `ready` encore)
2. Parent envoie `init` → `applyParams` crée l'éditeur → émet `ready`
3. Parent reçoit `ready` → envoie `init` + `change-value` à nouveau
4. `applyParams` est rappelé → erreur "Element already has context attribute"

**Solution :** émettre `ready` immédiatement après le chargement de Monaco, avant tout message. Le flux correct :

1. Monaco charge → émet `ready`
2. Parent reçoit `ready` → envoie `init` (params) + `get-languages` + `change-value` (contenu)
3. HTML reçoit `init` → crée l'éditeur
4. HTML reçoit `get-languages` → répond avec la map extension → langage
5. HTML reçoit `change-value` → remplit l'éditeur

---

### Problème 6 — "Element already has context attribute" sur le modal

**Cause :** `applyParams` pouvait être appelé deux fois si des messages arrivaient dans le mauvais ordre.

**Solution :** flag `initialized` dans le HTML.

```javascript
var initialized = false;

function applyParams(params) {
    if (initialized) return;
    initialized = true;
    // ...
}
```

---

### Problème 7 — Pas de coloration syntaxique au redémarrage

**Cause :** la map dynamique est vide au démarrage. Elle n'est remplie que quand un éditeur Monaco est ouvert. Si Obsidian rouvre des fichiers au démarrage, `getLanguage()` retourne `'plaintext'`.

**Solution en deux parties :**

1. **Liste statique comme fallback** — couvre les langages courants immédiatement, avant que Monaco soit chargé.

2. **Persistance de la map dynamique** — au premier démarrage avec un éditeur ouvert, la map Monaco est sauvegardée dans `data.json`. Aux démarrages suivants, elle est rechargée avant même qu'un éditeur soit ouvert.

```typescript
// Dans main.ts — onload()
await loadPersistedLanguages(this);

// Dans mountCodeEditor.ts — case 'languages'
await registerAndPersistLanguages(data.langs, plugin);
// registerAndPersistLanguages est un no-op si dynamicMap est déjà remplie (une seule persistance par session)
```

Priorité de résolution : `dynamicMap` (Monaco) > `staticMap` (fallback) > `'plaintext'`.

---

## Architecture finale

### `mountCodeEditor.ts`

- Fonction `async` (fetch du HTML et du CSS)
- Construit `initParams` avec tous les paramètres de configuration
- Fetch le HTML, remplace `./vs` par l'URL `app://` absolue
- Fetch le CSS Monaco, supprime les `@font-face`, injecte inline dans le HTML
- Intercepte `appendChild` pour bloquer les `<link>` dynamiques de Monaco
- Crée une blob URL pour l'iframe, révoquée dans `destroy()`
- Sur `ready` → envoie `init` + `get-languages` + `change-value`
- Sur `languages` → enregistre et persiste la map (une seule fois par session)
- Sur `change` → filtre par `codeContext` pour n'écouter que sa propre iframe

### `monacoEditor.html`

- Charge Monaco via `./vs/loader.js` (remplacé par URL `app://` avant injection)
- Émet `ready` dès que Monaco est chargé
- Sur `init` → crée l'éditeur (une seule fois grâce au flag `initialized`)
- Sur `get-languages` → retourne la map complète `[extension, languageId][]`
- Sur `change-value` → met à jour le contenu
- Émet `change` avec `context` à chaque modification utilisateur

### `getLanguage.ts`

- `staticMap` — fallback immédiat pour les langages courants
- `dynamicMap` — map complète issue de Monaco, persistée entre sessions
- `loadPersistedLanguages` — appelé au démarrage du plugin
- `registerAndPersistLanguages` — appelé à la réception de la map Monaco, no-op si déjà remplie

---

## Gestion du cycle de vie

`mountCodeEditor` retourne un objet de contrôle (`iframe`, `getValue`, `setValue`, `clear`, `destroy`, `send`). Le `window.addEventListener('message', onMessage)` reste actif tant que l'éditeur est ouvert — `destroy()` doit impérativement le retirer via `removeEventListener`, sinon des memory leaks s'accumulent si des dizaines d'éditeurs sont créés et détruits pendant une session.

Le `codeContext` identifie chaque instance : si plusieurs iframes Monaco sont ouvertes simultanément (un fichier + un fence modal par exemple), elles envoient toutes des `change` sur le même `window`. Le `codeContext` permet de n'écouter que les messages de sa propre iframe.

---

## Problème 9 — Fausse sauvegarde à l'ouverture d'un fichier

**Symptôme :** le simple fait d'ouvrir un fichier le marquait comme modifié sur le disque, affolant les services de sync (Obsidian Sync, iCloud, Dropbox) qui voyaient une modification fantôme.

**Cause :** dans `codeEditorView.ts`, `onLoadFile` injectait le contenu du fichier dans Monaco via `setValue`. Monaco déclenchait alors son événement `onDidChangeModelContent`, que le plugin écoutait aveuglément pour appeler `requestSave()`. Résultat : ouverture = écriture disque inutile.

**Solution :** dans le handler `change` de `mountCodeEditor.ts`, ignorer le message si le contenu reçu est identique à la valeur courante. Le fichier n'est plus jamais sauvegardé sur le disque juste en l'ouvrant.

```typescript
case 'change':
    if (data.context === codeContext && value !== data.value) {
        value = data.value;
        onChange?.();
    }
```

---

## Problème 10 — Double extension au renommage d'onglet (`.js` → `.js.js`)

**Symptôme :** cliquer sur le titre d'un onglet Monaco déclenchait silencieusement un renommage du fichier, ajoutant l'extension en double (`test.js` → `test.js.js`).

**Cause :** `getDisplayText()` dans `CodeEditorView` retournait `file.name` (nom complet avec extension) au lieu de `file.basename` (sans extension). Quand l'utilisateur cliquait sur le titre de l'onglet, Obsidian entrait en mode renommage en initialisant sa boîte de texte avec `test.js`. À la validation, Obsidian ajoutait automatiquement l'extension — donnant `test.js.js`.

**Solution :** utiliser `file.basename` dans `getDisplayText()`, conformément à la convention Obsidian.

---

## Problème 11 — Rename extension depuis Monaco : rechargement non déclenché après le premier rename

**Symptôme :** le premier rename via le menu contextuel Monaco fonctionnait, mais les suivants ne rechargaient plus la vue. Monaco restait coincé avec l'ancien `codeContext` (ex. `script.py`) alors que le fichier s'appelait désormais `script.js`. Les messages `postMessage` suivants étaient ignorés silencieusement.

**Cause :** l'ancienne approche forçait `openLeaf.openFile()` depuis `RenameExtensionModal`. Obsidian optimisait en refusant de recharger un onglet qu'il considérait déjà ouvert sur le même objet `TFile`. La vue Monaco gardait donc son ancien `codeContext`, rendant le modal inaccessible au deuxième appel.

**Solution en deux parties :**

1. **Interception native du rename dans `CodeEditorView`** — implémentation de `onRename(file: TFile)` qui détruit l'ancienne iframe et en monte une nouvelle avec le bon langage et le bon `codeContext` :

```typescript
async onRename(file: TFile): Promise<void> {
    super.onRename(file);
    this.codeEditor?.destroy();
    this.contentEl.empty();
    this.codeEditor = await mountCodeEditor(
        this.plugin,
        getLanguage(file.extension),
        this.data,
        this.getContext(file),
        () => this.requestSave()
    );
    this.contentEl.append(this.codeEditor.iframe);
}
```

2. **Simplification de `RenameExtensionModal`** — suppression de la logique `openLeaf.openFile()` devenue inutile. La vue se gère seule via `onRename`.

3. **Restauration de `iframe.focus()`** dans le monkey-patch `onClose` de `mountCodeEditor` — nécessaire pour le cas annulation (croix) : si l'utilisateur ferme le modal sans valider, le focus est gracieusement rendu à l'iframe Monaco.

**Erreur :** lors de la fermeture de `ChooseThemeModal`, `RenameExtensionModal` et `FormatterConfigModal` (ouverts via le menu contextuel Monaco), Obsidian crashait avec :

```
Uncaught TypeError: n.instanceOf is not a function
    at e.close (app.js:1:1079118)
```

**Cause :** Obsidian sauvegarde `document.activeElement` à l'ouverture d'un modal pour restaurer le focus à la fermeture. Quand le modal est ouvert depuis l'iframe Monaco, l'élément actif capturé est un élément interne de l'iframe (le `<textarea>` caché de Monaco). À la fermeture, Obsidian tente de valider le type de cet élément avec `element.instanceOf(HTMLElement)` — une méthode qu'Obsidian injecte globalement sur `Node.prototype`. Mais les éléments de l'iframe n'héritent pas de ce patch (document isolé), donc `instanceOf` n'existe pas et le code minifié crashe.

**Solution :** avant d'ouvrir le modal, forcer le blur de l'élément actif avec `(document.activeElement as HTMLElement)?.blur()`. Le focus retombe sur le `body` d'Obsidian qui possède `instanceOf`. Puis monkey-patcher `modal.onClose` pour restaurer manuellement le focus sur l'iframe après fermeture :

```typescript
(document.activeElement as HTMLElement)?.blur();
const modal = new ChooseThemeModal(plugin, callback);
const origOnClose = modal.onClose.bind(modal);
modal.onClose = () => {
    origOnClose();
    iframe.focus();
};
modal.open();
```

Cela contourne le `instanceOf` fatal tout en préservant l'expérience utilisateur.

---

## Intégration des thèmes Monaco custom

**Contexte :** la liste `themes.ts` contenait ~50 noms de thèmes (Dracula, Monokai, Nord, etc.) mais aucun n'était défini — Monaco les ignorait silencieusement et tombait sur `vs-dark`.

**Solution :** installation du package `monaco-themes` qui fournit les définitions JSON de tous ces thèmes. Au build, esbuild copie `node_modules/monaco-themes/themes/` → `{buildPath}/monaco-themes/`. Au chargement d'un thème custom :

1. Fetch du JSON via `app://` : `getResourcePath(${pluginBase}/monaco-themes/${theme}.json)`
2. Envoi du JSON stringifié dans `initParams.themeData`
3. Dans `monacoEditor.html`, appel de `monaco.editor.defineTheme(theme, JSON.parse(themeData))` avant `monaco.editor.create()`

Le changement de thème à la volée (via le menu contextuel Monaco) suit le même flux : fetch du JSON, envoi via `change-theme`, appel de `defineTheme` puis `monaco.editor.setTheme()`.

---

---

## Problème 12 — Icônes Codicons manquantes (barre de recherche, menus)

**Symptôme :** les icônes de l'UI interne de Monaco (boutons de la barre Ctrl+F, icônes du menu contextuel, etc.) s'affichent comme des carrés vides.

**Cause :** Monaco utilise la police **Codicons** (la police d'icônes de VS Code) déclarée via `@font-face` dans `editor.main.css`. Dans le package `monaco-editor/min`, cette police est encodée en base64 directement dans le CSS. La CSP d'Obsidian bloque `data:` pour les polices dans les frames enfants — la police ne se charge jamais.

De plus, le dossier `monaco-editor/min/vs` (copié au build) ne contient pas de fichier `.ttf` séparé — la police est uniquement inline dans le CSS.

**Solution en deux parties :**

1. **Copier le TTF au build** — le fichier `codicon.ttf` existe dans `monaco-editor/esm/`. On l'ajoute dans le script de build pour le copier dans `vs/editor/` :

```typescript
// Dans esbuild.config.ts, après le cp de Monaco
const codiconSrc = path.join(pluginDir, 'node_modules/monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon.ttf');
const codiconTarget = path.join(buildPath, 'vs/editor/codicon.ttf');
await copyFile(codiconSrc, codiconTarget);
```

2. **Patcher l'URL dans le CSS** — au lieu de supprimer les `@font-face`, on remplace l'URL base64 par l'URL `app://` absolue vers le TTF copié :

```typescript
// Dans mountCodeEditor.ts, à la place du replace @font-face
const codiconFontUrl = `${vsBase}/editor/codicon.ttf`;
cssText = cssText.replace(
    /(@font-face\s*\{[^}]*src:[^;]*)(url\([^)]+\)\s*format\(["']truetype["']\))/g,
    `$1url('${codiconFontUrl}') format('truetype')`
);
```

`app://` est autorisé par `default-src` dans la CSP de l'iframe, donc la police se charge sans erreur.

---

## Adding external configuration files for Monaco HTML

**Context:** To keep Monaco HTML configuration maintainable, CSS styles and JavaScript variables can be externalized into separate files instead of being hardcoded in `monacoEditor.html`.

**Files created:**
- `src/types/monacoHtml.css` — CSS styles for diff modal (overlay, toolbar, buttons, container)
- `src/types/monacoHtml.js` — JavaScript configuration variables (diff editor options, timeouts, Prettier settings)

**Build process (esbuild.config.ts):**

These files must be copied to the build directory alongside Monaco files:

```typescript
const configJsSrc = path.join(pluginDir, 'src/types/monacoHtml.js');
const configJsTarget = path.join(buildPath, 'monacoHtml.js');
const configCssSrc = path.join(pluginDir, 'src/types/monacoHtml.css');
const configCssTarget = path.join(buildPath, 'monacoHtml.css');

await copyFile(configJsSrc, configJsTarget);
await copyFile(configCssSrc, configCssTarget);
```

**Loading process (mountCodeEditor.ts):**

1. **JavaScript config** — loaded as external `<script src>` (allowed by CSP):

```typescript
const configJsUrl = plugin.app.vault.adapter
    .getResourcePath(`${pluginBase}/monacoHtml.js`)
    .replace(/\?.*$/, '');

// Patch the HTML to use absolute app:// URL
html = html.replace('"./monacoHtml.js"', `"${configJsUrl}"`);

// Inject as script tag in HTML head
html = html.replace('</head>', `<script src="${configJsUrl}"></script>\n</head>`);
```

2. **CSS config** — must be inlined (external stylesheets blocked by CSP):

```typescript
const configCssUrl = plugin.app.vault.adapter
    .getResourcePath(`${pluginBase}/monacoHtml.css`)
    .replace(/\?.*$/, '');

// Fetch and inline the CSS
const configCssText = await (await fetch(configCssUrl)).text();

// Remove the <link> tag from HTML
html = html.replace('<link rel="stylesheet" href="./monacoHtml.css" />', '');

// Inject as inline <style> in HTML head
html = html.replace('</head>', `<style>${configCssText}</style>\n</head>`);
```

**Why this approach:**
- JavaScript files can be loaded externally via `<script src>` (CSP allows `app://` URLs)
- CSS files must be inlined because Obsidian's CSP blocks external `<link rel="stylesheet">` in child frames
- Both files remain in `src/types/` for easy editing and version control
- The build process automatically copies and patches them

**To add more external config files:**
1. Create the file in `src/types/`
2. Add copy command in `esbuild.config.ts` (in the `copy-to-plugins-folder` plugin)
3. For JS: patch the path in `mountCodeEditor.ts` and inject as `<script src>`
4. For CSS: fetch, inline, and inject as `<style>` in `mountCodeEditor.ts`

---

## Ce qu'il faut retenir

La contrainte principale est la **CSP d'Obsidian** qui s'applique à toutes les frames enfants et qu'on ne peut pas surcharger. Elle autorise `app:` et `'self'` mais bloque `data:` et `blob:` pour les polices, et les stylesheets externes.

La solution qui contourne tout ça :

1. Charger le HTML via `fetch` (l'URL `app://` avec timestamp fonctionne pour fetch)
2. Remplacer les chemins relatifs `./vs` par l'URL `app://` absolue (sans timestamp)
3. Inliner le CSS Monaco dans le HTML (évite le `<link>` bloqué)
4. Supprimer les `@font-face` (polices bloquées de toute façon)
5. Injecter via blob URL (l'iframe blob n'est pas soumise à la CSP du parent pour son propre contenu inline)
6. Autoriser `data:` uniquement pour `img-src` (nécessaire pour les décorations d'erreur Monaco)
