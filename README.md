# TestPlugin

## Lancement ultra simple

### Windows
Double-clique sur `launch.bat`

### Linux / macOS
Dans un terminal:

```bash
chmod +x launch.sh
./launch.sh
```

Ensuite ouvre automatiquement:

```
http://localhost:8787
```

## Pourquoi

Le chat OpenAI passe par un proxy local (`/api/openai/chat`) pour eviter les erreurs `Failed to fetch` du navigateur.

> Si tu ouvres `index.html` en double-clic (`file://`), une redirection automatique vers `http://localhost:8787` est tentee.
