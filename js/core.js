(() => {
  const DEFAULT_NAMES = [
    "Alexis",
    "Camille",
    "Morgan",
    "Sasha",
    "Nolan",
    "Jade",
    "Éli",
    "Milo",
    "Anya",
    "Luca",
    "Romy",
    "Avery",
    "Noa",
    "Charlie",
    "Mael",
    "Sky",
    "Iris",
    "Kaya",
    "Dorian",
    "Ari",
    "Nael",
    "Soren",
    "Lou",
    "Kira",
    "Naya",
    "Mina",
    "Evan",
    "Sami",
    "Yuna",
    "Zion"
  ];

  const DEFAULT_TRIBES = [
    { name: "Astra", color: "#06b6d4" },
    { name: "Nova", color: "#8b5cf6" },
    { name: "Pyra", color: "#ef4444" },
    { name: "Vortex", color: "#22c55e" }
  ];

  const PHASE_ORDER = [
    "returnFromCouncil",
    "campLifeA",
    "rewardChallenge",
    "campLifeB",
    "immunityChallenge",
    "postImmunityTalk",
    "tribalCouncil"
  ];

  const PHASE_LABELS = {
    returnFromCouncil: "Retour du dernier conseil",
    campLifeA: "Vie de camp",
    rewardChallenge: "Épreuve de confort",
    campLifeB: "Vie de camp",
    immunityChallenge: "Épreuve d'immunité",
    postImmunityTalk: "Discussions post-immunité",
    tribalCouncil: "Conseil"
  };

  const RARITY_CHANCE = {
    medium: 0.5,
    rare: 0.3,
    veryRare: 0.18
  };

  const ADVANTAGE_EMOJI = {
    idol: "🗿",
    doubleVote: "🗳️x2",
    voteBlock: "🚫🗳️",
    stealVote: "🥷🗳️",
    legacy: "📜"
  };

  const app = {
    config: null,
    players: [],
    tribes: [],
    merged: false,
    mergeTribe: null,
    episode: 1,
    phaseIndex: 1,
    hasCouncilLastEpisode: false,
    losingTribesLastImmunity: [],
    councilQueue: [],
    councilInProgress: null,
    councilOccurredThisEpisode: false,
    humanPlayerId: null,
    humanPendingAction: null,
    guidance: "",
    journalCounter: 0,
    targetHistoryByEpisode: {},
    jury: [],
    finalThreeReached: false,
    winnerDeclared: false,
    usedOneTimeAdvantages: new Set(),
    setupStepIndex: 0,
    openAi: {
      key: "",
      model: "gpt-4.1-mini"
    }
  };

  const el = {
    setupScreen: document.getElementById("setupScreen"),
    gameScreen: document.getElementById("gameScreen"),
    playerCount: document.getElementById("playerCount"),
    tribeCount: document.getElementById("tribeCount"),
    mergeAt: document.getElementById("mergeAt"),
    humanPlayerSelect: document.getElementById("humanPlayerSelect"),
    tribeEditor: document.getElementById("tribeEditor"),
    playersEditor: document.getElementById("playersEditor"),
    mergeTribeName: document.getElementById("mergeTribeName"),
    mergeTribeColor: document.getElementById("mergeTribeColor"),
    divisibilityWarning: document.getElementById("divisibilityWarning"),
    setupStepTabs: [...document.querySelectorAll(".setup-step-tab")],
    setupPanes: [...document.querySelectorAll(".setup-pane")],
    setupProgressText: document.getElementById("setupProgressText"),
    prevSetupStep: document.getElementById("prevSetupStep"),
    nextSetupStep: document.getElementById("nextSetupStep"),
    setupBlockingMessage: document.getElementById("setupBlockingMessage"),
    setupBlockingList: document.getElementById("setupBlockingList"),
    setupWarningList: document.getElementById("setupWarningList"),
    setupInfoList: document.getElementById("setupInfoList"),
    idolEnabled: document.getElementById("idolEnabled"),
    doubleVoteEnabled: document.getElementById("doubleVoteEnabled"),
    voteBlockEnabled: document.getElementById("voteBlockEnabled"),
    stealVoteEnabled: document.getElementById("stealVoteEnabled"),
    legacyEnabled: document.getElementById("legacyEnabled"),
    rarityDoubleVote: document.getElementById("rarityDoubleVote"),
    rarityVoteBlock: document.getElementById("rarityVoteBlock"),
    rarityStealVote: document.getElementById("rarityStealVote"),
    rarityLegacy: document.getElementById("rarityLegacy"),
    legacyPlayableAt: document.getElementById("legacyPlayableAt"),
    openAiKey: document.getElementById("openAiKey"),
    openAiModel: document.getElementById("openAiModel"),
    resetSetup: document.getElementById("resetSetup"),
    startGame: document.getElementById("startGame"),
    episodeBadge: document.getElementById("episodeBadge"),
    phaseBadge: document.getElementById("phaseBadge"),
    aliveCounter: document.getElementById("aliveCounter"),
    nextPhaseButton: document.getElementById("nextPhaseButton"),
    tribesBoard: document.getElementById("tribesBoard"),
    journalFeed: document.getElementById("journalFeed"),
    aiGuidance: document.getElementById("aiGuidance"),
    humanActionType: document.getElementById("humanActionType"),
    humanActionTarget: document.getElementById("humanActionTarget"),
    applyHumanAction: document.getElementById("applyHumanAction"),
    targetModal: document.getElementById("targetModal"),
    targetModalTitle: document.getElementById("targetModalTitle"),
    targetModalBody: document.getElementById("targetModalBody"),
    closeTargetModal: document.getElementById("closeTargetModal"),
    councilModal: document.getElementById("councilModal"),
    councilTitle: document.getElementById("councilTitle"),
    closeCouncilModal: document.getElementById("closeCouncilModal"),
    councilStepInfo: document.getElementById("councilStepInfo"),
    councilParticipants: document.getElementById("councilParticipants"),
    humanCouncilControls: document.getElementById("humanCouncilControls"),
    councilReveal: document.getElementById("councilReveal"),
    ballotCard: document.getElementById("ballotCard"),
    ballotText: document.getElementById("ballotText"),
    revealCounter: document.getElementById("revealCounter"),
    councilLog: document.getElementById("councilLog"),
    councilContinueButton: document.getElementById("councilContinueButton"),
    councilRunningTally: document.getElementById("councilRunningTally"),
    targetChartCanvas: document.getElementById("targetChartCanvas"),
    targetChartLegend: document.getElementById("targetChartLegend"),
    journalEntryTemplate: document.getElementById("journalEntryTemplate")
  };

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function pickRandom(arr) {
    if (!arr.length) return null;
    return arr[randInt(0, arr.length - 1)];
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function chance(probability) {
    return Math.random() < probability;
  }

  function shuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  window.SurvivorCore = {
    DEFAULT_NAMES,
    DEFAULT_TRIBES,
    PHASE_ORDER,
    PHASE_LABELS,
    RARITY_CHANCE,
    ADVANTAGE_EMOJI,
    app,
    el,
    randInt,
    pickRandom,
    clamp,
    chance,
    shuffle
  };
})();
