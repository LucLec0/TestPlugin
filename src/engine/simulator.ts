import { ADVANTAGE_DESCRIPTIONS, ALLIANCE_OBJECTIVES } from "../data/presets";
import { getMergeName } from "./generator";
import { average, clamp, RNG } from "./random";
import type {
  Advantage,
  AdvantageType,
  Alliance,
  ChallengeResult,
  EpisodeSummary,
  EventCategory,
  EventLog,
  GameState,
  Player,
  Relationship,
  TribalCouncilRecord,
  Tribe,
  VoteBallot,
} from "../types";

interface VotePlan {
  allianceId: string;
  memberIds: string[];
  targetId: string;
  altTargetId?: string;
  confidence: number;
  splitVote: boolean;
}

function relationshipKey(fromId: string, toId: string): string {
  return `${fromId}->${toId}`;
}

function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

function getPlayer(state: GameState, playerId: string): Player {
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) {
    throw new Error(`Unknown player: ${playerId}`);
  }
  return player;
}

function getRelationship(state: GameState, fromId: string, toId: string): Relationship {
  const relationship = state.relationships[relationshipKey(fromId, toId)];
  if (!relationship) {
    throw new Error(`Missing relationship: ${fromId} -> ${toId}`);
  }
  return relationship;
}

function activePlayers(state: GameState): Player[] {
  return state.players.filter((player) => player.status === "active");
}

function activeMembersOfTribe(state: GameState, tribeId: string): Player[] {
  return activePlayers(state).filter((player) => player.tribeId === tribeId);
}

function currentTribe(state: GameState): Tribe {
  const tribe = state.tribes.find((entry) => entry.merged) ?? state.tribes[0];
  if (!tribe) {
    throw new Error("No tribe available");
  }
  return tribe;
}

function addLog(
  state: GameState,
  category: EventCategory,
  title: string,
  description: string,
  actors: string[],
  visibility: EventLog["visibility"],
  tribeId?: string,
): void {
  state.logs.push({
    id: `log-${state.episode}-${state.logs.length + 1}`,
    episode: state.episode,
    day: state.day,
    category,
    title,
    description,
    actors,
    tribeId,
    visibility,
  });
}

function note(summary: EpisodeSummary, text: string): void {
  summary.events.push(text);
}

function modifyRelationship(
  state: GameState,
  fromId: string,
  toId: string,
  deltas: Partial<Record<keyof Relationship, number>>,
  lastMeaningfulEvent: string,
): void {
  const relationship = getRelationship(state, fromId, toId);
  (Object.entries(deltas) as Array<[keyof Relationship, number]>).forEach(([key, value]) => {
    if (typeof relationship[key] === "number") {
      const nextValue = Number(relationship[key]) + value;
      relationship[key] = clamp(nextValue) as Relationship[keyof Relationship];
    }
  });
  relationship.lastMeaningfulEvent = lastMeaningfulEvent;
  relationship.lastUpdatedEpisode = state.episode;
}

function setSocialCapital(state: GameState, playerId: string): void {
  const incoming = activePlayers(state)
    .filter((other) => other.id !== playerId)
    .map((other) => {
      const relationship = getRelationship(state, other.id, playerId);
      return relationship.trust * 0.35 + relationship.closeness * 0.35 + relationship.admiration * 0.15 - relationship.suspicion * 0.15;
    });
  getPlayer(state, playerId).socialCapital = clamp(average(incoming));
}

function refreshSocialCapital(state: GameState): void {
  activePlayers(state).forEach((player) => setSocialCapital(state, player.id));
}

function activeAlliancesInGroup(state: GameState, memberIds: string[]): Alliance[] {
  const memberSet = new Set(memberIds);
  return state.alliances
    .map((alliance) => ({
      ...alliance,
      members: alliance.members.filter((memberId) => memberSet.has(memberId) && getPlayer(state, memberId).status === "active"),
      coreMembers: alliance.coreMembers.filter((memberId) => memberSet.has(memberId) && getPlayer(state, memberId).status === "active"),
    }))
    .filter((alliance) => alliance.members.length >= 2);
}

function sharedAllianceCount(state: GameState, aId: string, bId: string): number {
  return state.alliances.filter((alliance) => alliance.members.includes(aId) && alliance.members.includes(bId)).length;
}

function haveAlliance(state: GameState, aId: string, bId: string): boolean {
  return sharedAllianceCount(state, aId, bId) > 0;
}

function refreshAlliances(state: GameState): void {
  state.alliances = state.alliances
    .map((alliance) => {
      const members = alliance.members.filter((memberId) => getPlayer(state, memberId).status === "active");
      if (members.length < 2) {
        return undefined;
      }
      const pairTrust: number[] = [];
      const pairSuspicion: number[] = [];
      members.forEach((memberId, index) => {
        members.slice(index + 1).forEach((otherId) => {
          pairTrust.push((getRelationship(state, memberId, otherId).trust + getRelationship(state, otherId, memberId).trust) / 2);
          pairSuspicion.push((getRelationship(state, memberId, otherId).suspicion + getRelationship(state, otherId, memberId).suspicion) / 2);
        });
      });
      return {
        ...alliance,
        members,
        coreMembers: alliance.coreMembers.filter((memberId) => members.includes(memberId)).slice(0, Math.min(2, members.length)),
        strength: clamp(average(pairTrust) * 0.7 + members.length * 6 - average(pairSuspicion) * 0.2),
        trust: clamp(average(pairTrust)),
        fractureRisk: clamp(average(pairSuspicion) * 0.55 + members.reduce((sum, memberId) => sum + getPlayer(state, memberId).traits.impulsivity, 0) / members.length * 0.2),
        exposure: clamp(members.length * 13 + members.reduce((sum, memberId) => sum + getPlayer(state, memberId).traits.popularity, 0) / members.length * 0.2),
        lastUpdatedEpisode: state.episode,
      };
    })
    .filter((alliance): alliance is Alliance => Boolean(alliance) && alliance.strength >= 15);
}

