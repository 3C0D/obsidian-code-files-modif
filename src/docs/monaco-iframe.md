Le principe central : Monaco ne peut pas tourner directement dans Obsidian, donc il tourne dans une **iframe** qui charge `embeddable-monaco.lukasbach.com`. Les deux côtés communiquent par `postMessage`, comme deux fenêtres qui s'envoient des messages.

**Le flux :**

1. On construit une URL avec tous les paramètres (thème, langage, options) et on crée l'iframe avec cette URL.
2. L'iframe charge Monaco, puis envoie `ready` quand c'est prêt.
3. On reçoit `ready` → on envoie le contenu initial avec `change-value`.
4. Quand l'utilisateur tape dans Monaco, l'iframe envoie `change` avec la nouvelle valeur → on met à jour `value` et on appelle `onChange`.

**Le `codeContext` :** si plusieurs iframes Monaco sont ouvertes en même temps (un fichier + un fence modal par exemple), elles envoient toutes des `change` sur le même `window`. Le `codeContext` sert à identifier à quelle instance appartient le message.

**Ce que retourne la fonction :** un objet de contrôle (`iframe`, `getValue`, `setValue`, `clear`, `destroy`, `send`) pour que le code extérieur puisse interagir avec l'éditeur sans connaître les détails de la communication postMessage.


**Perspectives**

Par ordre de priorité :

Finir la revue du code actuel : fenceEditContext.ts avec toutes les modifications discutées, puis main.ts. Base solide d'abord.
Récupérer les extensions depuis Monaco : c'est un gain concret et immédiat, ça supprime un gros fichier à maintenir.
Bundler Monaco en local : condition sine qua non pour tout le reste. Tant que Monaco est externe, tu ne peux pas ajouter de lint, de plugins, de console, ni rien de custom. C'est le vrai déblocage architectural.
Lint et services additionnels : faisable une fois Monaco bundlé, Monaco supporte les workers pour ça.
Console, raccourcis VSCode, fusion avec d'autres plugins : à voir une fois la base stable, c'est de la feature.
