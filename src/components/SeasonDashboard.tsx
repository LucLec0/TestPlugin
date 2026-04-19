import type { Alliance, EventLog, GameState, Player, Relationship, Tribe } from "../types";
import { formatPercent, playerMapById, tribeMapById } from "../utils";

interface SeasonDashboardProps {
  season: GameState | null;
  onNewSeason: () => void;
  onSimulateEpisode: () => void;
  onSimulateFullSeason: () => void;
  onClearSeason: () => void;
}

function sortedActivePlayers(state: GameState): Player[] {
  return [...state.players].sort((a, b) => {
    if (a.status === "active" && b.status !== "active") {
      return -1;
    }
    if (a.status !== "active" && b.status === "active") {
      return 1;
    }
    return (a.placement ?? 999) - (b.placement ?? 999);
  });
}

function topRelationships(state: GameState, playerId: string): Relationship[] {
  return Object.values(state.relationships)
    .filter((relationship) => relationship.fromId === playerId)
    .sort((a, b) => {
      const aScore = a.trust + a.closeness + a.allianceScore - a.suspicion - a.irritation;
      const bScore = b.trust + b.closeness + b.allianceScore - b.suspicion - b.irritation;
      return bScore - aScore;
    })
    .slice(0, 4);
}

function dangerousPlayers(state: GameState): Player[] {
  return [...state.players]
    .filter((player) => player.status === "active")
    .sort((a, b) => b.dangerLevel - a.dangerLevel)
    .slice(0, 5);
}

function recentLogs(state: GameState): EventLog[] {
  return [...state.logs].slice(-16).reverse();
}

function tribeRoster(tribe: Tribe, state: GameState): Player[] {
  return tribe.memberIds
    .map((playerId) => state.players.find((player) => player.id === playerId))
    .filter((player): player is Player => Boolean(player));
}

function allianceMembers(alliance: Alliance, playerById: Record<string, Player>): string {
  return alliance.members.map((memberId) => playerById[memberId]?.name ?? memberId).join(", ");
}