function forgeAlliance(state: GameState, memberIds: string[], rng: RNG, summary: EpisodeSummary, tribeId?: string): void {
  const activeMemberIds = [...new Set(memberIds)].filter((memberId) => getPlayer(state, memberId).status === "active");
  if (activeMemberIds.length < 2) {
    return;
  }
  const existing = state.alliances.find((alliance) => activeMemberIds.every((memberId) => alliance.members.includes(memberId)));
  const names = activeMemberIds.map((memberId) => getPlayer(state, memberId).name);
  if (existing) {
    existing.strength = clamp(existing.strength + rng.float(5, 11));
    existing.trust = clamp(existing.trust + rng.float(3, 9));
    existing.fractureRisk = clamp(existing.fractureRisk - rng.float(3, 8));
    existing.lastUpdatedEpisode = state.episode;
    addLog(state, "alliance", "Alliance renforcee", `${names.join(", ")} recollent les morceaux et verrouillent un plan commun.`, activeMemberIds, "tribe", tribeId);
    note(summary, `${names.join(" / ")} renforcent une alliance deja existante.`);
    return;
  }

  const alliance: Alliance = {
    id: `alliance-${state.episode}-${state.alliances.length + 1}`,
    name: `Pacte ${names.map((name) => name.slice(0, 2).toUpperCase()).join("")}`,
    members: activeMemberIds,
    coreMembers: activeMemberIds.slice(0, Math.min(2, activeMemberIds.length)),
    strength: clamp(52 + rng.centeredNoise(10)),
    trust: clamp(58 + rng.centeredNoise(10)),
    objective: rng.pick(ALLIANCE_OBJECTIVES),
    exposure: clamp(20 + activeMemberIds.length * 9 + rng.centeredNoise(8)),
    fractureRisk: clamp(24 + rng.centeredNoise(12)),
    secretive: rng.bool(0.68),
    narrative: "Alliance nee d'une combinaison de confort social et d'interets strategiques convergents.",
    createdEpisode: state.episode,
    lastUpdatedEpisode: state.episode,
  };
  state.alliances.push(alliance);
  addLog(state, "alliance", "Nouvelle alliance", `${names.join(", ")} concluent un accord: ${alliance.objective}.`, activeMemberIds, "tribe", tribeId);
  note(summary, `${names.join(" / ")} montent une nouvelle alliance.`);
}

function chooseTargetByInstinct(state: GameState, actor: Player, options: Player[]): Player {
  return [...options].sort((a, b) => {
    const aRel = getRelationship(state, actor.id, a.id);
    const bRel = getRelationship(state, actor.id, b.id);
    const aScore = a.traits.perceivedThreat * 0.25 + a.traits.strategic * 0.2 + aRel.suspicion * 0.2 + aRel.irritation * 0.12 - aRel.trust * 0.18;
    const bScore = b.traits.perceivedThreat * 0.25 + b.traits.strategic * 0.2 + bRel.suspicion * 0.2 + bRel.irritation * 0.12 - bRel.trust * 0.18;
    return bScore - aScore;
  })[0];
}

