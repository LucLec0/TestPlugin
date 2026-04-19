# Survivor Simulator

Jeu de simulation solo inspire de Survivor, centre sur la strategie sociale, les alliances, la memoire relationnelle, les conseils tribaux et la rejouabilite.

## V1 incluse dans ce depot

- configuration de saison:
  - nombre de joueurs
  - nombre de tribus
  - point de fusion
  - nombre de finalistes
  - taille du jury
  - seed
  - activation/desactivation des avantages
- edition du cast:
  - noms
  - identite
  - archetypes
  - 20 statistiques par joueur
  - generation automatique d'un cast complet
- simulation d'une saison complete ou episode par episode
- moteur social:
  - relations dyadiques (confiance, proximite, suspicion, admiration, irritation, peur, dette morale, etc.)
  - alliances dynamiques avec force, confiance, risque de fracture, exposition et objectif
  - discussions de lien, reassurance, manipulation, mensonge, pitch de cible, creation de pactes
  - memoire des trahisons et grievances
- gameplay:
  - defis pre-merge et individuels
  - vote coordonne ou emotionnel
  - split vote possible
  - egalite et revote
  - idoles et avantages optionnels
  - fusion, jury et final tribal council
- interface:
  - configuration
  - tableau de saison
  - tribus
  - joueurs
  - alliances
  - relations
  - journal d'evenements
  - episodes
- persistence:
  - sauvegarde locale automatique de la configuration
  - sauvegarde locale de la saison en cours

## Architecture

Le projet est volontairement separe en couches simples et extensibles:

- `src/types.ts`
  - tous les modeles du domaine: joueurs, relations, alliances, episodes, votes, jury
- `src/data/presets.ts`
  - archetypes, presets visuels, labels et valeurs par defaut
- `src/engine/random.ts`
  - RNG seedable et utilitaires numeriques
- `src/engine/generator.ts`
  - generation de cast, normalisation de config, creation des tribus et des relations initiales
- `src/engine/simulator.ts`
  - moteur principal de saison:
    - interactions sociales
    - evolution des alliances
    - recherche d'avantages
    - defis
    - planification des votes
    - conseils tribaux
    - fusion
    - resolution du jury
- `src/components/PlayerEditor.tsx`
  - edition du cast
- `src/components/SeasonDashboard.tsx`
  - lecture de la saison, alliances, relations, tribus, logs et episodes
- `src/storage.ts`
  - sauvegarde/chargement local
- `src/App.tsx`
  - orchestration globale

## Philosophie de simulation

Cette V1 cherche a eviter les comportements absurdement \"optimaux\":

- les joueurs suivent des plans, mais peuvent:
  - mentir maladroitement,
  - voter emotionnellement,
  - surreactiver une peur,
  - proteger un allie,
  - trop se reposer sur une alliance,
  - mal evaluer un danger.
- les relations ne sont pas binaires: chaque duo evolue selon plusieurs dimensions.
- les alliances ne sont pas figees: elles se renforcent, se fissurent et se superposent.

## Lancer le projet

```bash
npm install
npm run dev
```

Build de production:

```bash
npm run build
```

## Pistes d'evolution recommandees

- vrai mode joueur humain avec dialogue et decisions manuelles
- ecran de conseil plus theatral avec reveal bulletin par bulletin
- systeme de recompenses et fatigue plus riche
- swaps de tribus
- firemaking final 4 optionnel
- systeme de confessionnaux / narration plus detaillee
- jury Q&A interactif
- portraits importes par utilisateur
- mode \"realisateur\" avec injections d'evenements et twists
