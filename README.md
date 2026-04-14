# TestPlugin

## Lancer le simulateur (recommandé)

Le chat IA utilise maintenant un proxy local (`/api/openai-text`) pour eviter les erreurs navigateur de type
`Failed to fetch` quand on appelle OpenAI directement depuis le front.

1. Démarrer le serveur:

```bash
node server.js
```

2. Ouvrir ensuite:

```
http://localhost:8080
```

> Important: ne pas ouvrir `index.html` en `file://` si vous voulez que le chat OpenAI fonctionne.