function runSocialRound(state: GameState, rng: RNG, summary: EpisodeSummary): void {
  const groups = state.phase === "premerge" ? state.tribes.map((tribe) => activeMembersOfTribe(state, tribe.id)).filter((group) => group.length >= 3) : [activePlayers(state)];

  groups.forEach((group) => {
    const tribeId = group[0]?.tribeId;
    const interactions = Math.max(4, Math.ceil(group.length * 1.4));
    for (let index = 0; index < interactions; index += 1) {
      const actor = rng.weightedPick(group, (player) => player.traits.sociability + player.traits.strategic + 15);
      const partners = group.filter((player) => player.id !== actor.id);
      if (partners.length === 0) {
        continue;
      }
      const partner = rng.weightedPick(partners, (player) => {
        const relationship = getRelationship(state, actor.id, player.id);
        return relationship.closeness + relationship.strategicFit + (100 - relationship.suspicion) * 0.4 + 20;
      });
      const actorView = getRelationship(state, actor.id, partner.id);
      const actionRoll = rng.next();

      if (actionRoll < 0.24) {
        modifyRelationship(state, actor.id, partner.id, { trust: rng.float(5, 11), closeness: rng.float(6, 12), suspicion: -rng.float(2, 6) }, "Moment de connexion");
        modifyRelationship(state, partner.id, actor.id, { trust: rng.float(4, 9), closeness: rng.float(5, 10), irritation: -rng.float(1, 4) }, "Moment de connexion");
        addLog(state, "social", "Connexion sociale", `${actor.name} et ${partner.name} passent du temps ensemble et se comprennent mieux.`, [actor.id, partner.id], "tribe", tribeId);
        note(summary, `${actor.name} et ${partner.name} renforcent leur lien social.`);
      } else if (actionRoll < 0.46) {
        const thirdOption = partners.filter((player) => player.id !== partner.id).sort((a, b) => {
          const aFit = getRelationship(state, actor.id, a.id).strategicFit + getRelationship(state, partner.id, a.id).strategicFit;
          const bFit = getRelationship(state, actor.id, b.id).strategicFit + getRelationship(state, partner.id, b.id).strategicFit;
          return bFit - aFit;
        })[0];
        const memberIds = [actor.id, partner.id];
        if (thirdOption && actorView.trust + actorView.strategicFit > 125 && rng.bool(0.35)) {
          memberIds.push(thirdOption.id);
        }
        forgeAlliance(state, memberIds, rng, summary, tribeId);
        memberIds.forEach((sourceId) => {
          memberIds.forEach((targetId) => {
            if (sourceId !== targetId) {
              modifyRelationship(state, sourceId, targetId, { allianceScore: rng.float(6, 12), trust: rng.float(3, 7), sharedSecrets: rng.float(2, 5) }, "Pacte strategique");
            }
          });
        });
      } else if (actionRoll < 0.68) {
        const targets = group.filter((player) => player.id !== actor.id && player.id !== partner.id);
        if (targets.length === 0) {
          continue;
        }
        const target = chooseTargetByInstinct(state, actor, targets);
        const success = actor.traits.manipulation * 0.45 + actor.traits.socialAwareness * 0.25 + actorView.trust * 0.3 + rng.centeredNoise(18) > 60;
        if (success) {
          modifyRelationship(state, partner.id, target.id, { suspicion: rng.float(7, 15), irritation: rng.float(4, 10), fear: rng.float(3, 8) }, "Campagne strategique recue");
          modifyRelationship(state, partner.id, actor.id, { trust: rng.float(1, 4) }, "Campagne strategique recue");
          addLog(state, "social", "Campagne anti-cible", `${actor.name} glisse a ${partner.name} que ${target.name} devient dangereux pour la suite.`, [actor.id, partner.id, target.id], "tribe", tribeId);
          note(summary, `${actor.name} pousse subtilement ${target.name} comme cible potentielle.`);
        } else {
          modifyRelationship(state, partner.id, actor.id, { trust: -rng.float(5, 12), suspicion: rng.float(5, 11) }, "Pitch suspect");
          addLog(state, "social", "Pitch maladroit", `${actor.name} tente d'orienter ${partner.name}, mais le discours sonne force.`, [actor.id, partner.id, target.id], "tribe", tribeId);
        }
      } else if (actionRoll < 0.83) {
        const success = actor.traits.deception * 0.35 + actor.traits.manipulation * 0.25 + actorView.trust * 0.2 + rng.centeredNoise(20) > 55;
        if (success) {
          modifyRelationship(state, partner.id, actor.id, { trust: rng.float(2, 6), suspicion: -rng.float(2, 5) }, "Mensonge convaincant");
          modifyRelationship(state, actor.id, partner.id, { closeness: rng.float(1, 4) }, "Mensonge convaincant");
          addLog(state, "social", "Mensonge credible", `${actor.name} rassure ${partner.name} avec un discours ambigu mais efficace.`, [actor.id, partner.id], "private", tribeId);
          note(summary, `${actor.name} reussit a calmer temporairement les soupcons autour de lui.`);
        } else {
          modifyRelationship(state, partner.id, actor.id, { trust: -rng.float(7, 14), suspicion: rng.float(8, 16), irritation: rng.float(4, 9) }, "Mensonge detecte");
          addLog(state, "social", "Mensonge detecte", `${partner.name} sent que ${actor.name} n'est pas completement franc.`, [actor.id, partner.id], "tribe", tribeId);
          note(summary, `${partner.name} devient plus mefiant envers ${actor.name}.`);
        }
      } else {
        modifyRelationship(state, actor.id, partner.id, { trust: rng.float(4, 8), suspicion: -rng.float(4, 8), closeness: rng.float(3, 7) }, "Reassurance");
        modifyRelationship(state, partner.id, actor.id, { trust: rng.float(4, 8), suspicion: -rng.float(3, 6) }, "Reassurance");
        addLog(state, "social", "Reassurance", `${actor.name} rassure ${partner.name} sur la solidite de leur lien.`, [actor.id, partner.id], "tribe", tribeId);
      }
    }
  });

  refreshAlliances(state);
  refreshSocialCapital(state);
}

function chooseAdvantageType(state: GameState, rng: RNG): AdvantageType | undefined {
  const enabled = (Object.entries(state.config.enabledAdvantages) as Array<[AdvantageType, boolean]>)
    .filter(([, enabledFlag]) => enabledFlag)
    .map(([type]) => type);
  if (enabled.length === 0) {
    return undefined;
  }
  return rng.weightedPick(enabled, (type) => {
    switch (type) {
      case "hidden_immunity_idol":
        return 4;
      case "extra_vote":
        return 2.4;
      case "vote_block":
      case "steal_a_vote":
        return 1.8;
      case "safety_without_power":
      case "idol_nullifier":
        return 1.2;
      default:
        return 1;
    }
  });
}

function countActiveAdvantages(state: GameState, type: AdvantageType): number {
  return state.players.flatMap((player) => player.advantages).filter((advantage) => advantage.active && advantage.type === type).length;
}

