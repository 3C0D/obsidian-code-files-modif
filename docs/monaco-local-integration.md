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

## Ce qu'il faut retenir

La contrainte principale est la **CSP d'Obsidian** qui s'applique à toutes les frames enfants et qu'on ne peut pas surcharger. Elle autorise `app:` et `'self'` mais bloque `data:` et `blob:` pour les polices, et les stylesheets externes.

La solution qui contourne tout ça :

1. Charger le HTML via `fetch` (l'URL `app://` avec timestamp fonctionne pour fetch)
2. Remplacer les chemins relatifs `./vs` par l'URL `app://` absolue (sans timestamp)
3. Inliner le CSS Monaco dans le HTML (évite le `<link>` bloqué)
4. Supprimer les `@font-face` (polices bloquées de toute façon)
5. Injecter via blob URL (l'iframe blob n'est pas soumise à la CSP du parent pour son propre contenu inline)
6. Autoriser `data:` uniquement pour `img-src` (nécessaire pour les décorations d'erreur Monaco)
