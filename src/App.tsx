import { useMemo, useState } from "react";
import { ADVANTAGE_LABELS, TRAIT_GROUPS, TRAIT_KEYS, type AdvantageType, type GameConfig, type GameState } from "./types";
import { createDefaultConfig, buildGame, randomizeRoster, syncManualPlayers } from "./engine/generator";
import { simulateFullSeason, simulateNextEpisode } from "./engine/simulator";
import { emptyBlueprint } from "./data/presets";
import { loadSavedConfig, loadSavedSeason, saveConfig, saveSeason } from "./storage";
import { PlayerEditor } from "./components/PlayerEditor";
import { SeasonDashboard } from "./components/SeasonDashboard";
import { averageBy, clampNumber } from "./utils";
import "./styles.css";

function normalizeConfig(config: GameConfig): GameConfig {
  const playerCount = clampNumber(config.playerCount, 8, 20);
  const tribeCount = clampNumber(config.tribeCount, 1, 4);
  const finalists = clampNumber(config.finalists, 2, 3);
  const jurySize = clampNumber(config.jurySize, 0, Math.max(0, playerCount - finalists - 1));
  const mergeFloor = Math.max(finalists + 1, finalists + jurySize);
  const mergeAt = clampNumber(config.mergeAt, mergeFloor, playerCount - 1);

  const base = {
    ...config,
    playerCount,
    tribeCount,
    finalists,
    jurySize,
    mergeAt,
  };
  return {
    ...base,
    manualPlayers: syncManualPlayers(base).slice(0, playerCount),
  };
}