function runAdvantageSearch(state: GameState, rng: RNG, summary: EpisodeSummary): void {
  const camps = state.phase === "premerge" ? state.tribes.map((tribe) => activeMembersOfTribe(state, tribe.id)).filter((group) => group.length > 0) : [activePlayers(state)];
  camps.forEach((group) => {
    const searcher = rng.weightedPick(group, (player) => player.traits.riskTolerance + player.traits.focus + player.traits.strategic + (100 - player.traits.popularity) * 0.5 + 20);
    const searchChance = 0.08 + searcher.traits.riskTolerance / 500 + searcher.traits.focus / 600;
    if (!rng.bool(searchChance)) {
      return;
    }
    const advantageType = chooseAdvantageType(state, rng);
    if (!advantageType) {
      return;
    }
    if (advantageType === "hidden_immunity_idol" && countActiveAdvantages(state, advantageType) >= 2) {
      return;
    }
    const player = getPlayer(state, searcher.id);
    const advantage: Advantage = {
      id: `adv-${state.episode}-${player.id}-${player.advantages.length + 1}`,
      type: advantageType,
      label: advantageType.replaceAll("_", " "),
      description: ADVANTAGE_DESCRIPTIONS[advantageType],
      holderId: player.id,
      knownBy: [player.id],
      active: true,
    };
    player.advantages.push(advantage);
    player.idolFinds += 1;
    addLog(state, "advantage", "Avantage trouve", `${player.name} trouve ${advantage.description.toLowerCase()}`, [player.id], "private", player.tribeId);
    note(summary, `${player.name} trouve un avantage cache (${advantage.label}).`);
  });
}

function challengeScore(player: Player, rng: RNG): number {
  return (
    player.traits.challengeSkill * 0.22 +
    player.traits.physical * 0.2 +
    player.traits.endurance * 0.18 +
    player.traits.puzzle * 0.16 +
    player.traits.focus * 0.14 +
    player.traits.pressure * 0.1 -
    player.fatigue * 0.45 +
    rng.centeredNoise(12)
  );
}

function resolveChallenge(state: GameState, rng: RNG, summary: EpisodeSummary): ChallengeResult {
  if (state.phase === "premerge") {
    const tribeScores = state.tribes
      .map((tribe) => ({
        tribe,
        members: activeMembersOfTribe(state, tribe.id),
      }))
      .filter((entry) => entry.members.length > 0)
      .map((entry) => ({
        ...entry,
        score: average(entry.members.map((member) => challengeScore(member, rng))),
      }));

    const sorted = [...tribeScores].sort((a, b) => b.score - a.score);
    const winningTribes = sorted.slice(0, Math.max(1, sorted.length - 1)).map((entry) => entry.tribe.id);
    const losingTribe = sorted[sorted.length - 1];

    tribeScores.forEach((entry) => {
      entry.members.forEach((member) => {
        member.fatigue = clamp(member.fatigue + rng.float(4, 10));
      });
    });
    sorted[0].members.forEach((member) => {
      member.challengeWins += 1;
    });

    const challenge: ChallengeResult = {
      episode: state.episode,
      type: "team_immunity",
      winners: winningTribes,
      losers: [losingTribe.tribe.id],
      summary: `${sorted[0].tribe.name} gagne l'immunite tandis que ${losingTribe.tribe.name} file au conseil tribal.`,
    };
    addLog(state, "challenge", "Defi d'immunite", challenge.summary, losingTribe.members.map((member) => member.id), "public", losingTribe.tribe.id);
    note(summary, challenge.summary);
    return challenge;
  }

  const members = activePlayers(state);
  const ranked = members
    .map((player) => ({ player, score: challengeScore(player, rng) + player.traits.pressure * 0.15 }))
    .sort((a, b) => b.score - a.score);
  const winner = ranked[0].player;
  winner.challengeWins += 1;
  winner.individualImmunityWins += 1;
  members.forEach((player) => {
    player.fatigue = clamp(player.fatigue + rng.float(3, 8));
    if (player.id !== winner.id) {
      modifyRelationship(state, player.id, winner.id, { admiration: rng.float(2, 7), fear: rng.float(2, 6) }, "Immunite impressionnante");
    }
  });

  const challenge: ChallengeResult = {
    episode: state.episode,
    type: "individual_immunity",
    winners: [winner.id],
    losers: [currentTribe(state).id],
    summary: `${winner.name} remporte l'immunite individuelle et force tout le monde a reevaluer les plans.`,
  };
  addLog(state, "challenge", "Immunite individuelle", challenge.summary, [winner.id], "public", winner.tribeId);
  note(summary, challenge.summary);
  return challenge;
}

function personalTargetScore(state: GameState, voter: Player, target: Player, immuneIds: Set<string>, rng?: RNG): number {
  if (voter.id === target.id || immuneIds.has(target.id)) {
    return -999;
  }
  const relationship = getRelationship(state, voter.id, target.id);
  const sharedAlliances = sharedAllianceCount(state, voter.id, target.id);
  const threat = target.traits.perceivedThreat * 0.18 + target.traits.strategic * 0.16 + target.traits.challengeSkill * 0.08 + target.challengeWins * 4 + target.individualImmunityWins * 5 + target.socialCapital * 0.12;
  const negativeHistory = relationship.suspicion * 0.24 + relationship.irritation * 0.2 + relationship.fear * 0.16 + relationship.grievance * 0.25 + relationship.betrayalsRemembered * 8;
  const juryConcern = state.phase === "merge" ? target.traits.popularity * 0.12 : 0;
  const outsiderPressure = sharedAlliances === 0 ? 12 : -sharedAlliances * 10;
  const bond = relationship.trust * 0.22 + relationship.closeness * 0.18 + relationship.allianceScore * 0.2 + relationship.moralDebt * 0.12;
  const moodNoise = rng ? rng.centeredNoise(10 + voter.traits.impulsivity * 0.06) : 0;
  return threat + negativeHistory + juryConcern + outsiderPressure - bond + moodNoise;
}

