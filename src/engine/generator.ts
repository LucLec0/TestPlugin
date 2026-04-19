import { ALLIANCE_OBJECTIVES, ARCHETYPES, AVATAR_SWATCHES, DEFAULT_ADVANTAGES, DEFAULT_STATS, IDENTITIES, MERGE_TRIBE_NAMES, NAME_POOL, STARTING_TRIBE_NAMES } from "../data/presets";
import type { Alliance, GameConfig, GameState, Player, PlayerBlueprint, PlayerStats, Relationship, Tribe } from "../types";
import { average, clamp, RNG } from "./random";

function relationshipKey(fromId: string, toId: string): string {
  return `${fromId}->${toId}`;
}

function applyModifiers(base: PlayerStats, modifiers: Partial<PlayerStats>): PlayerStats {
  const next = { ...base };
  (Object.keys(modifiers) as Array<keyof PlayerStats>).forEach((key) => {
    next[key] = clamp(next[key] + (modifiers[key] ?? 0), 5, 95);
  });
  next.challengeSkill = clamp(average([next.physical, next.endurance, next.puzzle, next.focus, next.pressure]));
  return next;
}

function randomStat(rng: RNG, center = 50, swing = 18): number {
  return clamp(Math.round(center + rng.centeredNoise(swing)), 10, 90);
}

function generateBlueprint(rng: RNG, index: number, usedNames: Set<string>): PlayerBlueprint {
  let name = NAME_POOL[index % NAME_POOL.length];
  if (usedNames.has(name)) {
    name = `${name} ${String.fromCharCode(65 + (index % 26))}`;
  }
  usedNames.add(name);
  const archetype = ARCHETYPES[index % ARCHETYPES.length];
  const base: PlayerStats = {
    strategic: randomStat(rng),
    loyalty: randomStat(rng),
    sociability: randomStat(rng),
    aggression: randomStat(rng),
    honesty: randomStat(rng),
    deception: randomStat(rng),
    manipulation: randomStat(rng),
    baselineTrust: randomStat(rng),
    socialAwareness: randomStat(rng),
    challengeSkill: randomStat(rng),
    endurance: randomStat(rng),
    popularity: randomStat(rng),
    perceivedThreat: randomStat(rng),
    impulsivity: randomStat(rng),
    memory: randomStat(rng),
    riskTolerance: randomStat(rng),
    physical: randomStat(rng),
    puzzle: randomStat(rng),
    focus: randomStat(rng),
    pressure: randomStat(rng),
  };

  return {
    id: `blueprint-${index}-${rng.int(1000, 9999)}`,
    name,
    identity: IDENTITIES[rng.int(0, IDENTITIES.length - 1)],
    archetype: archetype.name,
    avatar: AVATAR_SWATCHES[rng.int(0, AVATAR_SWATCHES.length - 1)],
    traits: applyModifiers(base, archetype.modifiers),
  };
}

export function createDefaultConfig(seed = Date.now() % 1000000): GameConfig {
  const rng = new RNG(seed);
  const usedNames = new Set<string>();
  const manualPlayers = Array.from({ length: 16 }, (_, index) => generateBlueprint(rng, index, usedNames));
  return {
    seasonName: "Survivor Simulator: Saison 1",
    mode: "observer",
    playerCount: 16,
    tribeCount: 2,
    mergeAt: 10,
    finalists: 3,
    jurySize: 7,
    seed,
    enabledAdvantages: { ...DEFAULT_ADVANTAGES },
    manualPlayers,
  };
}

export function syncManualPlayers(config: GameConfig): PlayerBlueprint[] {
  const rng = new RNG(config.seed);
  const usedNames = new Set<string>();
  const existing = config.manualPlayers.slice(0, config.playerCount).map((player, index) => {
    const next = {
      ...player,
      id: player.id || `blueprint-${index}`,
      name: player.name || NAME_POOL[index % NAME_POOL.length],
      identity: player.identity || IDENTITIES[index % IDENTITIES.length],
      archetype: player.archetype || ARCHETYPES[index % ARCHETYPES.length].name,
      avatar: player.avatar || AVATAR_SWATCHES[index % AVATAR_SWATCHES.length],
      traits: { ...DEFAULT_STATS, ...player.traits },
    };
    usedNames.add(next.name);
    return next;
  });
  while (existing.length < config.playerCount) {
    existing.push(generateBlueprint(rng, existing.length, usedNames));
  }
  return existing;
}

