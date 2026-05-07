# Pattern de Redimensionnement Performance (Debounce + Throttle)

Ce document explique la stratégie avancée de redimensionnement utilisée dans le plugin `obsidian-terminal` pour garantir une interface fluide tout en limitant l'impact sur les performances (CPU/GPU).

## Le Problème : Fluidité vs Coût

Lorsqu'on redimensionne un panneau contenant un éditeur complexe (comme Monaco) ou un terminal (Xterm.js) :
1. **Le Redimensionnement DOM** (changer la hauteur d'une `div`) est très rapide.
2. **Le Recalcul du Layout interne** (`editor.layout()` ou `terminal.resize()`) est très coûteux car il doit repositionner chaque caractère, recalculer les lignes, etc.

Si on exécute (2) sur chaque événement `mousemove`, l'interface saccade et le curseur semble se détacher de la poignée de redimensionnement.

## La Solution : `asyncDebounce` + `throttle`

Dans le projet `obsidian-terminal`, la logique de redimensionnement est implémentée avec une combinaison de deux techniques issues de la bibliothèque `obsidian-plugin-library`.

### 1. Définition des fonctions (`src/utils.ts` dans la library)

#### `throttle` (Lodash)
Limite la fréquence d'exécution. Si on appelle la fonction 60 fois par seconde, le `throttle` ne laissera passer l'appel que toutes les X millisecondes (ex: 100ms).

#### `asyncDebounce` ([utils.ts:L203](file:///C:/Users/dd200/Desktop/polyipseity/obsidian-plugin-library/src/utils.ts#L203))
C'est un "aggrégateur de promesses". 
- Chaque appel au redimensionnement renvoie une `Promise`.
- Si un appel est en attente (bloqué par le throttle), `asyncDebounce` stocke la promesse dans une liste.
- Dès que l'exécution réelle a lieu, **toutes** les promesses en attente sont résolues simultanément avec le dernier résultat.

### 2. Implémentation concrète ([emulator.ts:L123](file:///C:/Users/dd200/Desktop/polyipseity/obsidian-terminal/src/terminal/emulator.ts#L123))

Voici comment l'émulateur combine les deux :

```typescript
protected readonly resizeEmulator = asyncDebounce(
  throttle(
    (resolve, reject, columns, rows) => {
      try {
        this.terminal.resize(columns, rows); // Opération coûteuse
        resolve();
      } catch (error) {
        reject(error);
      }
    },
    100 // WAIT en ms
  ),
);
```

### 3. Application au Panel et à la Console

Pour une expérience utilisateur optimale (sans l'effet de "disparition" mentionné par l'utilisateur) :

1. **Update Visuel Immédiat (Sync)** : La hauteur du conteneur (`div.style.height`) doit être mise à jour **immédiatement** dans le `mousemove`. Cela permet à la poignée de suivre le curseur de façon fluide.
2. **Update Logique Différé (Async/Throttled)** : L'appel à `editor.layout()` (pour Monaco) ou `terminal.resize()` (pour le PTY) doit passer par le pattern `asyncDebounce(throttle(...))`.

---

## Pourquoi l'ancien système "disparaît" ?

Si la console semble "disparaître" ou ne se mettre à jour qu'à la fin du mouvement (le résultat "saute" d'un coup sans voir l'intermédiaire), c'est généralement parce que l'opération coûteuse (`editor.layout()`) bloque le thread principal à chaque mouvement de souris. Le navigateur n'a plus le temps de dessiner les étapes intermédiaires du DOM.

## Application au Projet Actuel (`console.ts`)

Pour corriger ce comportement dans `src/editor/iframe/console.ts`, il faut séparer la mise à jour visuelle de la mise à jour logique en utilisant un `throttle` :

1.  **Mise à jour visuelle (Synchrone)** : Changer `pane.style.height` immédiatement à chaque `mousemove`. Cela garantit que la bordure de la console suit parfaitement la souris.
2.  **Mise à jour de l'éditeur (Throttled)** : Encapsuler `editor.layout()` dans un `throttle` (ex: 50ms). Cela permet à Monaco de se réajuster régulièrement pendant le mouvement sans étouffer le navigateur.

### Modification effectuée dans `src/editor/iframe/console.ts` :

```typescript
/**
 * Utilitaire throttle pour limiter la fréquence des opérations lourdes.
 * Exécute immédiatement le premier appel, puis garantit l'exécution du dernier
 * appel après le délai spécifié.
 */
function throttle(func: Function, limit: number) {
  let inThrottle: boolean;
  let lastFunc: ReturnType<typeof setTimeout>;
  return function(this: any, ...args: any[]) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    } else {
      clearTimeout(lastFunc);
      lastFunc = setTimeout(() => func.apply(this, args), limit);
    }
  };
}

// ... dans initConsolePane

const throttledLayout = throttle(() => {
    editor?.layout();
}, 50);

const onMouseMove = (e: MouseEvent): void => {
    const delta = startY - e.clientY;
    const newHeight = Math.max(80, Math.min(window.innerHeight * 0.8, startHeight + delta));
    
    // 1. VISUEL IMMÉDIAT : La poignée suit la souris de façon fluide
    pane.style.height = newHeight + 'px';
    
    // 2. LAYOUT THROTTLED : L'éditeur Monaco s'ajuste régulièrement sans saccades
    throttledLayout();
};
```

---

## Références Code

- **Library Utils** : [asyncDebounce](file:///C:/Users/dd200/Desktop/polyipseity/obsidian-plugin-library/src/utils.ts#L203)
- **Terminal Emulator** : [Logic de resize](file:///C:/Users/dd200/Desktop/polyipseity/obsidian-terminal/src/terminal/emulator.ts#L123-L175)
- **Terminal View** : [ResizeObserver integration](file:///C:/Users/dd200/Desktop/polyipseity/obsidian-terminal/src/terminal/view.ts#L1255)