function buildVotePlans(state: GameState, group: Player[], immuneIds: Set<string>, rng: RNG): VotePlan[] {
  const groupIds = group.map((player) => player.id);
  return activeAlliancesInGroup(state, groupIds)
    .filter((alliance) => alliance.members.length >= 2)
    .map((alliance) => {
      const outsiders = group.filter((player) => !alliance.members.includes(player.id) && !immuneIds.has(player.id));
      if (outsiders.length === 0) {
        return undefined;
      }
      const target = outsiders
        .map((candidate) => ({
          candidate,
          score: average(alliance.members.map((memberId) => personalTargetScore(state, getPlayer(state, memberId), candidate, immuneIds))),
        }))
        .sort((a, b) => b.score - a.score)[0]?.candidate;
      if (!target) {
        return undefined;
      }
      const altTarget = outsiders.filter((player) => player.id !== target.id).sort((a, b) => {
        const aScore = average(alliance.members.map((memberId) => personalTargetScore(state, getPlayer(state, memberId), a, immuneIds)));
        const bScore = average(alliance.members.map((memberId) => personalTargetScore(state, getPlayer(state, memberId), b, immuneIds)));
        return bScore - aScore;
      })[0];
      const idolConcern = target.traits.riskTolerance * 0.22 + target.traits.focus * 0.15 + target.idolFinds * 18 + rng.centeredNoise(8);
      return {
        allianceId: alliance.id,
        memberIds: alliance.members,
        targetId: target.id,
        altTargetId: altTarget?.id,
        confidence: clamp(alliance.strength * 0.45 + alliance.trust * 0.35 - alliance.fractureRisk * 0.2),
        splitVote: Boolean(altTarget && alliance.members.length >= 4 && idolConcern > 56),
      } satisfies VotePlan;
    })
    .filter((plan): plan is VotePlan => Boolean(plan))
    .sort((a, b) => b.memberIds.length * b.confidence - a.memberIds.length * a.confidence);
}

function predictDanger(state: GameState, group: Player[], immuneIds: Set<string>): Record<string, number> {
  const danger: Record<string, number> = {};
  group.forEach((candidate) => {
    const scores = group.filter((voter) => voter.id !== candidate.id).map((voter) => personalTargetScore(state, voter, candidate, immuneIds));
    danger[candidate.id] = clamp(average(scores));
    candidate.dangerLevel = danger[candidate.id];
  });
  return danger;
}

function consumeAdvantage(player: Player, advantageId: string): void {
  const advantage = player.advantages.find((entry) => entry.id === advantageId);
  if (advantage) {
    advantage.active = false;
  }
}

function strongestOpponent(state: GameState, holder: Player, group: Player[], immuneIds: Set<string>): Player | undefined {
  return group
    .filter((player) => player.id !== holder.id && !immuneIds.has(player.id) && !haveAlliance(state, player.id, holder.id))
    .sort((a, b) => personalTargetScore(state, holder, b, immuneIds) - personalTargetScore(state, holder, a, immuneIds))[0];
}

function chooseVoteTarget(
  state: GameState,
  voter: Player,
  candidates: Player[],
  immuneIds: Set<string>,
  plans: VotePlan[],
  dangerMap: Record<string, number>,
  rng: RNG,
): { targetId: string; reason: string } {
  const scored = candidates
    .map((candidate) => ({ candidate, score: personalTargetScore(state, voter, candidate, immuneIds, rng) }))
    .sort((a, b) => b.score - a.score);
  const bestPersonal = scored[0];
  const plan = plans.find((entry) => entry.memberIds.includes(voter.id) && candidates.some((candidate) => candidate.id === entry.targetId));
  const fearOfMinority = voter.traits.strategic * 0.16 + voter.traits.socialAwareness * 0.14 + voter.traits.loyalty * 0.08;

  if (plan) {
    const plannedTarget = candidates.find((candidate) => candidate.id === plan.targetId);
    if (plannedTarget) {
      const planScore = personalTargetScore(state, voter, plannedTarget, immuneIds, rng) + plan.confidence * 0.45 + fearOfMinority;
      const altAllowed = plan.splitVote && plan.altTargetId && plan.memberIds.length >= 4 && voter.traits.loyalty < 55;
      if (altAllowed) {
        const altTarget = candidates.find((candidate) => candidate.id === plan.altTargetId);
        if (altTarget && rng.bool(0.45)) {
          return { targetId: altTarget.id, reason: "split vote precaution" };
        }
      }
      if (planScore >= bestPersonal.score - 6 || dangerMap[voter.id] > 62) {
        return { targetId: plannedTarget.id, reason: `coordination avec ${plan.allianceId}` };
      }
    }
  }

  const emotionalOverride = scored.find((entry) => {
    const rel = getRelationship(state, voter.id, entry.candidate.id);
    return rel.grievance > 48 || rel.betrayalsRemembered >= 1;
  });
  if (emotionalOverride && voter.traits.impulsivity + rng.centeredNoise(20) > 58) {
    return { targetId: emotionalOverride.candidate.id, reason: "vote emotionnel" };
  }

  return { targetId: bestPersonal.candidate.id, reason: "calcul individuel" };
}

function tallyVotes(ballots: VoteBallot[]): Map<string, number> {
  const tally = new Map<string, number>();
  ballots.forEach((ballot) => {
    if (!ballot.voided) {
      tally.set(ballot.targetId, (tally.get(ballot.targetId) ?? 0) + ballot.weight);
    }
  });
  return tally;
}

function chooseEliminatedByConsensus(state: GameState, tiedIds: string[]): string {
  return [...tiedIds].sort((aId, bId) => {
    const aTrust = average(activePlayers(state).filter((player) => player.id !== aId).map((player) => getRelationship(state, player.id, aId).trust));
    const bTrust = average(activePlayers(state).filter((player) => player.id !== bId).map((player) => getRelationship(state, player.id, bId).trust));
    return aTrust - bTrust;
  })[0];
}

