# Audit Configuration System — Recommandations pour refactoring

## Résumé
La cascade fonctionne bien en pratique. Les problèmes identifiés sont **surtout de clarté et de robustesse**, pas de bugs critiques.

---

## 🔴 PROBLÈMES RÉELS

### 1. **Ambiguïté critique : deux `applyEditorConfig()` avec des signatures différentes**

**Lieu** : TypeScript (`settingsUtils.ts:applyEditorConfig()`) vs HTML (`monacoEditor.html:applyEditorConfig()`)

**Symptôme** : Quand on cherche "applyEditorConfig" dans l'IDE, on trouve deux fonctions incompatibles qui font des choses différentes.

**Solution** : Renommer la version TypeScript
```typescript
// Avant
export function applyEditorConfig(plugin: CodeFilesPlugin, key: string, value: string): boolean

// Après
export function saveEditorConfig(plugin: CodeFilesPlugin, key: string, value: string): boolean
```

**Fichiers à modifier** :
- `settingsUtils.ts` : Renommer la fonction + JSDoc
- `editorSettingsModal.ts` : Mettre à jour les deux appels (lignes ~600 et ~700)
- `configuration-cascade.md` : Mettre à jour les références

**Priorité** : 🔴 Haute (prévention de bugs futurs)

---

### 2. **DEFAULT_EXTENSION_CONFIG est inefficace**

**Lieu** : `settingsUtils.ts:applyEditorConfig()` ligne ~60

**Problème** : 
```typescript
const defaultForKey = key === '*' ? DEFAULT_EDITOR_CONFIG : DEFAULT_EXTENSION_CONFIG;
// ...
if (key !== '*' && value === defaultForKey.trim()) {
    delete plugin.settings.editorConfigs[key];
    return true;
}
```

`DEFAULT_EXTENSION_CONFIG` c'est juste `{}` (vide avec commentaires). Donc cette comparaison va **jamais matcher** en pratique, sauf si l'utilisateur écrit littéralement `{}` qui c'est très rare.

**Intention** : "Si l'user revient à la config par défaut, on l'enlève de la persistence"

**Réalité** : Ça fonctionne pas pour les extensions (fonctionne que pour global `'*'`).

**Solution** : Supprimer ce check pour les extensions (il sert à rien), ou clarifier la doc.

```typescript
// Après
if (key !== '*') {
    // Pour les extensions, on persiste toujours (même si c'est {})
    // buildMergedConfig va fallback sur DEFAULT_EXTENSION_CONFIG si absent
    plugin.settings.editorConfigs[key] = value;
    return true;
}
// Pour global, on peut garder le check
if (value === defaultForKey.trim()) {
    delete plugin.settings.editorConfigs[key];
    return true;
}
```

