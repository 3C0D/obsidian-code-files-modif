Exactement. Le cycle complet :

```
this.diffAction          → buildContext()  → context.diffAction
                                                    ↓
                                            showDiffAction() modifie context.diffAction
                                                    ↓
context.diffAction       → read back      → this.diffAction
```

`this.diffAction` n'est jamais utilisé directement pour appeler `.remove()` ou quoi que ce soit dans la classe. Son seul rôle c'est d'être injecté dans le prochain `buildContext()`, pour que la standalone ait la valeur à jour. C'est un aller-retour permanent entre la classe et les helpers via le context.


`setViewData` est un override d'une méthode abstraite de `TextFileView`. Obsidian l'appelle automatiquement dans deux situations :

**1. Chargement initial** : quand Obsidian lit le fichier sur disque, il appelle `setViewData(contenuDuFichier, true)`. À ce moment `codeEditor` n'existe pas encore (il est créé dans `onLoadFile` juste après), donc le `if (this.codeEditor)` est faux et on se contente de stocker dans `this.data`.

**2. Modification externe** : si le fichier est modifié sur disque pendant que la vue est ouverte (ex. un autre éditeur), Obsidian relit le fichier et rappelle `setViewData` avec le nouveau contenu. Là `codeEditor` existe. La comparaison :

```ts
if (this.codeEditor.getValue() !== data)
```

protège l'historique undo/redo de Monaco. Sans elle, chaque appel à `setViewData` effacerait l'historique même si le contenu n'a pas changé, ce qui rendrait Ctrl+Z inutilisable.

Donc `this.data` est le cache Obsidian du contenu disque, et `codeEditor.setValue()` est la synchronisation vers l'iframe Monaco.