function registerVoteDamage(state: GameState, votes: VoteBallot[], eliminatedId: string): void {
  votes.forEach((vote) => {
    const voter = getPlayer(state, vote.voterId);
    const target = getPlayer(state, vote.targetId);
    if (!vote.voided) {
      target.receivedVotes += vote.weight;
    }
    if (haveAlliance(state, voter.id, target.id) || getRelationship(state, voter.id, target.id).trust > 68) {
      voter.betrayalsCommitted += 1;
      modifyRelationship(state, target.id, voter.id, { grievance: 12, trust: -18, closeness: -10, betrayalsRemembered: 1 }, "Vote contre un allie");
      modifyRelationship(state, voter.id, target.id, { allianceScore: -15, moralDebt: -6 }, "Vote contre un allie");
    }
    if (vote.targetId === eliminatedId) {
      voter.strategicMoves += 1;
    }
  });

  const nonVoided = votes.filter((vote) => !vote.voided);
  nonVoided.forEach((vote, index) => {
    nonVoided.slice(index + 1).forEach((otherVote) => {
      if (vote.targetId === otherVote.targetId && vote.voterId !== otherVote.voterId) {
        modifyRelationship(state, vote.voterId, otherVote.voterId, { trust: 3, closeness: 2 }, "Vote coordonne");
        modifyRelationship(state, otherVote.voterId, vote.voterId, { trust: 3, closeness: 2 }, "Vote coordonne");
      }
    });
  });
}

function markEliminated(state: GameState, playerId: string): void {
  const player = getPlayer(state, playerId);
  const remainingAfter = activePlayers(state).length - 1;
  player.eliminationEpisode = state.episode;
  player.placement = remainingAfter + 1;
  const tribe = state.tribes.find((entry) => entry.id === player.tribeId);
  if (tribe) {
    tribe.memberIds = tribe.memberIds.filter((memberId) => memberId !== player.id);
  }
  if (state.phase !== "premerge" && remainingAfter <= state.config.finalists + state.config.jurySize) {
    player.status = "jury";
    state.juryIds.push(player.id);
  } else {
    player.status = "eliminated";
  }
}