**Priorité** : 🟡 Moyenne (c'est juste du code mort)

---

### 3. **Pas de fallback si JSON cassé dans l'iframe**

**Lieu** : `monacoEditor.html` ligne ~765

```javascript
try { applyEditorConfig(parseEditorConfig(params.editorConfig)); }
catch (e) { console.warn('code-files: invalid editorConfig JSON', e); }
// Puis on continue avec des variables vides
```

Si la config est invalide, les variables Prettier gardent la valeur de la dernière fois. Incohérent.

**Solution** : Passer une config par défaut au HTML lors de l'init si la parse échoue.

```javascript
try {
    applyEditorConfig(parseEditorConfig(params.editorConfig));
} catch (e) {
    console.warn('code-files: invalid editorConfig JSON, using fallback', e);
    // Fallback sur une config minimale sensée
    applyEditorConfig({
        tabSize: 4,
        insertSpaces: true,
        formatOnSave: false,
        printWidth: 100
    });
}
```

**Priorité** : 🟡 Moyenne (edge case, mais important pour la robustesse)

---

### 4. **parseEditorConfig n'est pas exportée mais devrait l'être**

**Lieu** : `settingsUtils.ts` ligne ~15

```typescript
function parseEditorConfig(str: string): unknown {
    return JSON.parse(
        str
            .replace(/\/\/[^\n]*/g, '')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/,(\s*[}\]])/g, '$1')
    );
}
```

Elle est appelée depuis `applyEditorConfig()` mais aussi depuis `monacoEditor.html` via postMessage. Logiquement c'est OK (elle est private), mais elle devrait être clarifiée comme "internal utility".

**Solution** : Ajouter JSDoc claire et considérer l'exporter si du code futur en aurait besoin.

```typescript
/**
 * Internal utility: Parses JSONC (JSON with Comments) by stripping comments and trailing commas.
 * Used by applyEditorConfig() to validate raw editor config strings.
 * 
 * @internal
 */
function parseEditorConfig(str: string): unknown {
    // ...
}
```

**Priorité** : 🟢 Basse (c'est un détail)

---

## 🟡 PROBLÈMES DE CLARTÉ/DOCUMENTATION

### 5. **Vocabulaire confus : "defaults" vs "initial config"**

**Lieu** : `types.ts` + `configuration-cascade.md`

**Problème** : 
- Les "defaults" sont sauvegardés dans les settings à l'installation
- Les utilisateurs existants ne verront **jamais** un changement de DEFAULT_EDITOR_CONFIG (même après une mise à jour du plugin)
- Ce ne sont pas des "defaults" au sens traditionnel (fallback), ce sont des "initial persisted values"

**Solution** : Renommer dans le code et la doc

```typescript
// Avant
export const DEFAULT_EDITOR_CONFIG = `{...}`;
export const DEFAULT_SETTINGS: MyPluginSettings = { ... };

// Après
export const PLUGIN_BASE_CONFIG = `{...}`;  // Ou INITIAL_EDITOR_CONFIG
export const PLUGIN_INITIAL_SETTINGS: MyPluginSettings = { ... };
```

Puis dans `configuration-cascade.md` :
```markdown
## 1. Plugin Base Config (Lowest Priority)

These values are the plugin's baseline configuration applied **once on first install**.
Changing them in code does **not** affect existing users — they are persisted and never updated.
```

**Fichiers à modifier** :
- `types.ts` : Renommer constantes
- `settingsUtils.ts` : Mettre à jour les références
- `configuration-cascade.md` : Clarifier le concept

**Priorité** : 🟡 Moyenne (c'est une clarté conceptuelle importante)

---

### 6. **getExtensionConfigTemplate() : convention cachée sur le format de l'extension**

**Lieu** : `types.ts` + `editorSettingsModal.ts`

**Problème** : 
- `getExtensionConfigTemplate()` attend `ext` **sans le `.`** (e.g. `'ts'`, not `'.ts'`)
- Mais `editorConfigs` utilise `'*'` et `'ts'` (aussi sans `.`)
- Cette convention n'est pas documentée nulle part

**Solution** : Ajouter JSDoc et un type guard

```typescript
/**
 * Returns a language-specific config template with commented suggestions.
 * 
 * @param ext - File extension WITHOUT the leading dot (e.g. 'ts', 'md', 'json')
 * @returns A JSON string with commented suggestions for this extension
 */
export function getExtensionConfigTemplate(ext: string): string {
    if (!ext) return DEFAULT_EXTENSION_CONFIG;
    // ...
}
```

Et dans `settingsUtils.ts`, ajouter une note dans `applyEditorConfig()` :

```typescript
/**
 * Saves a raw editor config string for the given key.
 * 
 * @param key - File extension WITHOUT dot (e.g. 'ts'), or '*' for global config
 */
export function saveEditorConfig(plugin: CodeFilesPlugin, key: string, value: string): boolean {
    // ...
}
```

**Priorité** : 🟢 Basse (mais prévention de bugs futurs)

---

## 📋 SYNTHÈSE DES CHANGEMENTS

| Fichier | Changement | Type | Priorité |
|---------|-----------|------|----------|
| `settingsUtils.ts` | Renommer `applyEditorConfig()` → `saveEditorConfig()` | Code | 🔴 Haute |
| `settingsUtils.ts` | Simplifier le check `defaultForKey` pour les extensions | Code | 🟡 Moyenne |
| `settingsUtils.ts` | Ajouter JSDoc sur la convention `ext` sans `.` | Doc | 🟢 Basse |
| `editorSettingsModal.ts` | Mettre à jour les deux appels à `saveEditorConfig()` | Code | 🔴 Haute |
| `monacoEditor.html` | Ajouter fallback si JSON cassé | Code | 🟡 Moyenne |
| `types.ts` | Renommer `DEFAULT_EDITOR_CONFIG` → `PLUGIN_BASE_CONFIG` | Code | 🟡 Moyenne |
| `types.ts` | Renommer `DEFAULT_SETTINGS` → `PLUGIN_INITIAL_SETTINGS` | Code | 🟡 Moyenne |
| `configuration-cascade.md` | Mettre à jour références et vocabulaire | Doc | 🟡 Moyenne |

---

## 🚀 PLAN D'ACTION POUR LLM VSCode

### Batch 1 : Renommage (critère)
**Commande** : "Faire un find-replace global sur `applyEditorConfig` en TypeScript. Remplacer par `saveEditorConfig`."

**Fichiers** :
1. `settingsUtils.ts` : définition + JSDoc
2. `editorSettingsModal.ts` : appels (2 endroits)
3. `configuration-cascade.md` : références

### Batch 2 : Clarté des defaults
**Commande** : "Renommer `DEFAULT_EDITOR_CONFIG` → `PLUGIN_BASE_CONFIG` et `DEFAULT_SETTINGS` → `PLUGIN_INITIAL_SETTINGS` partout."

**Fichiers** :
1. `types.ts` : définitions
2. `settingsUtils.ts` : références
3. `configuration-cascade.md` : doc

### Batch 3 : Simplification logique
**Commande** : "Dans `settingsUtils.ts`, simplifier la fonction `saveEditorConfig()` pour ne pas faire le check `defaultForKey` pour les extensions."

**Code actuel (lignes 62-67)** :
```typescript
if (key !== '*' && value === defaultForKey.trim()) {
    if (!(key in plugin.settings.editorConfigs)) return false;
    delete plugin.settings.editorConfigs[key];
    return true;
}
```

**Remplacer par** :
```typescript
if (key === '*' && value === DEFAULT_EDITOR_CONFIG.trim()) {
    if (!('*' in plugin.settings.editorConfigs)) return false;
    delete plugin.settings.editorConfigs[key];
    return true;
}
```

### Batch 4 : Robustesse HTML
**Commande** : "Dans `monacoEditor.html`, mettre en place un fallback si `applyEditorConfig()` échoue."

**Lieu** : Ligne ~765 et ~1018

**Remplacer le try/catch par** :
```javascript
try {
    applyEditorConfig(parseEditorConfig(params.editorConfig));
} catch (e) {
    console.warn('code-files: invalid editorConfig JSON, using fallback', e);
    applyEditorConfig({
        tabSize: 4,
        insertSpaces: true,
        formatOnSave: false,
        printWidth: 100
    });
}
```

### Batch 5 : Documentation
**Commande** : "Mettre à jour `configuration-cascade.md` pour clarifier que les 'defaults' sont en fait des 'initial persisted values'."

**Sections à modifier** :
- Titre : "Plugin Base Config (Lowest Priority)" au lieu de "TypeScript Defaults"
- Paragraphe d'intro : Clarifier que ça s'applique une seule fois
- Exemple walkthrough : Renommer les variables

---

## 📝 NOTES FINALES

**Ce qui marche bien** ✅
- Cascade logique : extension > global > base
- Merge simple et clair
- Persistance intelligente (supprime les overrides inutiles)
- Séparation TypeScript/HTML (même si confusante)

**Ce qui doit changer** 🔧
1. Renommer pour clarté
2. Simplifier la logique de default
3. Ajouter fallback robustesse
4. Clarifier documentation

**Temps estimé** : ~30-45 min via LLM VSCode (3-4 batches)