function App() {
  const [config, setConfig] = useState<GameConfig>(() => normalizeConfig(loadSavedConfig() ?? createDefaultConfig()));
  const [season, setSeason] = useState<GameState | null>(() => loadSavedSeason());
  const [editingIndex, setEditingIndex] = useState<number | null>(0);

  const normalizedConfig = useMemo(() => normalizeConfig(config), [config]);

  const castMetrics = useMemo(() => {
    const players = normalizedConfig.manualPlayers.slice(0, normalizedConfig.playerCount);
    return {
      social: averageBy(players, (player) => player.traits.sociability),
      strategic: averageBy(players, (player) => player.traits.strategic),
      volatility: averageBy(players, (player) => player.traits.impulsivity),
      challenge: averageBy(players, (player) => player.traits.challengeSkill),
    };
  }, [normalizedConfig]);

  const updateConfig = (updater: (previous: GameConfig) => GameConfig) => {
    setConfig((previous) => {
      const next = normalizeConfig(updater(previous));
      saveConfig(next);
      return next;
    });
  };

  const handleNumericConfig = (key: "playerCount" | "tribeCount" | "mergeAt" | "jurySize" | "finalists" | "seed", value: number) => {
    updateConfig((previous) => ({ ...previous, [key]: value }));
  };

  const handleAdvantageToggle = (type: AdvantageType) => {
    updateConfig((previous) => ({
      ...previous,
      enabledAdvantages: {
        ...previous.enabledAdvantages,
        [type]: !previous.enabledAdvantages[type],
      },
    }));
  };

  const handleGenerateRoster = () => {
    updateConfig((previous) => {
      const nextSeed = previous.seed + 1;
      return randomizeRoster({
        ...previous,
        seed: nextSeed,
      });
    });
  };

  const handleResetSlots = () => {
    updateConfig((previous) => ({
      ...previous,
      manualPlayers: Array.from({ length: previous.playerCount }, (_, index) => emptyBlueprint(index)),
    }));
  };

  const handleCreateSeason = () => {
    const next = buildGame(normalizedConfig);
    setSeason(next);
    saveSeason(next);
  };

  const handleStepSeason = () => {
    if (!season) {
      return;
    }
    const next = simulateNextEpisode(season);
    setSeason(next);
    saveSeason(next);
  };

  const handleRunFullSeason = () => {
    const base = season ?? buildGame(normalizedConfig);
    const next = simulateFullSeason(base);
    setSeason(next);
    saveSeason(next);
  };

  const handleClearSeason = () => {
    setSeason(null);
    saveSeason(null);
  };

  return (
    <div className="app-shell">
      <header className="hero">
        <div className="hero__copy">
          <span className="eyebrow">Simulation sociale / strategique</span>
          <h1>Survivor Simulator</h1>
          <p>
            Une V1 jouable centree sur les dynamiques de tribu, les alliances vivantes, la memoire relationnelle, les
            avantages et un jury final coherent.
          </p>
          <div className="hero__actions">
            <button className="primary" onClick={handleCreateSeason}>
              Nouvelle saison
            </button>
            <button onClick={handleRunFullSeason}>Simuler la saison complete</button>
            <button onClick={handleStepSeason} disabled={!season || season.phase === "complete"}>
              Simuler 1 episode
            </button>
          </div>
        </div>
        <div className="hero__stats panel">
          <h3>Architecture V1</h3>
          <ul className="bullet-list">
            <li>Moteur modulaire: cast, relations, alliances, votes, jury</li>
            <li>IA imparfaite avec bruit emotionnel, paranoia et coordination partielle</li>
            <li>Journal par episode + historique global</li>
            <li>Sauvegarde locale de la config et de la saison</li>
          </ul>
        </div>
      </header>

      <main className="layout">
        <section className="left-column">
          <div className="panel">
            <div className="section-header">
              <div>
                <h2>Configuration de la saison</h2>
                <p className="muted">Personnalisez le cast, la structure de saison et les avantages.</p>
              </div>
            </div>

            <div className="form-grid">
              <label>
                <span>Nom de la saison</span>
                <input
                  value={normalizedConfig.seasonName}
                  onChange={(event) => updateConfig((previous) => ({ ...previous, seasonName: event.target.value }))}
                />
              </label>
              <label>
                <span>Mode</span>
                <select
                  value={normalizedConfig.mode}
                  onChange={(event) =>
                    updateConfig((previous) => ({
                      ...previous,
                      mode: event.target.value as GameConfig["mode"],
                    }))
                  }
                >
                  <option value="observer">Observateur / realisateur</option>
                  <option value="auto">Simulation complete</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
              <label>
                <span>Joueurs</span>
                <input
                  type="number"
                  min={8}
                  max={20}
                  value={normalizedConfig.playerCount}
                  onChange={(event) => handleNumericConfig("playerCount", Number(event.target.value))}
                />
              </label>
              <label>
                <span>Tribus de depart</span>
                <input
                  type="number"
                  min={1}
                  max={4}
                  value={normalizedConfig.tribeCount}
                  onChange={(event) => handleNumericConfig("tribeCount", Number(event.target.value))}
                />
              </label>
              <label>
                <span>Fusion a</span>
                <input
                  type="number"
                  min={normalizedConfig.finalists + 1}
                  max={normalizedConfig.playerCount - 1}
                  value={normalizedConfig.mergeAt}
                  onChange={(event) => handleNumericConfig("mergeAt", Number(event.target.value))}
                />
              </label>
              <label>
                <span>Finalistes</span>
                <input
                  type="number"
                  min={2}
                  max={3}
                  value={normalizedConfig.finalists}
                  onChange={(event) => handleNumericConfig("finalists", Number(event.target.value))}
                />
              </label>
              <label>
                <span>Taille du jury</span>
                <input
                  type="number"
                  min={0}
                  max={normalizedConfig.playerCount - normalizedConfig.finalists - 1}
                  value={normalizedConfig.jurySize}
                  onChange={(event) => handleNumericConfig("jurySize", Number(event.target.value))}
                />
              </label>
              <label>
                <span>Seed</span>
                <input
                  type="number"
                  value={normalizedConfig.seed}
                  onChange={(event) => handleNumericConfig("seed", Number(event.target.value))}
                />
              </label>
            </div>

            <div className="section-block">
              <div className="section-header">
                <div>
                  <h3>Avantages actifs</h3>
                  <p className="muted">Vous pouvez activer ou retirer des mecaniques pour ajuster le chaos de la saison.</p>
                </div>
              </div>
              <div className="toggle-grid">
                {(Object.keys(normalizedConfig.enabledAdvantages) as AdvantageType[]).map((type) => (
                  <label key={type} className={`toggle ${normalizedConfig.enabledAdvantages[type] ? "is-on" : ""}`}>
                    <input
                      type="checkbox"
                      checked={normalizedConfig.enabledAdvantages[type]}
                      onChange={() => handleAdvantageToggle(type)}
                    />
                    <span>{ADVANTAGE_LABELS[type]}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="section-block">
              <div className="section-header">
                <div>
                  <h3>Cast et tonalite globale</h3>
                  <p className="muted">Le cast controle directement la texture sociale et psychologique de la saison.</p>
                </div>
                <div className="inline-actions">
                  <button onClick={handleGenerateRoster}>Generer un cast varie</button>
                  <button onClick={handleResetSlots}>Reinitialiser manuellement</button>
                </div>
              </div>
              <div className="metric-grid">
                <div className="metric-card">
                  <span className="metric-label">Social moyen</span>
                  <strong>{castMetrics.social}</strong>
                </div>
                <div className="metric-card">
                  <span className="metric-label">Strategie moyenne</span>
                  <strong>{castMetrics.strategic}</strong>
                </div>
                <div className="metric-card">
                  <span className="metric-label">Volatilite</span>
                  <strong>{castMetrics.volatility}</strong>
                </div>
                <div className="metric-card">
                  <span className="metric-label">Defis</span>
                  <strong>{castMetrics.challenge}</strong>
                </div>
              </div>

              <div className="cast-grid">
                {normalizedConfig.manualPlayers.slice(0, normalizedConfig.playerCount).map((player, index) => (
                  <button
                    key={player.id}
                    className={`cast-card ${editingIndex === index ? "selected" : ""}`}
                    onClick={() => setEditingIndex(index)}
                  >
                    <div className="cast-card__avatar" style={{ background: player.avatar }} />
                    <div>
                      <strong>{player.name}</strong>
                      <p>{player.archetype}</p>
                    </div>
                    <span className="pill">{player.identity}</span>
                  </button>
                ))}
              </div>

              {editingIndex !== null && normalizedConfig.manualPlayers[editingIndex] ? (
                <PlayerEditor
                  player={normalizedConfig.manualPlayers[editingIndex]}
                  index={editingIndex}
                  traitGroups={TRAIT_GROUPS}
                  onChange={(updatedPlayer) =>
                    updateConfig((previous) => {
                      const manualPlayers = syncManualPlayers(previous);
                      manualPlayers[editingIndex] = updatedPlayer;
                      return { ...previous, manualPlayers };
                    })
                  }
                />
              ) : null}
            </div>
          </div>

          <div className="panel">
            <div className="section-header">
              <div>
                <h2>Structures de donnees principales</h2>
                <p className="muted">La V1 est construite pour evoluer vers des discussions plus riches et du mode joueur.</p>
              </div>
            </div>
            <div className="architecture-grid">
              <article>
                <h3>Player / PlayerStats</h3>
                <p>Chaque joueur combine traits sociaux, strategiques, psychologiques et de defis.</p>
              </article>
              <article>
                <h3>Relationship</h3>
                <p>Chaque duo suit confiance, proximite, suspicion, dette morale, grief et memoire de trahison.</p>
              </article>
              <article>
                <h3>Alliance</h3>
                <p>Les alliances ont force, exposition, risque de fracture, objectifs et noyau de membres.</p>
              </article>
              <article>
                <h3>EpisodeSummary / EventLog</h3>
                <p>Chaque episode garde une lecture narrative, tandis que le journal conserve le detail exploitable.</p>
              </article>
              <article>
                <h3>TribalCouncilRecord</h3>
                <p>Votes, revotes, idoles, blocks, steal-a-vote, nullifier et notes de conseil sont historises.</p>
              </article>
              <article>
                <h3>GameState</h3>
                <p>Le moteur garde tout l'etat de saison pour permettre sauvegarde, reprise et futures extensions.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="right-column">
          <SeasonDashboard
            season={season}
            onNewSeason={handleCreateSeason}
            onSimulateEpisode={handleStepSeason}
            onSimulateFullSeason={handleRunFullSeason}
            onClearSeason={handleClearSeason}
          />

          <div className="panel">
            <div className="section-header">
              <div>
                <h2>Profondeur systemique de la V1</h2>
                <p className="muted">Ce qui est deja present dans le moteur.</p>
              </div>
            </div>
            <div className="tag-cloud">
              {[
                "Alliances dynamiques",
                "Sous-groupes emergents",
                "Votes imparfaits",
                "Votes emotionnels",
                "Split vote conditionnel",
                "Idoles",
                "Extra vote",
                "Vote block",
                "Steal a vote",
                "Safety without power",
                "Idol nullifier",
                "Fusion",
                "Jury multi-critere",
                "Journal complet",
                "Sauvegarde locale",
                "Cast personnalisable",
              ].map((item) => (
                <span key={item} className="tag">
                  {item}
                </span>
              ))}
            </div>

            <div className="trait-summary">
              <h3>Variables de traits exposees</h3>
              <div className="trait-chip-grid">
                {TRAIT_KEYS.map((key) => (
                  <span key={key} className="trait-chip">
                    {key}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