function resolveTribalCouncil(state: GameState, challenge: ChallengeResult, rng: RNG, summary: EpisodeSummary): TribalCouncilRecord {
  const tribeId = state.phase === "premerge" ? challenge.losers[0] : currentTribe(state).id;
  const tribe = state.tribes.find((entry) => entry.id === tribeId) ?? currentTribe(state);
  const members = activeMembersOfTribe(state, tribe.id);
  const immuneIds = new Set<string>(challenge.type === "individual_immunity" ? challenge.winners : []);
  const plans = buildVotePlans(state, members, immuneIds, rng);
  const dangerMap = predictDanger(state, members, immuneIds);
  const safeWithoutPowerIds = new Set<string>();
  const blockedVoters = new Set<string>();
  const stolenVotes: string[] = [];
  const idolProtected = new Map<string, string>();
  const nullifierTargets = new Set<string>();
  const idolPlays: string[] = [];
  const nullifierPlays: string[] = [];
  const notes: string[] = [];
  const extraBallots = new Map<string, number>();

  members.forEach((member) => {
    member.advantages.filter((advantage) => advantage.active).forEach((advantage) => {
      if (advantage.type === "safety_without_power" && dangerMap[member.id] > 70 && rng.bool(0.55 + member.traits.riskTolerance / 220)) {
        safeWithoutPowerIds.add(member.id);
        consumeAdvantage(member, advantage.id);
        notes.push(`${member.name} quitte le conseil avec Safety Without Power.`);
      }
    });
  });

  members.forEach((member) => {
    member.advantages.filter((advantage) => advantage.active).forEach((advantage) => {
      if (advantage.type === "vote_block") {
        const target = strongestOpponent(state, member, members, immuneIds);
        if (target && (dangerMap[member.id] > 58 || member.traits.aggression > 60) && rng.bool(0.42)) {
          blockedVoters.add(target.id);
          consumeAdvantage(member, advantage.id);
          notes.push(`${member.name} bloque le vote de ${target.name}.`);
        }
      }
      if (advantage.type === "steal_a_vote") {
        const target = strongestOpponent(state, member, members, immuneIds);
        if (target && dangerMap[member.id] > 55 && rng.bool(0.38)) {
          blockedVoters.add(target.id);
          extraBallots.set(member.id, (extraBallots.get(member.id) ?? 0) + 1);
          stolenVotes.push(`${member.name} prend le vote de ${target.name}`);
          consumeAdvantage(member, advantage.id);
          notes.push(`${member.name} vole le vote de ${target.name}.`);
        }
      }
      if (advantage.type === "extra_vote" && (dangerMap[member.id] > 55 || member.traits.strategic > 72) && rng.bool(0.35)) {
        extraBallots.set(member.id, (extraBallots.get(member.id) ?? 0) + 1);
        consumeAdvantage(member, advantage.id);
        notes.push(`${member.name} utilise un vote supplementaire.`);
      }
    });
  });

  members.forEach((member) => {
    member.advantages.filter((advantage) => advantage.active).forEach((advantage) => {
      if (advantage.type === "idol_nullifier") {
        const plannedTarget = plans.find((plan) => plan.memberIds.includes(member.id))?.targetId;
        if (plannedTarget) {
          const target = getPlayer(state, plannedTarget);
          const idolConcern = target.idolFinds * 22 + target.traits.riskTolerance * 0.18 + target.traits.focus * 0.16 + rng.centeredNoise(12);
          if (idolConcern > 55 && rng.bool(0.45)) {
            nullifierTargets.add(target.id);
            nullifierPlays.push(`${member.name} neutralise une eventuelle idole sur ${target.name}`);
            consumeAdvantage(member, advantage.id);
          }
        }
      }
    });
  });

  members.forEach((member) => {
    member.advantages.filter((advantage) => advantage.active).forEach((advantage) => {
      if (advantage.type === "hidden_immunity_idol") {
        const allyInDanger = members
          .filter((candidate) => candidate.id !== member.id && haveAlliance(state, member.id, candidate.id))
          .sort((a, b) => (dangerMap[b.id] ?? 0) - (dangerMap[a.id] ?? 0))[0];
        const selfDanger = dangerMap[member.id] ?? 0;
        const allyDanger = allyInDanger ? dangerMap[allyInDanger.id] ?? 0 : 0;
        const protectAlly = allyInDanger && member.traits.loyalty > 68 && allyDanger > selfDanger + 8 && rng.bool(0.28);
        const shouldPlay = selfDanger > 66 || Boolean(protectAlly);
        if (shouldPlay && rng.bool(0.58 + member.traits.riskTolerance / 240)) {
          const protectedId = protectAlly && allyInDanger ? allyInDanger.id : member.id;
          idolProtected.set(protectedId, member.id);
          idolPlays.push(`${member.name} joue une idole pour ${getPlayer(state, protectedId).name}`);
          getPlayer(state, member.id).idolPlays += 1;
          consumeAdvantage(member, advantage.id);
        }
      }
    });
  });

  const eligibleVoters = members.filter((member) => !safeWithoutPowerIds.has(member.id) && !blockedVoters.has(member.id));
  const voteOrder = rng.shuffle(eligibleVoters);
  const candidates = members.filter((member) => !immuneIds.has(member.id) && !safeWithoutPowerIds.has(member.id));
  const votes: VoteBallot[] = [];

  voteOrder.forEach((voter) => {
    const count = 1 + (extraBallots.get(voter.id) ?? 0);
    for (let index = 0; index < count; index += 1) {
      const choice = chooseVoteTarget(state, voter, candidates.filter((candidate) => candidate.id !== voter.id), immuneIds, plans, dangerMap, rng);
      votes.push({ voterId: voter.id, targetId: choice.targetId, reason: choice.reason, weight: 1 });
    }
  });

  votes.forEach((vote) => {
    if (idolProtected.has(vote.targetId) && !nullifierTargets.has(vote.targetId)) {
      vote.voided = true;
    }
  });

  let tally = tallyVotes(votes);
  const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  let eliminatedId = sorted[0]?.[0] ?? candidates[0].id;
  let revote: VoteBallot[] | undefined;
  let tieTargets: string[] | undefined;

  if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) {
    tieTargets = sorted.filter((entry) => entry[1] === sorted[0][1]).map(([targetId]) => targetId);
    notes.push(`Egalite entre ${tieTargets.map((targetId) => getPlayer(state, targetId).name).join(" et ")}.`);
    const revoters = eligibleVoters.filter((voter) => !tieTargets?.includes(voter.id));
    revote = [];
    revoters.forEach((voter) => {
      const tieCandidates = candidates.filter((candidate) => tieTargets?.includes(candidate.id));
      const choice = chooseVoteTarget(state, voter, tieCandidates, immuneIds, plans, dangerMap, rng);
      revote?.push({ voterId: voter.id, targetId: choice.targetId, reason: `${choice.reason} (revote)`, weight: 1 });
    });
    revote.forEach((vote) => {
      if (idolProtected.has(vote.targetId) && !nullifierTargets.has(vote.targetId)) {
        vote.voided = true;
      }
    });
    tally = tallyVotes(revote);
    const revoteSorted = [...tally.entries()].sort((a, b) => b[1] - a[1]);
    if (revoteSorted.length > 1 && revoteSorted[0][1] === revoteSorted[1][1]) {
      eliminatedId = chooseEliminatedByConsensus(state, tieTargets);
      notes.push(`Le deadlock se resout par consensus contre ${getPlayer(state, eliminatedId).name}.`);
    } else {
      eliminatedId = revoteSorted[0]?.[0] ?? chooseEliminatedByConsensus(state, tieTargets);
    }
  }

  registerVoteDamage(state, votes, eliminatedId);
  if (revote) {
    registerVoteDamage(state, revote, eliminatedId);
  }

  const eliminated = getPlayer(state, eliminatedId);
  addLog(state, "tribal", "Conseil tribal", `${eliminated.name} est elimine(e) au terme d'un vote tendu.`, [eliminated.id], "public", tribe.id);
  note(summary, `${eliminated.name} quitte la partie.`);
  notes.push(...idolPlays, ...nullifierPlays);
  markEliminated(state, eliminated.id);
  eligibleVoters.forEach((member) => {
    member.survivedTribals += 1;
  });
  refreshAlliances(state);
  refreshSocialCapital(state);

  return {
    episode: state.episode,
    tribeId: tribe.id,
    tribeName: tribe.name,
    immuneIds: [...immuneIds],
    safeWithoutPowerIds: [...safeWithoutPowerIds],
    blockedVoters: [...blockedVoters],
    stolenVotes,
    idolPlays,
    nullifierPlays,
    votes,
    revote,
    tieTargets,
    eliminatedId: eliminated.id,
    eliminatedName: eliminated.name,
    notes,
  };
}

