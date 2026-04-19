import type { AdvantageType, PlayerBlueprint, PlayerStats } from "../types";

export const STARTING_TRIBE_NAMES = [
  { name: "Tigre", color: "#e48a2f" },
  { name: "Liane", color: "#2f8f67" },
  { name: "Totem", color: "#8b5cf6" },
  { name: "Corail", color: "#0ea5e9" },
];

export const MERGE_TRIBE_NAMES = ["Aurore", "Silex", "Kohra", "Canopy", "Cendre"];

export const ALLIANCE_OBJECTIVES = [
  "tenir jusqu'a la fusion",
  "sortir une menace en douceur",
  "garder un bouclier devant soi",
  "controle discret des votes",
  "proteger un duo au centre",
  "casser la majorite adverse",
  "arriver ensemble au jury final",
];

export const IDENTITIES = ["F", "M", "Non-binaire"];

export const NAME_POOL = [
  "Alex", "Maya", "Nina", "Theo", "Lina", "Jules", "Emma", "Noa", "Sacha", "Ines",
  "Camille", "Leo", "Yanis", "Zoe", "Iris", "Milo", "Sarah", "Tom", "Louna", "Rayan",
  "Nora", "Victor", "Liam", "Elena", "Mael", "Aya", "Nathan", "Clara", "Kylian", "Anya",
  "Alicia", "Soren", "Nael", "Jade", "Mila", "Yuna", "Romy", "Sami", "Amir", "Eva",
];

export const AVATAR_SWATCHES = [
  "linear-gradient(135deg, #f59e0b, #ef4444)",
  "linear-gradient(135deg, #06b6d4, #0ea5e9)",
  "linear-gradient(135deg, #10b981, #22c55e)",
  "linear-gradient(135deg, #8b5cf6, #ec4899)",
  "linear-gradient(135deg, #f97316, #facc15)",
  "linear-gradient(135deg, #6366f1, #14b8a6)",
  "linear-gradient(135deg, #a855f7, #3b82f6)",
];

export interface ArchetypePreset {
  name: string;
  blurb: string;
  modifiers: Partial<PlayerStats>;
}

export const ARCHETYPES: ArchetypePreset[] = [
  {
    name: "Cerveau calculateur",
    blurb: "Observe, collecte l'information et pousse des plans complexes sans toujours assumer publiquement.",
    modifiers: { strategic: 24, socialAwareness: 18, manipulation: 16, deception: 12, loyalty: -12, honesty: -10, perceivedThreat: 10 },
  },
  {
    name: "Papillon social",
    blurb: "Cree du lien partout, rassure les gens et se retrouve souvent au centre des informations.",
    modifiers: { sociability: 22, popularity: 20, baselineTrust: 15, honesty: 8, aggression: -10, challengeSkill: -4 },
  },
  {
    name: "Loyaliste protecteur",
    blurb: "S'accroche fort a ses allies, pardonne difficilement et prefere une strategie stable.",
    modifiers: { loyalty: 24, honesty: 15, baselineTrust: 12, aggression: -8, riskTolerance: -10, memory: 10 },
  },
  {
    name: "Predateur strategique",
    blurb: "Joue vite, fort et coupe les liens si cela augmente son controle du vote.",
    modifiers: { strategic: 18, aggression: 20, manipulation: 10, riskTolerance: 12, honesty: -15, loyalty: -14, perceivedThreat: 14 },
  },
  {
    name: "Bete de defis",
    blurb: "Brille en immunite, inspire autant l'admiration que la peur d'une menace de fin de jeu.",
    modifiers: { challengeSkill: 20, physical: 22, endurance: 18, pressure: 12, popularity: 8, perceivedThreat: 22, strategic: -6 },
  },
  {
    name: "Camaleon discret",
    blurb: "N'apparait pas comme leader mais glisse entre les groupes et survit par adaptation.",
    modifiers: { socialAwareness: 14, deception: 10, manipulation: 8, perceivedThreat: -12, challengeSkill: -6, baselineTrust: 6 },
  },
  {
    name: "Agent du chaos",
    blurb: "Emotif, brillant par moments, capable de moves enormes puis d'erreurs destructrices.",
    modifiers: { aggression: 16, impulsivity: 24, riskTolerance: 18, strategic: 10, loyalty: -8, honesty: -4, pressure: -10 },
  },
  {
    name: "Underdog resilient",
    blurb: "Commence souvent en marge puis construit des relations de confiance sur la duree.",
    modifiers: { endurance: 14, loyalty: 10, popularity: 8, memory: 8, perceivedThreat: -8, physical: 6 },
  },
];

export const ADVANTAGE_DESCRIPTIONS: Record<AdvantageType, string> = {
  hidden_immunity_idol: "Annule tous les votes contre son porteur, sauf si elle est neutralisee.",
  extra_vote: "Permet de deposer un bulletin supplementaire lors d'un conseil.",
  steal_a_vote: "Retire le vote d'un adversaire et l'ajoute a votre camp.",
  vote_block: "Empeche un joueur cible de voter a ce conseil.",
  safety_without_power: "Quitte le conseil avant le vote et reste intouchable, mais ne vote pas.",
  idol_nullifier: "Neutralise une idole jouee sur une cible soupconnee.",
};

export const DEFAULT_STATS: PlayerStats = {
  strategic: 50,
  loyalty: 50,
  sociability: 50,
  aggression: 50,
  honesty: 50,
  deception: 50,
  manipulation: 50,
  baselineTrust: 50,
  socialAwareness: 50,
  challengeSkill: 50,
  endurance: 50,
  popularity: 50,
  perceivedThreat: 50,
  impulsivity: 50,
  memory: 50,
  riskTolerance: 50,
  physical: 50,
  puzzle: 50,
  focus: 50,
  pressure: 50,
};

export const DEFAULT_ADVANTAGES: Record<AdvantageType, boolean> = {
  hidden_immunity_idol: true,
  extra_vote: true,
  steal_a_vote: true,
  vote_block: true,
  safety_without_power: true,
  idol_nullifier: true,
};

export function emptyBlueprint(index: number): PlayerBlueprint {
  return {
    id: `blueprint-${index}`,
    name: NAME_POOL[index % NAME_POOL.length],
    identity: IDENTITIES[index % IDENTITIES.length],
    archetype: ARCHETYPES[index % ARCHETYPES.length].name,
    avatar: AVATAR_SWATCHES[index % AVATAR_SWATCHES.length],
    traits: { ...DEFAULT_STATS },
  };
}
