export type GameMode = "auto" | "observer" | "custom";
export type SeasonPhase = "premerge" | "merge" | "final" | "complete";
export type EventCategory =
  | "system"
  | "social"
  | "alliance"
  | "challenge"
  | "tribal"
  | "advantage"
  | "merge"
  | "jury";

export type AdvantageType =
  | "hidden_immunity_idol"
  | "extra_vote"
  | "steal_a_vote"
  | "vote_block"
  | "safety_without_power"
  | "idol_nullifier";

export interface PlayerStats {
  strategic: number;
  loyalty: number;
  sociability: number;
  aggression: number;
  honesty: number;
  deception: number;
  manipulation: number;
  baselineTrust: number;
  socialAwareness: number;
  challengeSkill: number;
  endurance: number;
  popularity: number;
  perceivedThreat: number;
  impulsivity: number;
  memory: number;
  riskTolerance: number;
  physical: number;
  puzzle: number;
  focus: number;
  pressure: number;
}

export interface PlayerBlueprint {
  id: string;
  name: string;
  identity: string;
  archetype: string;
  avatar: string;
  traits: PlayerStats;
}

export interface Advantage {
  id: string;
  type: AdvantageType;
  label: string;
  description: string;
  holderId: string;
  knownBy: string[];
  active: boolean;
  expiresAtEpisode?: number;
}

export interface Player {
  id: string;
  name: string;
  identity: string;
  archetype: string;
  avatar: string;
  traits: PlayerStats;
  tribeId: string;
  status: "active" | "eliminated" | "jury" | "finalist" | "winner";
  fatigue: number;
  challengeWins: number;
  individualImmunityWins: number;
  strategicMoves: number;
  betrayalsCommitted: number;
  idolFinds: number;
  idolPlays: number;
  receivedVotes: number;
  survivedTribals: number;
  socialCapital: number;
  dangerLevel: number;
  advantages: Advantage[];
  eliminationEpisode?: number;
  placement?: number;
}

export interface Relationship {
  fromId: string;
  toId: string;
  trust: number;
  closeness: number;
  allianceScore: number;
  suspicion: number;
  admiration: number;
  irritation: number;
  fear: number;
  moralDebt: number;
  reliability: number;
  strategicFit: number;
  grievance: number;
  sharedSecrets: number;
  betrayalsRemembered: number;
  lastMeaningfulEvent: string;
  lastUpdatedEpisode: number;
}

export interface Alliance {
  id: string;
  name: string;
  members: string[];
  coreMembers: string[];
  strength: number;
  trust: number;
  objective: string;
  exposure: number;
  fractureRisk: number;
  secretive: boolean;
  narrative: string;
  createdEpisode: number;
  lastUpdatedEpisode: number;
}

export interface Tribe {
  id: string;
  name: string;
  color: string;
  merged: boolean;
  memberIds: string[];
}

export interface EventLog {
  id: string;
  episode: number;
  day: number;
  category: EventCategory;
  title: string;
  description: string;
  actors: string[];
  tribeId?: string;
  visibility: "private" | "tribe" | "public";
}

export interface VoteBallot {
  voterId: string;
  targetId: string;
  reason: string;
  weight: number;
  voided?: boolean;
}

export interface TribalCouncilRecord {
  episode: number;
  tribeId: string;
  tribeName: string;
  immuneIds: string[];
  safeWithoutPowerIds: string[];
  blockedVoters: string[];
  stolenVotes: string[];
  idolPlays: string[];
  nullifierPlays: string[];
  votes: VoteBallot[];
  revote?: VoteBallot[];
  tieTargets?: string[];
  eliminatedId: string;
  eliminatedName: string;
  notes: string[];
}

export interface ChallengeResult {
  episode: number;
  type: "team_reward" | "team_immunity" | "individual_immunity";
  winners: string[];
  losers: string[];
  summary: string;
}

export interface EpisodeSummary {
  episode: number;
  title: string;
  dayStart: number;
  dayEnd: number;
  events: string[];
  challenge?: ChallengeResult;
  tribal?: TribalCouncilRecord;
}

export interface GameConfig {
  seasonName: string;
  mode: GameMode;
  playerCount: number;
  tribeCount: number;
  mergeAt: number;
  finalists: number;
  jurySize: number;
  seed: number;
  enabledAdvantages: Record<AdvantageType, boolean>;
  manualPlayers: PlayerBlueprint[];
}

export interface GameState {
  config: GameConfig;
  seed: number;
  rngState: number;
  episode: number;
  day: number;
  phase: SeasonPhase;
  players: Player[];
  tribes: Tribe[];
  relationships: Record<string, Relationship>;
  alliances: Alliance[];
  logs: EventLog[];
  episodes: EpisodeSummary[];
  juryIds: string[];
  finalists: string[];
  winnerId?: string;
  lastTribal?: TribalCouncilRecord;
}

export const TRAIT_KEYS: Array<keyof PlayerStats> = [
  "strategic",
  "loyalty",
  "sociability",
  "aggression",
  "honesty",
  "deception",
  "manipulation",
  "baselineTrust",
  "socialAwareness",
  "challengeSkill",
  "endurance",
  "popularity",
  "perceivedThreat",
  "impulsivity",
  "memory",
  "riskTolerance",
  "physical",
  "puzzle",
  "focus",
  "pressure",
];

export const TRAIT_LABELS: Record<keyof PlayerStats, string> = {
  strategic: "Vision strategique",
  loyalty: "Loyaute",
  sociability: "Sociabilite",
  aggression: "Agressivite strategique",
  honesty: "Honnetete",
  deception: "Capacite a mentir",
  manipulation: "Manipulation",
  baselineTrust: "Confiance de base",
  socialAwareness: "Perception sociale",
  challengeSkill: "Niveau en defis",
  endurance: "Endurance",
  popularity: "Popularite",
  perceivedThreat: "Menace percue",
  impulsivity: "Impulsivite",
  memory: "Memoire",
  riskTolerance: "Tolerance au risque",
  physical: "Physique",
  puzzle: "Logique / puzzle",
  focus: "Concentration",
  pressure: "Gestion de la pression",
};

export const TRAIT_GROUPS: Array<{ label: string; keys: Array<keyof PlayerStats> }> = [
  {
    label: "Social et psychologie",
    keys: ["sociability", "baselineTrust", "socialAwareness", "popularity", "honesty", "memory"],
  },
  {
    label: "Strategie et jeu politique",
    keys: ["strategic", "loyalty", "aggression", "deception", "manipulation", "riskTolerance", "impulsivity"],
  },
  {
    label: "Defis et pression",
    keys: ["challengeSkill", "physical", "endurance", "puzzle", "focus", "pressure", "perceivedThreat"],
  },
];

export const ADVANTAGE_LABELS: Record<AdvantageType, string> = {
  hidden_immunity_idol: "Idole d'immunite cachee",
  extra_vote: "Vote supplementaire",
  steal_a_vote: "Steal a vote",
  vote_block: "Vote block",
  safety_without_power: "Safety without power",
  idol_nullifier: "Idol nullifier",
};