function mergeIfNeeded(state: GameState, rng: RNG, summary: EpisodeSummary): void {
  if (state.phase !== "premerge") {
    return;
  }
  if (activePlayers(state).length > state.config.mergeAt) {
    return;
  }
  const mergeName = getMergeName(state.seed + state.episode + rng.int(1, 999));
  const mergedTribe: Tribe = {
    id: `merge-${state.episode}`,
    name: mergeName,
    color: "#c084fc",
    merged: true,
    memberIds: activePlayers(state).map((player) => player.id),
  };
  activePlayers(state).forEach((player) => {
    player.tribeId = mergedTribe.id;
  });
  state.tribes = [mergedTribe];
  state.phase = "merge";
  addLog(state, "merge", "Fusion", `Les tribus fusionnent et donnent naissance a ${mergeName}.`, mergedTribe.memberIds, "public", mergedTribe.id);
  note(summary, `Fusion: la saison entre dans le jeu individuel sous le nom ${mergeName}.`);
}

function resolveFinalTribal(state: GameState, rng: RNG, summary: EpisodeSummary): void {
  const finalists = activePlayers(state);
  finalists.forEach((player) => {
    player.status = "finalist";
  });
  state.finalists = finalists.map((player) => player.id);
  state.phase = "final";

  const speechScores = new Map<string, number>();
  finalists.forEach((finalist) => {
    const score = clamp(finalist.traits.strategic * 0.28 + finalist.traits.socialAwareness * 0.2 + finalist.traits.honesty * 0.1 + finalist.socialCapital * 0.18 + finalist.strategicMoves * 2.5 - finalist.betrayalsCommitted * 1.3 + rng.centeredNoise(10));
    speechScores.set(finalist.id, score);
  });

  const juryVotes = new Map<string, number>();
  const juryReasoning: string[] = [];
  state.juryIds.forEach((jurorId) => {
    const juror = getPlayer(state, jurorId);
    const ranked = finalists
      .map((finalist) => {
        const relationship = getRelationship(state, juror.id, finalist.id);
        const respect = finalist.traits.strategic * 0.22 + finalist.socialCapital * 0.18 + finalist.challengeWins * 3.5 + finalist.strategicMoves * 5;
        const bond = relationship.trust * 0.22 + relationship.closeness * 0.18 + relationship.admiration * 0.15;
        const resentment = relationship.grievance * 0.28 + relationship.betrayalsRemembered * 16 + (100 - relationship.trust) * 0.08;
        const authenticity = speechScores.get(finalist.id)! * 0.28 + finalist.traits.honesty * 0.14 + finalist.traits.popularity * 0.1;
        const jurorBiasForBigMoves = juror.traits.strategic * 0.16 + (100 - juror.traits.loyalty) * 0.12;
        const jurorBiasForLoyalty = juror.traits.loyalty * 0.15 + juror.traits.honesty * 0.12;
        const score = respect * (0.42 + jurorBiasForBigMoves / 400) + bond + authenticity - resentment * (0.45 + jurorBiasForLoyalty / 500) + rng.centeredNoise(9);
        return { finalist, score, relationship };
      })
      .sort((a, b) => b.score - a.score);
    const vote = ranked[0].finalist;
    juryVotes.set(vote.id, (juryVotes.get(vote.id) ?? 0) + 1);
    juryReasoning.push(`${juror.name} vote pour ${vote.name} (respect ${Math.round(ranked[0].relationship.admiration)}, lien ${Math.round(ranked[0].relationship.closeness)}).`);
  });

  const winnerEntry = [...juryVotes.entries()].sort((a, b) => b[1] - a[1])[0];
  const winnerId = winnerEntry?.[0] ?? finalists[0].id;
  const winner = getPlayer(state, winnerId);
  winner.status = "winner";
  state.winnerId = winner.id;
  state.phase = "complete";

  addLog(state, "jury", "Final Tribal Council", `${winner.name} remporte la saison face aux autres finalistes.`, [winner.id, ...state.juryIds], "public", currentTribe(state).id);
  juryReasoning.slice(0, 6).forEach((line) => note(summary, line));
  note(summary, `${winner.name} gagne la saison avec une lecture du jury suffisante pour convertir le respect en votes.`);
}

export function simulateNextEpisode(previous: GameState): GameState {
  const state = cloneState(previous);
  const rng = new RNG(state.rngState);
  const activeCount = activePlayers(state).length;
  if (state.phase === "complete" || activeCount <= 1) {
    return state;
  }

  state.episode += 1;
  const summary: EpisodeSummary = {
    episode: state.episode,
    title: `Episode ${state.episode}`,
    dayStart: state.day,
    dayEnd: state.day,
    events: [],
  };

  mergeIfNeeded(state, rng, summary);
  runSocialRound(state, rng, summary);
  runAdvantageSearch(state, rng, summary);

  if (activePlayers(state).length <= state.config.finalists) {
    resolveFinalTribal(state, rng, summary);
  } else {
    const challenge = resolveChallenge(state, rng, summary);
    summary.challenge = challenge;
    const tribal = resolveTribalCouncil(state, challenge, rng, summary);
    summary.tribal = tribal;
    state.lastTribal = tribal;
    if (activePlayers(state).length <= state.config.finalists) {
      resolveFinalTribal(state, rng, summary);
    }
  }

  activePlayers(state).forEach((player) => {
    player.fatigue = clamp(player.fatigue - rng.float(1, 3));
  });

  state.day += 3;
  summary.dayEnd = state.day;
  state.episodes.push(summary);
  state.rngState = rng.getState();
  return state;
}

export function simulateFullSeason(initial: GameState): GameState {
  let state = cloneState(initial);
  let safety = 0;
  while (state.phase !== "complete" && safety < 50) {
    state = simulateNextEpisode(state);
    safety += 1;
  }
  return state;
}