export function randomizeRoster(config: GameConfig): GameConfig {
  const rng = new RNG(config.seed);
  const usedNames = new Set<string>();
  return {
    ...config,
    manualPlayers: Array.from({ length: config.playerCount }, (_, index) => generateBlueprint(rng, index, usedNames)),
  };
}

function buildPlayers(config: GameConfig): Player[] {
  return syncManualPlayers(config).map((blueprint) => ({
    id: blueprint.id.replace("blueprint", "player"),
    name: blueprint.name,
    identity: blueprint.identity,
    archetype: blueprint.archetype,
    avatar: blueprint.avatar,
    traits: { ...blueprint.traits },
    tribeId: "",
    status: "active",
    fatigue: 0,
    challengeWins: 0,
    individualImmunityWins: 0,
    strategicMoves: 0,
    betrayalsCommitted: 0,
    idolFinds: 0,
    idolPlays: 0,
    receivedVotes: 0,
    survivedTribals: 0,
    socialCapital: 50,
    dangerLevel: 0,
    advantages: [],
  }));
}

function draftTribes(players: Player[], tribeCount: number): Tribe[] {
  const tribes: Tribe[] = Array.from({ length: tribeCount }, (_, index) => ({
    id: `tribe-${index + 1}`,
    name: STARTING_TRIBE_NAMES[index % STARTING_TRIBE_NAMES.length].name,
    color: STARTING_TRIBE_NAMES[index % STARTING_TRIBE_NAMES.length].color,
    merged: false,
    memberIds: [],
  }));

  const ordered = [...players].sort((a, b) => {
    const aPower = a.traits.challengeSkill + a.traits.strategic + a.traits.sociability;
    const bPower = b.traits.challengeSkill + b.traits.strategic + b.traits.sociability;
    return bPower - aPower;
  });

  ordered.forEach((player, index) => {
    const cycle = Math.floor(index / tribeCount);
    const slot = index % tribeCount;
    const tribeIndex = cycle % 2 === 0 ? slot : tribeCount - 1 - slot;
    tribes[tribeIndex].memberIds.push(player.id);
    player.tribeId = tribes[tribeIndex].id;
  });

  return tribes;
}

function compatibility(a: Player, b: Player): number {
  const socialBlend = 100 - Math.abs(a.traits.sociability - b.traits.sociability);
  const loyaltyBlend = 100 - Math.abs(a.traits.loyalty - b.traits.loyalty);
  const strategyBlend = 100 - Math.abs(a.traits.strategic - b.traits.strategic);
  const tempoBlend = 100 - Math.abs(a.traits.impulsivity - b.traits.impulsivity);
  return average([socialBlend, loyaltyBlend, strategyBlend, tempoBlend]);
}

function initialRelationship(from: Player, to: Player, rng: RNG): Relationship {
  const fit = compatibility(from, to);
  const trust = clamp((from.traits.baselineTrust * 0.45) + (to.traits.honesty * 0.25) + (fit * 0.2) - (to.traits.deception * 0.1) + rng.centeredNoise(12));
  const closeness = clamp((from.traits.sociability * 0.35) + (fit * 0.35) + (to.traits.sociability * 0.15) + rng.centeredNoise(14));
  const allianceScore = clamp((fit * 0.35) + (from.traits.strategic * 0.25) + (to.traits.loyalty * 0.15) + rng.centeredNoise(16));
  const suspicion = clamp((to.traits.deception * 0.35) + (to.traits.manipulation * 0.2) + (to.traits.perceivedThreat * 0.15) - (from.traits.baselineTrust * 0.2) + rng.centeredNoise(18));
  const admiration = clamp((to.traits.challengeSkill * 0.2) + (to.traits.popularity * 0.2) + (to.traits.strategic * 0.2) + rng.centeredNoise(14));
  const irritation = clamp((from.traits.aggression * 0.15) + (Math.abs(from.traits.honesty - to.traits.honesty) * 0.25) + rng.centeredNoise(16));
  const fear = clamp((to.traits.perceivedThreat * 0.35) + (to.traits.challengeSkill * 0.15) + (to.traits.strategic * 0.15) + rng.centeredNoise(12));
  const reliability = clamp((to.traits.loyalty * 0.35) + (to.traits.honesty * 0.25) - (to.traits.impulsivity * 0.15) + rng.centeredNoise(12));
  const strategicFit = clamp((fit * 0.45) + (from.traits.socialAwareness * 0.2) + rng.centeredNoise(10));

  return {
    fromId: from.id,
    toId: to.id,
    trust,
    closeness,
    allianceScore,
    suspicion,
    admiration,
    irritation,
    fear,
    moralDebt: 0,
    reliability,
    strategicFit,
    grievance: 0,
    sharedSecrets: 0,
    betrayalsRemembered: 0,
    lastMeaningfulEvent: "Premiere impression",
    lastUpdatedEpisode: 0,
  };
}