export function SeasonDashboard({
  season,
  onNewSeason,
  onSimulateEpisode,
  onSimulateFullSeason,
  onClearSeason,
}: SeasonDashboardProps) {
  if (!season) {
    return (
      <div className="dashboard">
        <section className="hero-card">
          <div>
            <div className="eyebrow">Aucune saison active</div>
            <h1>Pret a simuler</h1>
            <p>
              Cree une saison pour voir les relations se construire, les alliances se former et les conseils tribaux
              prendre vie.
            </p>
          </div>
          <div className="hero-actions">
            <button onClick={onNewSeason}>Creer une saison</button>
            <button className="secondary" onClick={onSimulateFullSeason}>
              Generer puis simuler toute la saison
            </button>
          </div>
        </section>
      </div>
    );
  }

  const state = season;
  const playerById = playerMapById(state.players);
  const tribeById = tribeMapById(state.tribes);
  const winner = state.winnerId ? playerById[state.winnerId] : undefined;
  const latestEpisode = state.episodes[state.episodes.length - 1];
  const canAdvance = state.phase !== "complete";

  return (
    <div className="dashboard">
      <section className="hero-card">
        <div>
          <div className="eyebrow">Simulation de saison</div>
          <h1>{state.config.seasonName}</h1>
          <p>
            Episode {state.episode} - Jour {state.day} - Phase: {state.phase}
          </p>
          <div className="pill-row">
            <span className="pill">Actifs: {state.players.filter((player) => player.status === "active").length}</span>
            <span className="pill">Jury: {state.juryIds.length}</span>
            <span className="pill">Alliances: {state.alliances.length}</span>
            <span className="pill">Seed: {state.seed}</span>
          </div>
        </div>
        <div className="hero-actions">
          <button onClick={onSimulateEpisode} disabled={!canAdvance}>
            Simuler l'episode suivant
          </button>
          <button className="secondary" onClick={onSimulateFullSeason} disabled={!canAdvance}>
            Simuler toute la saison
          </button>
          <button className="ghost" onClick={onClearSeason}>
            Effacer la saison
          </button>
        </div>
      </section>

      {winner ? (
        <section className="winner-banner">
          <div className="winner-avatar" style={{ background: winner.avatar }} />
          <div>
            <div className="eyebrow">Vainqueur</div>
            <h2>{winner.name}</h2>
            <p>
              Archetype: {winner.archetype} - Capital social {formatPercent(winner.socialCapital)} - Moves {winner.strategicMoves}
            </p>
          </div>
        </section>
      ) : null}

      <div className="grid two-columns">
        <section className="panel">
          <h2>Dernier episode</h2>
          {latestEpisode ? (
            <div className="episode-summary">
              <p className="muted">
                {latestEpisode.title} - Jours {latestEpisode.dayStart} a {latestEpisode.dayEnd}
              </p>
              <ul>
                {latestEpisode.events.slice(0, 10).map((event, index) => (
                  <li key={`${latestEpisode.episode}-${index}`}>{event}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="muted">La saison n'a pas encore commence. Lance un premier episode pour voir les dynamiques emerger.</p>
          )}
        </section>

        <section className="panel">
          <h2>Menaces du moment</h2>
          <div className="stack">
            {dangerousPlayers(state).map((player) => (
              <div key={player.id} className="threat-row">
                <div className="avatar-sm" style={{ background: player.avatar }} />
                <div>
                  <strong>{player.name}</strong>
                  <div className="muted">
                    {tribeById[player.tribeId]?.name ?? "Ancienne tribu"} - danger {formatPercent(player.dangerLevel)} - social {formatPercent(player.socialCapital)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid two-columns">
        <section className="panel">
          <h2>Tribus</h2>
          <div className="tribe-grid">
            {state.tribes.map((tribe) => (
              <div key={tribe.id} className="tribe-card">
                <div className="tribe-header">
                  <span className="tribe-color" style={{ background: tribe.color }} />
                  <h3>{tribe.name}</h3>
                </div>
                <div className="stack">
                  {tribeRoster(tribe, state).map((player) => (
                    <div key={player.id} className="mini-player">
                      <div className="avatar-sm" style={{ background: player.avatar }} />
                      <div>
                        <strong>{player.name}</strong>
                        <div className="muted">
                          {player.status} - capital {formatPercent(player.socialCapital)} - menace {formatPercent(player.dangerLevel)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>Alliances dominantes</h2>
          <div className="stack">
            {[...state.alliances]
              .sort((a, b) => b.strength - a.strength)
              .slice(0, 8)
              .map((alliance) => (
                <article key={alliance.id} className="alliance-card">
                  <div className="alliance-topline">
                    <strong>{alliance.name}</strong>
                    <span className="pill small">{formatPercent(alliance.strength)}</span>
                  </div>
                  <p className="muted">{alliance.objective}</p>
                  <p>{allianceMembers(alliance, playerById)}</p>
                  <div className="meter-row">
                    <span>Confiance {formatPercent(alliance.trust)}</span>
                    <span>Risque {formatPercent(alliance.fractureRisk)}</span>
                  </div>
                </article>
              ))}
          </div>
        </section>
      </div>

      <div className="grid two-columns">
        <section className="panel">
          <h2>Conseil tribal recent</h2>
          {state.lastTribal ? (
            <div className="tribal-card">
              <p>
                <strong>{state.lastTribal.tribeName}</strong> - elimine: <strong>{state.lastTribal.eliminatedName}</strong>
              </p>
              <ul>
                {state.lastTribal.votes.map((vote, index) => (
                  <li key={`vote-${index}`}>
                    {playerById[vote.voterId]?.name} vote {playerById[vote.targetId]?.name}
                    {vote.voided ? " (annule)" : ""} - {vote.reason}
                  </li>
                ))}
              </ul>
              {state.lastTribal.notes.length > 0 ? (
                <>
                  <h3>Notes</h3>
                  <ul>
                    {state.lastTribal.notes.map((line, index) => (
                      <li key={`note-${index}`}>{line}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          ) : (
            <p className="muted">Aucun conseil tribal pour l'instant.</p>
          )}
        </section>

        <section className="panel">
          <h2>Journal recent</h2>
          <div className="stack">
            {recentLogs(state).map((log) => (
              <article key={log.id} className="log-card">
                <div className="log-meta">
                  <span className={`tag tag-${log.category}`}>{log.category}</span>
                  <span className="muted">
                    Episode {log.episode} - Jour {log.day}
                  </span>
                </div>
                <strong>{log.title}</strong>
                <p>{log.description}</p>
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className="panel">
        <h2>Joueurs et relations dominantes</h2>
        <div className="player-grid">
          {sortedActivePlayers(state).map((player) => (
            <article key={player.id} className={`player-card ${player.status !== "active" ? "is-eliminated" : ""}`}>
              <div className="player-header">
                <div className="avatar" style={{ background: player.avatar }} />
                <div>
                  <h3>{player.name}</h3>
                  <p className="muted">
                    {player.archetype} - {player.status}
                  </p>
                </div>
              </div>
              <div className="stats-inline">
                <span>Social {formatPercent(player.socialCapital)}</span>
                <span>Menace {formatPercent(player.dangerLevel)}</span>
                <span>Defis {player.challengeWins}</span>
                <span>Moves {player.strategicMoves}</span>
              </div>
              <div className="relationship-list">
                {topRelationships(state, player.id).map((relationship) => {
                  const counterpart = playerById[relationship.toId];
                  if (!counterpart) {
                    return null;
                  }
                  return (
                    <div key={`${player.id}-${relationship.toId}`} className="relationship-row">
                      <strong>{counterpart.name}</strong>
                      <span>Confiance {formatPercent(relationship.trust)}</span>
                      <span>Proximite {formatPercent(relationship.closeness)}</span>
                      <span>Soupcon {formatPercent(relationship.suspicion)}</span>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
