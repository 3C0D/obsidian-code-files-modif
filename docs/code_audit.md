## 🚧 Non traité — refactoring lourd

Ces points restent dans l'audit car ils nécessitent une refonte plus importante :

| # | Problème | Complexité |
|---|---------|-----------|
| **S1** | `mountCodeEditor.ts` connaît `EditorSettingsModal`, `ChooseThemeModal`, `RenameExtensionModal` — violation de la séparation des responsabilités. Les handlers `open-formatter-config`, `open-theme-picker`, `open-rename-extension` devraient être délégués au caller via callbacks | Élevée — touche l'architecture de communication iframe |
| **S4** | `CodeEditorView.openFile` construit un `CodeEditorView` manuellement (bypass API Obsidian) pour les fichiers hors vault | Moyenne — nécessite une alternative API stable |
| **S5** | `chooseCssFileModal.ts` construit un `TFile` manuellement avec `@ts-expect-error` | Faible-Moyenne — même problème que S4 |