function seedAlliances(players: Player[], tribes: Tribe[], relationships: Record<string, Relationship>, rng: RNG): Alliance[] {
  const alliances: Alliance[] = [];

  tribes.forEach((tribe, tribeIndex) => {
    const tribePlayers = players.filter((player) => tribe.memberIds.includes(player.id));
    if (tribePlayers.length < 2) {
      return;
    }
    const sorted = [...tribePlayers].sort((a, b) => {
      const aBond = average(tribePlayers.filter((other) => other.id !== a.id).map((other) => relationships[relationshipKey(a.id, other.id)].trust));
      const bBond = average(tribePlayers.filter((other) => other.id !== b.id).map((other) => relationships[relationshipKey(b.id, other.id)].trust));
      return bBond - aBond;
    });
    const anchor = sorted[0];
    const allies = sorted
      .filter((player) => player.id !== anchor.id)
      .sort((a, b) => relationships[relationshipKey(anchor.id, b.id)].trust - relationships[relationshipKey(anchor.id, a.id)].trust)
      .slice(0, rng.bool(0.65) ? 2 : 1);
    const members = [anchor, ...allies].map((player) => player.id);
    alliances.push({
      id: `alliance-${tribeIndex + 1}`,
      name: `${tribe.name} ${rng.pick(["Noyau", "Pacte", "Sentinelles", "Canopy"])}`,
      members,
      coreMembers: members.slice(0, Math.min(2, members.length)),
      strength: clamp(55 + rng.centeredNoise(12)),
      trust: clamp(60 + rng.centeredNoise(10)),
      objective: rng.pick(ALLIANCE_OBJECTIVES),
      exposure: clamp(30 + rng.centeredNoise(12)),
      fractureRisk: clamp(25 + rng.centeredNoise(18)),
      secretive: rng.bool(0.7),
      narrative: "Le groupe se forme autour d'une compatibilite sociale et d'un besoin de securite precoce.",
      createdEpisode: 0,
      lastUpdatedEpisode: 0,
    });
  });

  return alliances;
}

export function buildGame(config: GameConfig): GameState {
  const normalized: GameConfig = {
    ...config,
    manualPlayers: syncManualPlayers(config),
    jurySize: Math.min(config.jurySize, config.playerCount - config.finalists - 1),
    mergeAt: Math.max(config.finalists + config.jurySize, Math.min(config.mergeAt, config.playerCount - 1)),
  };
  const rng = new RNG(normalized.seed);
  const players = buildPlayers(normalized);
  const tribes = draftTribes(players, normalized.tribeCount);
  const relationships: Record<string, Relationship> = {};
  players.forEach((from) => {
    players.forEach((to) => {
      if (from.id !== to.id) {
        relationships[relationshipKey(from.id, to.id)] = initialRelationship(from, to, rng);
      }
    });
  });
  const alliances = seedAlliances(players, tribes, relationships, rng);

  return {
    config: normalized,
    seed: normalized.seed,
    rngState: rng.getState(),
    episode: 0,
    day: 1,
    phase: "premerge",
    players,
    tribes,
    relationships,
    alliances,
    logs: [],
    episodes: [],
    juryIds: [],
    finalists: [],
  };
}

export function getMergeName(seed: number): string {
  const rng = new RNG(seed);
  return rng.pick(MERGE_TRIBE_NAMES);
}
