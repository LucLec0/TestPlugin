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

const SETUP_STEPS = [
  { index: 0, label: "Général" },
  { index: 1, label: "Tribus" },
  { index: 2, label: "Joueurs" },
  { index: 3, label: "Avantages" }
];

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

function createDefaultSetup() {
  const playerCount = Number(el.playerCount.value);
  const tribeCount = Number(el.tribeCount.value);
  const players = [];
  const tribes = DEFAULT_TRIBES.slice(0, tribeCount).map((tribe, index) => ({
    id: `tribe-${index + 1}`,
    name: tribe.name,
    color: tribe.color
  }));

  for (let i = 0; i < playerCount; i += 1) {
    players.push({
      id: `p-${i + 1}`,
      name: DEFAULT_NAMES[i] || `Joueur ${i + 1}`,
      tribeId: tribes[i % tribeCount].id
    });
  }

  return { players, tribes };
}

function buildSetupEditors() {
  const state = createDefaultSetup();
  renderTribeEditor(state.tribes);
  renderPlayersEditor(state.players, state.tribes);
  renderHumanSelect(state.players);
  updateDivisibilityWarning();
  setSetupStep(0);
  renderSetupDiagnostics();
}

function renderTribeEditor(tribes) {
  el.tribeEditor.innerHTML = "";
  tribes.forEach((tribe, idx) => {
    const row = document.createElement("div");
    row.className = "editor-row tribe";
    row.innerHTML = `
      <input type="text" data-kind="tribe-name" data-index="${idx}" maxlength="20" value="${tribe.name}" />
      <input type="color" data-kind="tribe-color" data-index="${idx}" value="${tribe.color}" />
    `;
    el.tribeEditor.appendChild(row);
  });
}

function renderPlayersEditor(players, tribes) {
  el.playersEditor.innerHTML = "";
  const tribeOptions = tribes
    .map((tribe) => `<option value="${tribe.id}">${tribe.name}</option>`)
    .join("");

  players.forEach((player, idx) => {
    const row = document.createElement("div");
    row.className = "editor-row";
    row.innerHTML = `
      <input type="text" data-kind="player-name" data-index="${idx}" maxlength="24" value="${player.name}" />
      <select data-kind="player-tribe" data-index="${idx}">${tribeOptions}</select>
      <small>#${idx + 1}</small>
    `;
    row.querySelector("select").value = player.tribeId;
    el.playersEditor.appendChild(row);
  });
}

function renderHumanSelect(players) {
  el.humanPlayerSelect.innerHTML = players
    .map((player, idx) => `<option value="${player.id}">${idx + 1}. ${player.name}</option>`)
    .join("");
}

function syncHumanSelectFromEditors() {
  const current = el.humanPlayerSelect.value;
  const playerRows = [...el.playersEditor.querySelectorAll(".editor-row")];
  const players = playerRows.map((row, idx) => ({
    id: `p-${idx + 1}`,
    name: (row.querySelector('[data-kind="player-name"]').value || `Joueur ${idx + 1}`).trim()
  }));
  renderHumanSelect(players);
  if (players.some((p) => p.id === current)) {
    el.humanPlayerSelect.value = current;
  }
}

function refreshPlayerTribeOptionsFromEditor() {
  const tribeRows = [...el.tribeEditor.querySelectorAll(".editor-row")];
  const tribes = tribeRows.map((row, idx) => ({
    id: `tribe-${idx + 1}`,
    name: (row.querySelector('[data-kind="tribe-name"]').value || `Tribu ${idx + 1}`).trim()
  }));
  const options = tribes.map((tribe) => `<option value="${tribe.id}">${tribe.name}</option>`).join("");
  el.playersEditor.querySelectorAll('[data-kind="player-tribe"]').forEach((select) => {
    const previousValue = select.value;
    select.innerHTML = options;
    if (tribes.some((tribe) => tribe.id === previousValue)) {
      select.value = previousValue;
    } else if (tribes[0]) {
      select.value = tribes[0].id;
    }
  });
}

function getSetupData() {
  const playerCount = clamp(Number(el.playerCount.value) || 16, 12, 30);
  const tribeCount = clamp(Number(el.tribeCount.value) || 2, 2, 4);
  const mergeAt = clamp(Number(el.mergeAt.value) || 10, 6, 20);
  const legacyPlayableAt = clamp(Number(el.legacyPlayableAt.value) || 7, 4, 15);
  const tribeRows = [...el.tribeEditor.querySelectorAll(".editor-row")];
  const playerRows = [...el.playersEditor.querySelectorAll(".editor-row")];

  const tribes = tribeRows.map((row, idx) => ({
    id: `tribe-${idx + 1}`,
    name: (row.querySelector('[data-kind="tribe-name"]').value || `Tribu ${idx + 1}`).trim(),
    color: row.querySelector('[data-kind="tribe-color"]').value
  }));

  const players = playerRows.map((row, idx) => ({
    id: `p-${idx + 1}`,
    name: (row.querySelector('[data-kind="player-name"]').value || `Joueur ${idx + 1}`).trim(),
    tribeId: row.querySelector('[data-kind="player-tribe"]').value
  }));

  return {
    playerCount,
    tribeCount,
    mergeAt,
    tribes,
    players,
    mergeTribe: {
      id: "tribe-merge",
      name: (el.mergeTribeName.value || "Nexus").trim(),
      color: el.mergeTribeColor.value
    },
    humanPlayerId: el.humanPlayerSelect.value,
    advantages: {
      idolEnabled: el.idolEnabled.checked,
      doubleVoteEnabled: el.doubleVoteEnabled.checked,
      voteBlockEnabled: el.voteBlockEnabled.checked,
      stealVoteEnabled: el.stealVoteEnabled.checked,
      legacyEnabled: el.legacyEnabled.checked,
      rarityDoubleVote: el.rarityDoubleVote.value,
      rarityVoteBlock: el.rarityVoteBlock.value,
      rarityStealVote: el.rarityStealVote.value,
      rarityLegacy: el.rarityLegacy.value,
      legacyPlayableAt
    },
    openAi: {
      key: el.openAiKey.value.trim(),
      model: (el.openAiModel.value || "gpt-4.1-mini").trim()
    }
  };
}

function updateDivisibilityWarning() {
  const playerCount = clamp(Number(el.playerCount.value) || 16, 12, 30);
  const tribeCount = clamp(Number(el.tribeCount.value) || 2, 2, 4);
  const ok = playerCount % tribeCount === 0;
  el.divisibilityWarning.textContent = ok
    ? "Configuration valide pour un départ équilibré."
    : "⚠️ Le nombre de joueurs doit être divisible par le nombre de tribus.";
  el.divisibilityWarning.classList.toggle("good", ok);
}

function rebuildEditorsFromCounts() {
  const playerCount = clamp(Number(el.playerCount.value) || 16, 12, 30);
  const tribeCount = clamp(Number(el.tribeCount.value) || 2, 2, 4);
  const tribes = DEFAULT_TRIBES.slice(0, tribeCount).map((tribe, index) => ({
    id: `tribe-${index + 1}`,
    name: tribe.name,
    color: tribe.color
  }));
  const players = [];
  for (let i = 0; i < playerCount; i += 1) {
    players.push({
      id: `p-${i + 1}`,
      name: DEFAULT_NAMES[i] || `Joueur ${i + 1}`,
      tribeId: tribes[i % tribeCount].id
    });
  }
  renderTribeEditor(tribes);
  renderPlayersEditor(players, tribes);
  renderHumanSelect(players);
  updateDivisibilityWarning();
  renderSetupDiagnostics();
}

function setSetupStep(nextStep) {
  const clampedStep = clamp(nextStep, 0, 3);
  app.setupStepIndex = clampedStep;
  el.setupStepTabs.forEach((tab) => {
    tab.classList.toggle("active", Number(tab.dataset.step) === clampedStep);
  });
  el.setupPanes.forEach((pane) => {
    pane.classList.toggle("active", Number(pane.dataset.stepPane) === clampedStep);
  });
  el.setupProgressText.textContent = `Étape ${clampedStep + 1} / 4`;
  el.prevSetupStep.disabled = clampedStep === 0;
  el.nextSetupStep.disabled = clampedStep === 3;
}

function renderDiagnosticList(listElement, issues, emptyText) {
  listElement.innerHTML = "";
  if (!issues.length) {
    const li = document.createElement("li");
    li.textContent = emptyText;
    listElement.appendChild(li);
    return;
  }
  issues.forEach((issue) => {
    const li = document.createElement("li");
    li.textContent = issue.text;
    if (typeof issue.step === "number") {
      li.dataset.step = String(issue.step);
      li.style.cursor = "pointer";
      li.title = "Cliquer pour aller à l'étape concernée";
      li.addEventListener("click", () => setSetupStep(issue.step));
    }
    listElement.appendChild(li);
  });
}

function validateSetupDetailed(setup) {
  const blockers = [];
  const warnings = [];
  const infos = [];
  const addBlocker = (text, step = 0) => blockers.push({ text, step });
  const addWarning = (text, step = 0) => warnings.push({ text, step });
  const addInfo = (text) => infos.push({ text });

  if (setup.players.length !== setup.playerCount) {
    addBlocker(
      `La simulation ne peut pas se lancer: ${setup.players.length} joueur(s) configuré(s) pour ${setup.playerCount} attendu(s).`,
      2
    );
  }
  if (setup.tribes.length !== setup.tribeCount) {
    addBlocker(
      `La simulation ne peut pas se lancer: ${setup.tribes.length} tribu(s) configurée(s) pour ${setup.tribeCount} attendue(s).`,
      1
    );
  }
  if (setup.playerCount % setup.tribeCount !== 0) {
    addBlocker(
      `La simulation ne peut pas se lancer: ${setup.playerCount} n'est pas divisible par ${setup.tribeCount}.`,
      0
    );
  }
  if (setup.mergeAt >= setup.playerCount) {
    addBlocker(
      `La simulation ne peut pas se lancer: la fusion (${setup.mergeAt}) doit être inférieure au nombre total de joueurs (${setup.playerCount}).`,
      0
    );
  }
  if (!setup.players.find((p) => p.id === setup.humanPlayerId)) {
    addBlocker("La simulation ne peut pas se lancer: le joueur humain sélectionné est invalide.", 0);
  }
  if (!setup.mergeTribe.name.trim()) {
    addBlocker("La simulation ne peut pas se lancer: le nom de la tribu de fusion est vide.", 1);
  }

  const emptyTribes = setup.tribes.filter((tribe) => !tribe.name.trim());
  if (emptyTribes.length) {
    addBlocker(
      `La simulation ne peut pas se lancer: ${emptyTribes.length} tribu(s) n'ont pas de nom.`,
      1
    );
  }
  const tribeNames = setup.tribes.map((tribe) => tribe.name.trim().toLowerCase()).filter(Boolean);
  const duplicateTribeNames = tribeNames.filter((name, idx) => tribeNames.indexOf(name) !== idx);
  if (duplicateTribeNames.length) {
    addBlocker("La simulation ne peut pas se lancer: plusieurs tribus ont le même nom.", 1);
  }

  const emptyPlayers = setup.players.filter((player) => !player.name.trim());
  if (emptyPlayers.length) {
    addBlocker(
      `La simulation ne peut pas se lancer: ${emptyPlayers.length} joueur(s) n'ont pas de nom.`,
      2
    );
  }
  const playerNames = setup.players.map((player) => player.name.trim().toLowerCase()).filter(Boolean);
  const duplicatePlayerNames = playerNames.filter((name, idx) => playerNames.indexOf(name) !== idx);
  if (duplicatePlayerNames.length) {
    addBlocker("La simulation ne peut pas se lancer: des joueurs ont le même nom.", 2);
  }

  const tribeIds = new Set(setup.tribes.map((tribe) => tribe.id));
  const playersWithInvalidTribe = setup.players.filter((player) => !tribeIds.has(player.tribeId));
  if (playersWithInvalidTribe.length) {
    addBlocker(
      `La simulation ne peut pas se lancer: ${playersWithInvalidTribe.length} joueur(s) sont assignés à une tribu invalide.`,
      2
    );
  }

  if (setup.playerCount % setup.tribeCount === 0) {
    const expectedPerTribe = setup.playerCount / setup.tribeCount;
    const perTribe = {};
    setup.players.forEach((p) => {
      perTribe[p.tribeId] = (perTribe[p.tribeId] || 0) + 1;
    });
    const unevenTribes = setup.tribes.filter((tribe) => (perTribe[tribe.id] || 0) !== expectedPerTribe);
    if (unevenTribes.length) {
      addBlocker(
        `La simulation ne peut pas se lancer: répartition inégale des joueurs (${expectedPerTribe} attendu(s) par tribu).`,
        2
      );
    }
  }

  if (!setup.openAi.key) {
    addInfo("Aucune clé OpenAI fournie: la narration utilisera l'IA locale intégrée.");
  } else {
    addInfo(`OpenAI actif avec le modèle: ${setup.openAi.model}.`);
  }
  if (
    setup.advantages.idolEnabled === false &&
    setup.advantages.doubleVoteEnabled === false &&
    setup.advantages.voteBlockEnabled === false &&
    setup.advantages.stealVoteEnabled === false &&
    setup.advantages.legacyEnabled === false
  ) {
    addWarning("Tous les avantages sont désactivés: la partie sera plus linéaire stratégiquement.", 3);
  }
  if (setup.advantages.legacyEnabled && setup.advantages.legacyPlayableAt >= setup.playerCount) {
    addWarning(
      "Le Legacy est activé mais son tour jouable est trop tardif par rapport au nombre initial de joueurs.",
      3
    );
  }
  if (setup.mergeAt <= 6) {
    addWarning("La fusion est très tôt: le jeu individuel commencera rapidement.", 0);
  }

  addInfo(`Joueurs configurés: ${setup.playerCount}.`);
  addInfo(`Tribus configurées: ${setup.tribeCount}.`);
  addInfo(`Fusion prévue à ${setup.mergeAt} joueurs restants.`);

  return { blockers, warnings, infos };
}

function validateSetup(setup) {
  const report = validateSetupDetailed(setup);
  return report.blockers.length ? report.blockers[0].text : null;
}

function renderSetupDiagnostics(precomputedSetup = null) {
  const setup = precomputedSetup || getSetupData();
  const report = validateSetupDetailed(setup);
  renderDiagnosticList(el.setupBlockingList, report.blockers, "Aucun blocage détecté.");
  renderDiagnosticList(el.setupWarningList, report.warnings, "Aucun avertissement.");
  renderDiagnosticList(el.setupInfoList, report.infos, "Aucune info.");

  if (report.blockers.length) {
    el.setupBlockingMessage.classList.remove("ready");
    el.setupBlockingMessage.classList.add("blocked");
    el.setupBlockingMessage.textContent = `❌ La simulation ne peut pas se lancer (${report.blockers.length} blocage(s)). Corrige les points ci-dessous.`;
    el.startGame.disabled = true;
  } else {
    el.setupBlockingMessage.classList.remove("blocked");
    el.setupBlockingMessage.classList.add("ready");
    el.setupBlockingMessage.textContent = "✅ Configuration valide. La simulation peut être lancée.";
    el.startGame.disabled = false;
  }
  return report;
}

function createPlayerModel(setupPlayer, setup) {
  return {
    id: setupPlayer.id,
    name: setupPlayer.name,
    tribeId: setupPlayer.tribeId,
    alive: true,
    eliminatedAt: null,
    jury: false,
    immunized: false,
    target: 0,
    social: randInt(35, 85),
    strategy: randInt(35, 85),
    challenge: randInt(35, 85),
    trust: {},
    alliances: new Set(),
    advantages: [],
    isHuman: setupPlayer.id === setup.humanPlayerId
  };
}

function initializeRelations(players) {
  const alivePlayers = players.filter((p) => p.alive);
  alivePlayers.forEach((player) => {
    alivePlayers.forEach((other) => {
      if (player.id === other.id) return;
      const value = randInt(-20, 35);
      player.trust[other.id] = value;
      if (value > 25 && chance(0.25)) {
        player.alliances.add(other.id);
      }
    });
  });
}

function logJournal(emoji, title, text, phaseOverride = getCurrentPhase(), episodeOverride = app.episode) {
  app.journalCounter += 1;
  const frag = el.journalEntryTemplate.content.cloneNode(true);
  const entry = frag.querySelector(".journal-entry");
  const phaseText = PHASE_LABELS[phaseOverride] || phaseOverride || "Phase";
  frag.querySelector(".meta").textContent = `${emoji} ${title} • Épisode ${episodeOverride} • ${phaseText}`;
  frag.querySelector("p").textContent = text;
  el.journalFeed.appendChild(frag);
  el.journalFeed.scrollTop = el.journalFeed.scrollHeight;
  if (entry) {
    void entry.offsetHeight;
  }
}

function addCouncilLog(text) {
  const node = document.createElement("article");
  node.className = "journal-entry";
  node.innerHTML = `<header><span class="meta">🔥 Conseil</span></header><p>${text}</p>`;
  el.councilLog.appendChild(node);
  el.councilLog.scrollTop = el.councilLog.scrollHeight;
}

function getAlivePlayers() {
  return app.players.filter((p) => p.alive);
}

function getPlayerById(id) {
  return app.players.find((p) => p.id === id);
}

function getAliveByTribe(tribeId) {
  return app.players.filter((p) => p.alive && p.tribeId === tribeId);
}

function getCurrentPhase() {
  return PHASE_ORDER[app.phaseIndex];
}

function updateTopBar() {
  el.episodeBadge.textContent = `Épisode ${app.episode}`;
  el.phaseBadge.textContent = `Phase: ${PHASE_LABELS[getCurrentPhase()]}`;
  el.aliveCounter.textContent = `Joueurs restants: ${getAlivePlayers().length}`;
}

function renderTribesBoard() {
  el.tribesBoard.innerHTML = "";
  const tribesToShow = app.merged ? [app.mergeTribe] : app.tribes;
  tribesToShow.forEach((tribe) => {
    const players = getAliveByTribe(tribe.id);
    const eliminated = app.players.filter((p) => !p.alive && p.tribeId === tribe.id);
    const box = document.createElement("section");
    box.className = "tribe-box";
    box.innerHTML = `
      <header>
        <div class="tribe-name">
          <span class="tribe-dot" style="background:${tribe.color}"></span>
          <strong>${tribe.name}</strong>
        </div>
        <button class="secondary icon-button" data-open-target="${tribe.id}">🎯 Cible</button>
      </header>
      <ul class="players-list"></ul>
    `;
    const list = box.querySelector(".players-list");

    [...players, ...eliminated].forEach((player) => {
      const crown = player.immunized ? "👑" : "";
      const jury = player.jury ? "⚖️" : "";
      const eliminatedBadge = player.alive ? "" : "❌";
      const advantageBadges = player.advantages.map((a) => ADVANTAGE_EMOJI[a.type]).join(" ");
      const li = document.createElement("li");
      if (!player.alive) li.classList.add("eliminated");
      if (player.immunized) li.classList.add("immune");
      li.innerHTML = `
        <span>${player.name}</span>
        <span class="player-meta">${crown} ${jury} ${eliminatedBadge} ${advantageBadges}</span>
      `;
      list.appendChild(li);
    });
    el.tribesBoard.appendChild(box);
  });

  el.tribesBoard.querySelectorAll("[data-open-target]").forEach((btn) => {
    btn.addEventListener("click", () => openTargetModal(btn.getAttribute("data-open-target")));
  });
}

function renderHumanTargetOptions() {
  const human = getPlayerById(app.humanPlayerId);
  const alive = getAlivePlayers().filter((p) => p.id !== app.humanPlayerId);
  const sameTribe = alive.filter((p) => p.tribeId === human.tribeId);
  const others = alive.filter((p) => p.tribeId !== human.tribeId);
  const options = [...sameTribe, ...others];
  el.humanActionTarget.innerHTML = options
    .map((p) => `<option value="${p.id}">${p.name} (${getTribeName(p.tribeId)})</option>`)
    .join("");
}

function getTribeName(tribeId) {
  if (app.mergeTribe?.id === tribeId) return app.mergeTribe.name;
  const tribe = app.tribes.find((t) => t.id === tribeId);
  return tribe ? tribe.name : "Inconnu";
}

function openTargetModal(tribeId) {
  const players = app.players
    .filter((p) => p.tribeId === tribeId)
    .sort((a, b) => b.target - a.target);
  el.targetModalTitle.textContent = `🎯 Target - ${getTribeName(tribeId)}`;
  el.targetModalBody.innerHTML = "";
  players.forEach((player) => {
    const row = document.createElement("div");
    row.className = "target-row";
    row.innerHTML = `<span>${player.name}</span><strong>${Math.round(player.target)}%</strong>`;
    el.targetModalBody.appendChild(row);
  });
  el.targetModal.showModal();
}

function closeTargetModal() {
  el.targetModal.close();
}

function applyTargetDelta(player, delta) {
  player.target = clamp(player.target + delta, 0, 100);
}

function increaseTrust(playerA, playerB, amount) {
  if (!playerA || !playerB || playerA.id === playerB.id) return;
  playerA.trust[playerB.id] = clamp((playerA.trust[playerB.id] ?? 0) + amount, -100, 100);
}

function maybeCreateAlliance(a, b) {
  if (!a || !b || a.id === b.id) return;
  if ((a.trust[b.id] ?? 0) > 45 && (b.trust[a.id] ?? 0) > 45) {
    a.alliances.add(b.id);
    b.alliances.add(a.id);
  }
}

function maybeBreakAlliance(a, b) {
  if (!a || !b || a.id === b.id) return;
  if ((a.trust[b.id] ?? 0) < -20 || (b.trust[a.id] ?? 0) < -20) {
    a.alliances.delete(b.id);
    b.alliances.delete(a.id);
  }
}

function applyHumanAction() {
  const human = getPlayerById(app.humanPlayerId);
  if (!human || !human.alive) return;
  const type = el.humanActionType.value;
  const target = getPlayerById(el.humanActionTarget.value);
  app.humanPendingAction = { type, targetId: target?.id ?? null };
  logJournal("🧭", "Directive joueur", `Action préparée: ${human.name} -> ${describeHumanAction(app.humanPendingAction)}`);
}

function describeHumanAction(action) {
  if (!action) return "Aucune";
  const target = action.targetId ? getPlayerById(action.targetId)?.name || "cible" : "cible";
  switch (action.type) {
    case "social":
      return `Renforcer le lien avec ${target}`;
    case "alliance":
      return `Proposer une alliance à ${target}`;
    case "target":
      return `Diriger les votes contre ${target}`;
    case "searchIdol":
      return "Chercher une idole";
    case "layLow":
      return "Rester discret";
    default:
      return "Action inconnue";
  }
}

function consumeHumanActionInCamp() {
  if (!app.humanPendingAction) return;
  const human = getPlayerById(app.humanPlayerId);
  if (!human || !human.alive) return;
  const { type, targetId } = app.humanPendingAction;
  const target = targetId ? getPlayerById(targetId) : null;
  if (type === "social" && target?.alive) {
    increaseTrust(human, target, 16);
    increaseTrust(target, human, 12);
    applyTargetDelta(human, -2);
    logJournal("🤝", "Lien social", `${human.name} passe du temps avec ${target.name}. Leur relation se renforce.`);
  } else if (type === "alliance" && target?.alive) {
    increaseTrust(human, target, 14);
    increaseTrust(target, human, 10);
    maybeCreateAlliance(human, target);
    if (human.alliances.has(target.id)) {
      logJournal("🛡️", "Alliance", `${human.name} et ${target.name} officialisent une alliance tactique.`);
      applyTargetDelta(human, 3);
      applyTargetDelta(target, 2);
    } else {
      logJournal("💬", "Alliance hésitante", `${target.name} reste prudent face à la proposition de ${human.name}.`);
    }
  } else if (type === "target" && target?.alive) {
    applyTargetDelta(target, 8);
    applyTargetDelta(human, 5);
    logJournal("🎯", "Plan offensif", `${human.name} tente de positionner ${target.name} comme cible du prochain vote.`);
  } else if (type === "searchIdol") {
    attemptFindIdol(human, 0.5, "Action humaine");
  } else if (type === "layLow") {
    applyTargetDelta(human, -5);
    Object.keys(human.trust).forEach((id) => {
      human.trust[id] = clamp(human.trust[id] + randInt(-2, 2), -100, 100);
    });
    logJournal("🫥", "Discrétion", `${human.name} se fait discret pour diminuer la pression autour de son jeu.`);
  }
  app.humanPendingAction = null;
}

function getIdolInGame() {
  return app.players.some((p) => p.alive && p.advantages.some((a) => a.type === "idol"));
}

function addAdvantage(player, type, metadata = {}, options = {}) {
  const { ignoreUniqueUsage = false, markUniqueUsage = true } = options;
  if (!player || !player.alive) return false;
  if (type !== "idol" && !ignoreUniqueUsage && app.usedOneTimeAdvantages.has(type)) return false;
  if (type !== "idol" && markUniqueUsage) app.usedOneTimeAdvantages.add(type);
  player.advantages.push({
    type,
    ...metadata
  });
  return true;
}

function removeAdvantage(player, type) {
  const idx = player.advantages.findIndex((adv) => adv.type === type);
  if (idx >= 0) {
    player.advantages.splice(idx, 1);
    return true;
  }
  return false;
}

function tryAwardRewardAdvantage(winner) {
  const advConfig = app.config.advantages;
  const pool = [];
  if (advConfig.doubleVoteEnabled && !app.usedOneTimeAdvantages.has("doubleVote")) {
    pool.push({ type: "doubleVote", rarity: advConfig.rarityDoubleVote });
  }
  if (advConfig.voteBlockEnabled && !app.usedOneTimeAdvantages.has("voteBlock")) {
    pool.push({ type: "voteBlock", rarity: advConfig.rarityVoteBlock });
  }
  if (advConfig.stealVoteEnabled && !app.usedOneTimeAdvantages.has("stealVote")) {
    pool.push({ type: "stealVote", rarity: advConfig.rarityStealVote });
  }
  if (advConfig.legacyEnabled && !app.usedOneTimeAdvantages.has("legacy")) {
    pool.push({
      type: "legacy",
      rarity: advConfig.rarityLegacy,
      playableAt: advConfig.legacyPlayableAt
    });
  }
  if (!pool.length || !winner) return null;

  const shuffled = shuffle(pool);
  for (const candidate of shuffled) {
    if (chance(RARITY_CHANCE[candidate.rarity] || 0.22)) {
      const added = addAdvantage(winner, candidate.type, candidate.type === "legacy" ? { playableAt: candidate.playableAt } : {});
      if (added) {
        return candidate.type;
      }
    }
  }
  return null;
}

function attemptFindIdol(player, baseChance = 0.18, context = "Vie de camp") {
  if (!app.config.advantages.idolEnabled) return false;
  if (getIdolInGame()) return false;
  if (!player.alive) return false;
  if (chance(baseChance)) {
    addAdvantage(player, "idol");
    applyTargetDelta(player, 5);
    logJournal("🗿", "Idole trouvée", `${player.name} découvre une idole cachée. (${context})`);
    return true;
  }
  return false;
}

function runCampLifePhase(label) {
  applyGuidanceInfluence();
  consumeHumanActionInCamp();
  const alive = getAlivePlayers();
  if (!alive.length) return;

  const interactions = randInt(4, 7);
  for (let i = 0; i < interactions; i += 1) {
    const actor = pickRandom(alive);
    const target = pickRandom(alive.filter((p) => p.id !== actor.id && p.tribeId === actor.tribeId));
    if (!target) continue;
    const roll = Math.random();
    if (roll < 0.38) {
      increaseTrust(actor, target, randInt(8, 18));
      increaseTrust(target, actor, randInt(3, 12));
      maybeCreateAlliance(actor, target);
      logJournal(
        "🤝",
        label,
        `${actor.name} et ${target.name} partagent une discussion stratégique autour du feu de camp.`
      );
    } else if (roll < 0.66) {
      increaseTrust(actor, target, -randInt(7, 16));
      maybeBreakAlliance(actor, target);
      applyTargetDelta(target, randInt(2, 6));
      logJournal(
        "⚡",
        label,
        `${actor.name} diffuse des doutes sur ${target.name}. La méfiance progresse dans la tribu.`
      );
    } else {
      const spread = alive.filter((p) => p.tribeId === actor.tribeId && p.id !== actor.id);
      spread.forEach((p) => increaseTrust(p, actor, randInt(1, 5)));
      applyTargetDelta(actor, randInt(2, 5));
      logJournal("📣", label, `${actor.name} prend de la place socialement et devient plus visible.`);
    }
  }

  alive.forEach((player) => {
    if (chance(0.14 + player.strategy / 450)) {
      attemptFindIdol(player, 0.15 + player.strategy / 450, label);
    }
  });

  const phaseSnapshot = getCurrentPhase();
  const episodeSnapshot = app.episode;
  createOpenAiNarration(label).then((extraText) => {
    if (extraText) logJournal("🤖", "Narration IA", extraText, phaseSnapshot, episodeSnapshot);
  });
}

function applyGuidanceInfluence() {
  const guidance = el.aiGuidance.value.trim().toLowerCase();
  if (!guidance) return;
  const human = getPlayerById(app.humanPlayerId);
  if (!human || !human.alive) return;
  const others = getAlivePlayers().filter((p) => p.id !== human.id);
  const namedTarget = others.find((p) => guidance.includes(p.name.toLowerCase()));

  if (/(cibl|target|elim|blindside|sortir)/.test(guidance) && namedTarget) {
    applyTargetDelta(namedTarget, 6);
    applyTargetDelta(human, 3);
    logJournal("🧠", "Directive IA", `${human.name} pousse une campagne discrète contre ${namedTarget.name}.`);
  }
  if (/(alliance|allié|confiance|social)/.test(guidance) && namedTarget) {
    increaseTrust(human, namedTarget, 10);
    increaseTrust(namedTarget, human, 8);
    maybeCreateAlliance(human, namedTarget);
    logJournal("🫱", "Directive IA", `${human.name} renforce son lien stratégique avec ${namedTarget.name}.`);
  }
  if (/(discret|ombre|low profile)/.test(guidance)) {
    applyTargetDelta(human, -4);
  }
  if (/(idole|idol)/.test(guidance) && chance(0.24)) {
    attemptFindIdol(human, 0.42, "Directive IA");
  }
}

async function createOpenAiNarration(label) {
  const guidance = el.aiGuidance.value.trim();
  app.guidance = guidance;
  if (!app.openAi.key) {
    return localNarration(label, guidance);
  }

  try {
    const alive = getAlivePlayers()
      .map((p) => `${p.name} [T:${Math.round(p.target)}%]`)
      .join(", ");
    const prompt = `Tu es narrateur d'un simulateur Survivor en français. Phase: ${label}.
Joueurs encore en jeu: ${alive}.
Directive utilisateur: ${guidance || "Aucune"}.
Rédige 2 phrases courtes, cohérentes, axées stratégie/alliance, sans inventer d'élimination immédiate.`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${app.openAi.key}`
      },
      body: JSON.stringify({
        model: app.openAi.model,
        input: prompt
      })
    });
    if (!response.ok) {
      return localNarration(label, guidance);
    }
    const json = await response.json();
    const text = extractOpenAiText(json);
    if (!text) return localNarration(label, guidance);
    return text.trim();
  } catch (_e) {
    return localNarration(label, guidance);
  }
}

function extractOpenAiText(json) {
  if (!json) return "";
  if (typeof json.output_text === "string" && json.output_text.trim()) return json.output_text;
  if (Array.isArray(json.output)) {
    const chunks = [];
    json.output.forEach((item) => {
      if (Array.isArray(item.content)) {
        item.content.forEach((c) => {
          if (c.text) chunks.push(c.text);
        });
      }
    });
    return chunks.join(" ");
  }
  return "";
}

function localNarration(label, guidance) {
  const alive = getAlivePlayers();
  const highThreat = [...alive].sort((a, b) => b.target - a.target).slice(0, 2);
  const lowThreat = [...alive].sort((a, b) => a.target - b.target).slice(0, 2);
  const fragments = [
    `${label}: ${highThreat[0]?.name || "Un joueur"} attire fortement l'attention comme menace à surveiller.`,
    `${lowThreat[0]?.name || "Un joueur discret"} reste dans l'ombre et consolide sa survie.`,
    guidance ? `La directive joueur influence les dynamiques: ${guidance.slice(0, 120)}.` : "Aucune directive spécifique, le social domine les décisions."
  ];
  return fragments.join(" ");
}

function runRewardChallenge() {
  const alive = getAlivePlayers();
  if (!alive.length) return;
  if (app.merged) {
    const winner = computeChallengeWinner(alive, "reward");
    logJournal("🏆", "Épreuve confort", `${winner.name} remporte l'épreuve de confort individuelle.`);
    const awarded = tryAwardRewardAdvantage(winner);
    if (awarded) {
      logJournal("🎁", "Avantage trouvé", `${winner.name} trouve un avantage: ${formatAdvantageName(awarded)}.`);
    }
    applyTargetDelta(winner, 4);
    return;
  }

  const tribeScores = app.tribes.map((tribe) => {
    const players = getAliveByTribe(tribe.id);
    const score =
      players.reduce((acc, p) => acc + p.challenge + randInt(-8, 8), 0) / Math.max(players.length, 1);
    return { tribe, score };
  });
  tribeScores.sort((a, b) => b.score - a.score);
  const winner = tribeScores[0];
  logJournal("🏕️", "Épreuve confort", `La tribu ${winner.tribe.name} gagne confort et moral pour le camp.`);
  const randomWinnerPlayer = pickRandom(getAliveByTribe(winner.tribe.id));
  const awarded = tryAwardRewardAdvantage(randomWinnerPlayer);
  if (awarded) {
    logJournal(
      "🎁",
      "Avantage trouvé",
      `${randomWinnerPlayer.name} de ${winner.tribe.name} tombe sur ${formatAdvantageName(awarded)} en explorant la zone confort.`
    );
  }
}

function formatAdvantageName(type) {
  if (type === "doubleVote") return "Double vote";
  if (type === "voteBlock") return "Annule vote";
  if (type === "stealVote") return "Steal vote";
  if (type === "legacy") return "Legacy";
  if (type === "idol") return "Idole";
  return type;
}

function computeChallengeWinner(players, kind) {
  const scored = players.map((p) => ({
    player: p,
    score: p.challenge + randInt(-20, 22) + (kind === "immunity" ? p.strategy / 5 : p.social / 8)
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0].player;
}

function resetImmunityFlags() {
  app.players.forEach((p) => {
    p.immunized = false;
  });
}

function runImmunityChallenge() {
  resetImmunityFlags();
  app.losingTribesLastImmunity = [];
  if (app.merged) {
    const alive = getAlivePlayers();
    const winner = computeChallengeWinner(alive, "immunity");
    winner.immunized = true;
    logJournal("👑", "Immunité", `${winner.name} gagne l'immunité individuelle.`);
    const eligible = alive.filter((p) => p.id !== winner.id);
    app.councilQueue = eligible.length ? [app.mergeTribe.id] : [];
    applyTargetDelta(winner, 6);
    return;
  }

  const results = app.tribes.map((tribe) => {
    const players = getAliveByTribe(tribe.id);
    const score =
      players.reduce((acc, p) => acc + p.challenge + randInt(-12, 12), 0) / Math.max(players.length, 1);
    return { tribe, score };
  });
  results.sort((a, b) => b.score - a.score);
  const best = results[0].score;
  const losers = results.filter((r) => r.score < best - 1.5);
  if (!losers.length) losers.push(results[results.length - 1]);
  app.losingTribesLastImmunity = losers.map((l) => l.tribe.id);
  app.councilQueue = [...app.losingTribesLastImmunity];
  results.forEach((r, idx) => {
    if (idx === 0) {
      const tribePlayers = getAliveByTribe(r.tribe.id);
      const immunized = pickRandom(tribePlayers);
      if (immunized) immunized.immunized = true;
      logJournal(
        "🛡️",
        "Immunité tribale",
        `La tribu ${r.tribe.name} remporte l'immunité.${immunized ? ` ${immunized.name} obtient aussi une protection symbolique.` : ""}`
      );
    } else if (app.losingTribesLastImmunity.includes(r.tribe.id)) {
      logJournal("🔥", "Tribu en danger", `${r.tribe.name} perd l'immunité et devra aller au conseil.`);
    }
  });
}

function runPostImmunityTalk() {
  if (!app.councilQueue.length) {
    logJournal("🧠", "Discussions", "Aucun conseil prévu, les joueurs réajustent calmement leur position.");
    return;
  }
  app.councilQueue.forEach((tribeId) => {
    const atRisk = getAliveByTribe(tribeId).filter((p) => !p.immunized);
    if (!atRisk.length) return;
    const suspicious = [...atRisk].sort((a, b) => b.target - a.target).slice(0, 2);
    suspicious.forEach((player) => applyTargetDelta(player, randInt(3, 7)));
    logJournal(
      "🗣️",
      "Discussions post-immunité",
      `Avant le conseil de ${getTribeName(tribeId)}, les noms de ${suspicious.map((p) => p.name).join(" et ")} circulent fortement.`
    );
  });
}

function runReturnFromCouncil() {
  if (!app.hasCouncilLastEpisode) {
    app.phaseIndex = 1;
    return;
  }
  logJournal("🌙", "Retour du conseil", "Le camp se réveille après un vote tendu. Les alliances se réorganisent.");
  const alive = getAlivePlayers();
  alive.forEach((player) => {
    Object.keys(player.trust).forEach((pid) => {
      player.trust[pid] = clamp(player.trust[pid] + randInt(-4, 4), -100, 100);
    });
  });
}

function checkMergeTrigger() {
  if (app.merged) return;
  const aliveCount = getAlivePlayers().length;
  if (aliveCount <= app.config.mergeAt) {
    app.merged = true;
    getAlivePlayers().forEach((player) => {
      player.tribeId = app.mergeTribe.id;
    });
    logJournal(
      "🌐",
      "FUSION",
      `Les tribus fusionnent dans la nouvelle tribu ${app.mergeTribe.name}. La compétition devient individuelle.`
    );
  }
}

function getPhaseEnabled(phase) {
  if (phase === "returnFromCouncil") return app.hasCouncilLastEpisode;
  if (phase === "postImmunityTalk" || phase === "tribalCouncil") return app.councilQueue.length > 0;
  return true;
}

function advancePhasePointer() {
  let next = app.phaseIndex + 1;
  while (next < PHASE_ORDER.length && !getPhaseEnabled(PHASE_ORDER[next])) {
    next += 1;
  }
  if (next >= PHASE_ORDER.length) {
    app.episode += 1;
    app.phaseIndex = 0;
    app.hasCouncilLastEpisode = app.councilOccurredThisEpisode;
    app.councilOccurredThisEpisode = false;
    while (app.phaseIndex < PHASE_ORDER.length && !getPhaseEnabled(PHASE_ORDER[app.phaseIndex])) {
      app.phaseIndex += 1;
    }
  } else {
    app.phaseIndex = next;
  }
}

function eliminatePlayer(player, mode = "vote") {
  player.alive = false;
  player.immunized = false;
  player.eliminatedAt = { episode: app.episode, phase: getCurrentPhase(), mode };
  player.advantages = player.advantages.filter((adv) => {
    if (adv.type === "legacy") {
      passLegacy(player, adv);
      return false;
    }
    if (adv.type === "idol") return false;
    return false;
  });
  if (app.merged && getAlivePlayers().length >= 3) {
    player.jury = true;
    app.jury.push(player.id);
  }
}

function passLegacy(fromPlayer, legacyAdv) {
  const alive = getAlivePlayers().filter((p) => p.id !== fromPlayer.id);
  if (!alive.length) return;
  const trusted = alive
    .map((p) => ({ p, trust: (fromPlayer.trust[p.id] ?? 0) + (fromPlayer.alliances.has(p.id) ? 24 : 0) }))
    .sort((a, b) => b.trust - a.trust);
  const recipient = trusted[0]?.p || pickRandom(alive);
  if (recipient) {
    addAdvantage(
      recipient,
      "legacy",
      { playableAt: legacyAdv.playableAt },
      { ignoreUniqueUsage: true, markUniqueUsage: false }
    );
    logJournal("📜", "Transmission Legacy", `${fromPlayer.name} transmet le Legacy à ${recipient.name} avant de partir.`);
  }
}

function updateTargetAfterVote(votes, eliminatedId) {
  const counts = {};
  votes.forEach((v) => {
    counts[v.targetId] = (counts[v.targetId] || 0) + v.weight;
  });
  const eliminated = getPlayerById(eliminatedId);
  Object.entries(counts).forEach(([targetId, c]) => {
    const player = getPlayerById(targetId);
    if (!player) return;
    applyTargetDelta(player, c * 1.5);
  });
  votes.forEach((vote) => {
    const voter = getPlayerById(vote.voterId);
    if (!voter) return;
    if (vote.targetId === eliminatedId) {
      applyTargetDelta(voter, 1.8);
    } else {
      applyTargetDelta(voter, -1.4);
    }
  });
  if (eliminated) applyTargetDelta(eliminated, 10);
}

function getCouncilPlayers(tribeId) {
  return getAliveByTribe(tribeId).filter((p) => p.alive);
}

function chooseVoteTarget(voter, voters, inTie = null) {
  const candidates = voters.filter((p) => p.id !== voter.id && !p.immunized);
  const filtered = inTie ? candidates.filter((p) => inTie.includes(p.id)) : candidates;
  const options = filtered.length ? filtered : candidates;
  if (!options.length) return null;
  const scored = options.map((target) => {
    const trust = voter.trust[target.id] ?? 0;
    const allianceBonus = voter.alliances.has(target.id) ? -30 : 0;
    const danger = target.target * 0.62;
    const socialThreat = (target.strategy + target.social) / 5;
    const score = danger + socialThreat - trust + allianceBonus + randInt(-14, 14);
    return { target, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].target;
}

function maybeUsePreVoteAdvantage(voter, councilPlayers, strategyContext) {
  const actions = [];
  const adv = voter.advantages;
  if (!adv.length) return actions;

  const hasStealVote = adv.some((a) => a.type === "stealVote");
  const hasVoteBlock = adv.some((a) => a.type === "voteBlock");
  const hasDoubleVote = adv.some((a) => a.type === "doubleVote");

  const threat = councilPlayers
    .filter((p) => p.id !== voter.id)
    .sort((a, b) => b.target - a.target)[0];
  const selfRisk = strategyContext.expectedVotesOn[voter.id] || 0;

  if (hasStealVote && (selfRisk >= 2 || chance(0.35))) {
    const target = chooseVoteTarget(voter, councilPlayers);
    if (target) {
      removeAdvantage(voter, "stealVote");
      actions.push({ type: "stealVote", actorId: voter.id, targetId: target.id });
      return actions;
    }
  }
  if (hasVoteBlock && (selfRisk >= 2 || chance(0.28))) {
    const target = threat || chooseVoteTarget(voter, councilPlayers);
    if (target) {
      removeAdvantage(voter, "voteBlock");
      actions.push({ type: "voteBlock", actorId: voter.id, targetId: target.id });
      return actions;
    }
  }
  if (hasDoubleVote && (chance(0.3) || selfRisk >= 2)) {
    removeAdvantage(voter, "doubleVote");
    actions.push({ type: "doubleVote", actorId: voter.id });
  }
  return actions;
}

function maybeUsePostVoteProtection(councilPlayers, voteSummary, remainingCount) {
  const actions = [];
  councilPlayers.forEach((player) => {
    if (!player.alive) return;
    const votesOnSelf = voteSummary[player.id] || 0;
    const idol = player.advantages.find((a) => a.type === "idol");
    const legacy = player.advantages.find((a) => a.type === "legacy");
    if (legacy && remainingCount === legacy.playableAt) {
      removeAdvantage(player, "legacy");
      actions.push({ type: "legacy", actorId: player.id, protectedId: player.id });
      return;
    }
    if (idol && votesOnSelf >= 2 && chance(0.7)) {
      removeAdvantage(player, "idol");
      actions.push({ type: "idol", actorId: player.id, protectedId: player.id });
      return;
    }
    if (idol && chance(0.18)) {
      const ally = councilPlayers
        .filter((p) => p.id !== player.id)
        .sort((a, b) => (player.trust[b.id] ?? 0) - (player.trust[a.id] ?? 0))[0];
      if (ally && (voteSummary[ally.id] || 0) > (voteSummary[player.id] || 0)) {
        removeAdvantage(player, "idol");
        actions.push({ type: "idol", actorId: player.id, protectedId: ally.id });
      }
    }
  });
  return actions;
}

function tallyVotes(votes, protections) {
  const protectedIds = new Set(protections.map((p) => p.protectedId));
  const visible = votes.map((v) => ({
    ...v,
    counted: !protectedIds.has(v.targetId)
  }));
  const counted = {};
  visible.forEach((v) => {
    if (!v.counted) return;
    counted[v.targetId] = (counted[v.targetId] || 0) + v.weight;
  });
  return { visible, counted };
}

function getTopTargets(counted) {
  const entries = Object.entries(counted).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return [];
  const topVotes = entries[0][1];
  return entries.filter(([, val]) => val === topVotes).map(([id]) => id);
}

function runCouncilComputation(tribeId) {
  const players = getCouncilPlayers(tribeId);
  const expectedVotesOn = {};
  players.forEach((voter) => {
    const provisional = chooseVoteTarget(voter, players);
    if (provisional) expectedVotesOn[provisional.id] = (expectedVotesOn[provisional.id] || 0) + 1;
  });
  const strategyContext = { expectedVotesOn };

  const preActions = [];
  const blocked = new Set();
  const stolen = {};
  const doubled = new Set();

  players.forEach((voter) => {
    const actions = maybeUsePreVoteAdvantage(voter, players, strategyContext);
    actions.forEach((action) => {
      preActions.push(action);
      if (action.type === "voteBlock") blocked.add(action.targetId);
      if (action.type === "stealVote") {
        blocked.add(action.targetId);
        stolen[action.actorId] = (stolen[action.actorId] || 0) + 1;
      }
      if (action.type === "doubleVote") doubled.add(action.actorId);
    });
  });

  const votes = [];
  players.forEach((voter) => {
    if (blocked.has(voter.id)) return;
    const baseTarget = chooseVoteTarget(voter, players);
    if (!baseTarget) return;
    const extraVotes = (doubled.has(voter.id) ? 1 : 0) + (stolen[voter.id] || 0);
    votes.push({ voterId: voter.id, targetId: baseTarget.id, weight: 1, source: "normal" });
    for (let i = 0; i < extraVotes; i += 1) {
      const nextTarget = chooseVoteTarget(voter, players);
      if (nextTarget) {
        votes.push({
          voterId: voter.id,
          targetId: nextTarget.id,
          weight: 1,
          source: "bonus"
        });
      }
    }
  });

  const firstCountMap = {};
  votes.forEach((v) => {
    firstCountMap[v.targetId] = (firstCountMap[v.targetId] || 0) + v.weight;
  });
  const remainingCount = getAlivePlayers().length;
  const protections = maybeUsePostVoteProtection(players, firstCountMap, remainingCount);
  let tally = tallyVotes(votes, protections);
  let top = getTopTargets(tally.counted);

  let tieRound = null;
  let rocksResult = null;
  if (top.length > 1) {
    const revoteVoters = players.filter((p) => !top.includes(p.id) && !blocked.has(p.id));
    const revotes = [];
    revoteVoters.forEach((voter) => {
      const target = chooseVoteTarget(voter, players, top);
      if (target) {
        revotes.push({ voterId: voter.id, targetId: target.id, weight: 1, source: "revote" });
      }
    });
    const revoteCount = {};
    revotes.forEach((vote) => {
      revoteCount[vote.targetId] = (revoteCount[vote.targetId] || 0) + 1;
    });
    const revoteTop = getTopTargets(revoteCount);
    tieRound = { candidates: top, votes: revotes, counted: revoteCount };
    if (revoteTop.length === 1) {
      top = revoteTop;
      tally = {
        ...tally,
        revotes
      };
    } else {
      const rockCandidates = players.filter((p) => !top.includes(p.id) && !p.immunized);
      const eliminatedByRocks = pickRandom(rockCandidates);
      if (eliminatedByRocks) {
        top = [eliminatedByRocks.id];
        rocksResult = { eliminatedId: eliminatedByRocks.id, candidates: rockCandidates.map((p) => p.id) };
      }
    }
  }

  return {
    tribeId,
    players: players.map((p) => p.id),
    preActions,
    votes,
    protections,
    tally,
    top,
    tieRound,
    rocksResult,
    eliminatedId: top[0] || null
  };
}

function renderCouncilParticipants(councilState) {
  el.councilParticipants.innerHTML = "";
  councilState.players.forEach((pid) => {
    const player = getPlayerById(pid);
    if (!player) return;
    const chip = document.createElement("span");
    chip.className = `chip ${player.immunized ? "immune" : ""}`;
    chip.textContent = `${player.name}${player.immunized ? " 👑" : ""}`;
    el.councilParticipants.appendChild(chip);
  });
}

function openCouncilModal(councilState) {
  app.councilInProgress = {
    ...councilState,
    revealIndex: 0,
    revealSequence: shuffle([...councilState.tally.visible]),
    stage: 0,
    phaseResolved: false
  };
  el.councilTitle.textContent = `Conseil Tribal - ${getTribeName(councilState.tribeId)}`;
  el.councilLog.innerHTML = "";
  el.councilReveal.classList.add("hidden");
  el.councilContinueButton.classList.remove("hidden");
  el.councilContinueButton.textContent = "Commencer le conseil";
  renderCouncilParticipants(councilState);
  el.humanCouncilControls.innerHTML = "";
  el.councilStepInfo.textContent = "Le conseil débute. Les joueurs s'installent.";
  el.councilModal.showModal();
}

function closeCouncilModal() {
  if (el.councilModal.open) el.councilModal.close();
}

function resolveCouncilPhaseAdvance() {
  const c = app.councilInProgress;
  if (!c || c.stage < 6 || c.phaseResolved) return false;
  c.phaseResolved = true;
  closeCouncilModal();
  app.councilInProgress = null;
  if (app.winnerDeclared) return true;
  if (app.councilQueue.length > 0) {
    runTribalCouncilPhase();
    return true;
  }
  advancePhasePointer();
  updateTopBar();
  if (!app.winnerDeclared) el.nextPhaseButton.disabled = false;
  return true;
}

function councilStageRunner() {
  const c = app.councilInProgress;
  if (!c) return;
  if (c.stage === 0) {
    el.councilStepInfo.textContent = "1/5 - Fenêtre d'avantages pré-vote";
    if (!c.preActions.length) {
      addCouncilLog("Aucun avantage joué avant le vote.");
    } else {
      c.preActions.forEach((action) => {
        if (action.type === "doubleVote") {
          addCouncilLog(`${getPlayerById(action.actorId).name} joue un Double Vote.`);
        } else if (action.type === "voteBlock") {
          addCouncilLog(
            `${getPlayerById(action.actorId).name} annule le vote de ${getPlayerById(action.targetId).name}.`
          );
        } else if (action.type === "stealVote") {
          addCouncilLog(
            `${getPlayerById(action.actorId).name} vole le vote de ${getPlayerById(action.targetId).name}.`
          );
        }
      });
    }
    c.stage = 1;
    el.councilContinueButton.textContent = "Lancer le vote";
    return;
  }
  if (c.stage === 1) {
    el.councilStepInfo.textContent = "2/5 - Les joueurs votent en secret";
    addCouncilLog("Les bulletins sont déposés dans l'urne.");
    c.stage = 2;
    el.councilContinueButton.textContent = "Gérer post-vote";
    return;
  }
  if (c.stage === 2) {
    el.councilStepInfo.textContent = "3/5 - Avantages post-vote";
    if (!c.protections.length) {
      addCouncilLog("Aucun avantage défensif n'est joué.");
    } else {
      c.protections.forEach((prot) => {
        const actor = getPlayerById(prot.actorId)?.name;
        const protectedName = getPlayerById(prot.protectedId)?.name;
        addCouncilLog(`${actor} joue ${formatAdvantageName(prot.type)} sur ${protectedName}.`);
      });
    }
    c.stage = 3;
    el.councilContinueButton.textContent = "Démarrer le dépouillement";
    return;
  }
  if (c.stage === 3) {
    el.councilStepInfo.textContent = "4/5 - Dépouillement";
    el.councilReveal.classList.remove("hidden");
    el.councilContinueButton.classList.add("hidden");
    el.revealCounter.textContent = `0 / ${c.revealSequence.length} bulletins`;
    el.ballotText.textContent = "---";
    return;
  }
  if (c.stage === 5) {
    finalizeCouncilResult(c);
    return;
  }
}

function handleBallotReveal() {
  const c = app.councilInProgress;
  if (!c || c.stage !== 3) return;
  const ballot = c.revealSequence[c.revealIndex];
  if (!ballot) {
    c.stage = 5;
    el.councilReveal.classList.add("hidden");
    el.councilContinueButton.classList.remove("hidden");
    el.councilContinueButton.textContent = "Afficher le résultat";
    el.councilStepInfo.textContent = "Dépouillement terminé.";
    return;
  }

  const targetName = getPlayerById(ballot.targetId)?.name || "Inconnu";
  el.ballotCard.classList.remove("flip");
  void el.ballotCard.offsetWidth;
  el.ballotCard.classList.add("flip");
  const tag = ballot.counted ? "" : " (non comptabilisé)";
  el.ballotText.textContent = `${targetName}${tag}`;
  addCouncilLog(`Bulletin: ${targetName}${tag}`);

  c.revealIndex += 1;
  el.revealCounter.textContent = `${c.revealIndex} / ${c.revealSequence.length} bulletins`;
}

function buildVoteTable(votes) {
  const table = document.createElement("table");
  table.className = "vote-table";
  const rows = votes
    .map((vote) => {
      const voter = getPlayerById(vote.voterId)?.name || "Inconnu";
      const target = getPlayerById(vote.targetId)?.name || "Inconnu";
      return `<tr><td>${voter}</td><td>${target}</td><td>${vote.source}</td></tr>`;
    })
    .join("");
  table.innerHTML = `<thead><tr><th>Votant</th><th>Vote</th><th>Type</th></tr></thead><tbody>${rows}</tbody>`;
  return table;
}

function finalizeCouncilResult(c) {
  el.councilStepInfo.textContent = "5/5 - Résultat du conseil";

  if (c.tieRound) {
    addCouncilLog(
      `Égalité initiale entre ${c.tieRound.candidates.map((id) => getPlayerById(id)?.name).join(" / ")}.`
    );
    if (c.tieRound.votes.length) {
      addCouncilLog("Revote effectué.");
    }
    if (c.rocksResult) {
      addCouncilLog("Nouvelle égalité au revote: passage aux Rocks.");
      addCouncilLog(
        `Tirage Rocks parmi ${c.rocksResult.candidates
          .map((id) => getPlayerById(id)?.name)
          .join(", ")}.`
      );
    }
  }

  if (!c.eliminatedId) {
    addCouncilLog("Impossible de déterminer un éliminé, le conseil est annulé.");
    el.councilContinueButton.textContent = "Fermer";
    c.stage = 6;
    return;
  }

  const eliminated = getPlayerById(c.eliminatedId);
  if (!eliminated) return;
  eliminatePlayer(eliminated, c.rocksResult ? "rocks" : "vote");
  updateTargetAfterVote(c.votes, eliminated.id);
  app.councilOccurredThisEpisode = true;

  addCouncilLog(`Éliminé: ${eliminated.name}${c.rocksResult ? " (Rocks)" : ""}.`);
  const table = buildVoteTable(c.votes);
  el.councilLog.appendChild(table);

  logJournal(
    "🕯️",
    "Élimination",
    `${eliminated.name} quitte l'aventure.${c.rocksResult ? " Le tirage Rocks a été fatal." : ""}`
  );
  checkEndGameState();
  renderTribesBoard();
  renderHumanTargetOptions();
  updateTopBar();
  el.councilContinueButton.textContent = "Fermer";
  c.stage = 6;
}

function runTribalCouncilPhase() {
  while (app.councilQueue.length > 0) {
    const tribeId = app.councilQueue.shift();
    const councilState = runCouncilComputation(tribeId);
    if (!councilState.players.length) {
      logJournal("🪵", "Conseil", `Le conseil de ${getTribeName(tribeId)} est annulé (aucun joueur votable).`);
      continue;
    }
    openCouncilModal(councilState);
    return true;
  }
  logJournal("🪵", "Conseil", "Aucun conseil à jouer sur cet épisode.");
  advancePhasePointer();
  updateTopBar();
  if (!app.winnerDeclared) el.nextPhaseButton.disabled = false;
  return false;
}

function checkEndGameState() {
  const alive = getAlivePlayers();
  if (alive.length === 3 && app.merged && !app.finalThreeReached) {
    app.finalThreeReached = true;
    runFinalJuryVote();
  }
}

function runFinalJuryVote() {
  const finalists = getAlivePlayers();
  const jurors = app.players.filter((p) => p.jury && !p.alive);
  if (!jurors.length) {
    const sorted = [...finalists].sort((a, b) => b.strategy + b.social - (a.strategy + a.social));
    declareWinner(sorted[0], []);
    return;
  }

  const votes = [];
  jurors.forEach((juror) => {
    const best = [...finalists]
      .map((f) => {
        const trust = juror.trust[f.id] ?? 0;
        const score = trust + f.strategy * 0.4 + f.social * 0.35 + randInt(-14, 14);
        return { finalist: f, score };
      })
      .sort((a, b) => b.score - a.score)[0];
    votes.push({ jurorId: juror.id, finalistId: best.finalist.id });
  });

  const tally = {};
  votes.forEach((vote) => {
    tally[vote.finalistId] = (tally[vote.finalistId] || 0) + 1;
  });
  const winnerId = Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0];
  const winner = getPlayerById(winnerId);
  logJournal(
    "⚖️",
    "Vote final du jury",
    `Le jury vote entre ${finalists.map((f) => f.name).join(", ")}. Dépouillement final en cours...`
  );
  declareWinner(winner, votes);
}

function declareWinner(winner, juryVotes) {
  if (!winner || app.winnerDeclared) return;
  app.winnerDeclared = true;
  const banner = document.createElement("div");
  banner.className = "winner-banner";
  banner.innerHTML = `
    <strong>🏅 Sole Survivor: ${winner.name}</strong>
    <p>Le jury a rendu son verdict final. ${winner.name} gagne la simulation Survivor.</p>
  `;
  el.journalFeed.appendChild(banner);

  if (juryVotes.length) {
    const map = juryVotes
      .map((v) => `${getPlayerById(v.jurorId)?.name} -> ${getPlayerById(v.finalistId)?.name}`)
      .join("\n");
    logJournal("📬", "Détails jury", map);
  }
  el.nextPhaseButton.disabled = true;
}

async function runCurrentPhase() {
  if (app.winnerDeclared) return;
  const phase = getCurrentPhase();
  el.nextPhaseButton.disabled = true;
  el.phaseBadge.classList.remove("phase-flash");
  void el.phaseBadge.offsetWidth;
  el.phaseBadge.classList.add("phase-flash");

  checkMergeTrigger();
  updateTopBar();

  if (phase === "returnFromCouncil") {
    runReturnFromCouncil();
  } else if (phase === "campLifeA") {
    runCampLifePhase("Vie de camp");
  } else if (phase === "rewardChallenge") {
    runRewardChallenge();
  } else if (phase === "campLifeB") {
    runCampLifePhase("Vie de camp (post-confort)");
  } else if (phase === "immunityChallenge") {
    runImmunityChallenge();
  } else if (phase === "postImmunityTalk") {
    runPostImmunityTalk();
  } else if (phase === "tribalCouncil") {
    runTribalCouncilPhase();
  }

  renderTribesBoard();
  renderHumanTargetOptions();
  updateTopBar();

  if (phase !== "tribalCouncil") {
    advancePhasePointer();
    updateTopBar();
    if (!app.winnerDeclared) {
      el.nextPhaseButton.disabled = false;
    }
  }
}

function initGame(setup) {
  app.config = setup;
  app.players = setup.players.map((sp) => createPlayerModel(sp, setup));
  app.tribes = setup.tribes;
  app.mergeTribe = setup.mergeTribe;
  app.merged = false;
  app.episode = 1;
  app.phaseIndex = 1;
  app.hasCouncilLastEpisode = false;
  app.councilQueue = [];
  app.councilInProgress = null;
  app.councilOccurredThisEpisode = false;
  app.humanPlayerId = setup.humanPlayerId;
  app.humanPendingAction = null;
  app.journalCounter = 0;
  app.jury = [];
  app.finalThreeReached = false;
  app.winnerDeclared = false;
  app.usedOneTimeAdvantages = new Set();
  app.openAi = setup.openAi;

  initializeRelations(app.players);

  el.journalFeed.innerHTML = "";
  el.setupScreen.classList.remove("active");
  el.gameScreen.classList.add("active");
  renderTribesBoard();
  renderHumanTargetOptions();
  updateTopBar();
  logJournal(
    "🚀",
    "Départ",
    `La simulation démarre avec ${setup.playerCount} joueurs en ${setup.tribeCount} tribus. Fusion prévue à ${setup.mergeAt} joueurs restants.`
  );
}

function handleStartGame() {
  const setup = getSetupData();
  const report = renderSetupDiagnostics(setup);
  if (report.blockers.length) {
    const details = report.blockers.map((issue, idx) => `${idx + 1}. ${issue.text}`).join("\n");
    alert(`La simulation ne peut pas se lancer.\n\n${details}`);
    if (typeof report.blockers[0].step === "number") {
      setSetupStep(report.blockers[0].step);
    }
    return;
  }
  initGame(setup);
}

function bindSetupEvents() {
  const syncSetupState = () => {
    syncHumanSelectFromEditors();
    renderSetupDiagnostics();
  };

  el.playerCount.addEventListener("input", () => {
    updateDivisibilityWarning();
    rebuildEditorsFromCounts();
    syncSetupState();
  });
  el.tribeCount.addEventListener("input", () => {
    updateDivisibilityWarning();
    rebuildEditorsFromCounts();
    syncSetupState();
  });
  el.mergeAt.addEventListener("input", syncSetupState);
  el.humanPlayerSelect.addEventListener("change", syncSetupState);
  el.mergeTribeName.addEventListener("input", syncSetupState);
  el.mergeTribeColor.addEventListener("input", syncSetupState);
  el.legacyPlayableAt.addEventListener("input", syncSetupState);
  el.openAiKey.addEventListener("input", syncSetupState);
  el.openAiModel.addEventListener("input", syncSetupState);
  el.idolEnabled.addEventListener("change", syncSetupState);
  el.doubleVoteEnabled.addEventListener("change", syncSetupState);
  el.voteBlockEnabled.addEventListener("change", syncSetupState);
  el.stealVoteEnabled.addEventListener("change", syncSetupState);
  el.legacyEnabled.addEventListener("change", syncSetupState);
  el.rarityDoubleVote.addEventListener("change", syncSetupState);
  el.rarityVoteBlock.addEventListener("change", syncSetupState);
  el.rarityStealVote.addEventListener("change", syncSetupState);
  el.rarityLegacy.addEventListener("change", syncSetupState);

  el.tribeEditor.addEventListener("input", (event) => {
    if (event.target?.matches?.('[data-kind="tribe-name"]')) {
      refreshPlayerTribeOptionsFromEditor();
    }
    syncSetupState();
  });
  el.playersEditor.addEventListener("input", syncSetupState);
  el.playersEditor.addEventListener("change", syncSetupState);

  el.setupStepTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const step = Number(tab.dataset.step);
      setSetupStep(step);
    });
  });
  el.prevSetupStep.addEventListener("click", () => setSetupStep(app.setupStepIndex - 1));
  el.nextSetupStep.addEventListener("click", () => setSetupStep(app.setupStepIndex + 1));

  el.resetSetup.addEventListener("click", () => {
    el.playerCount.value = "16";
    el.tribeCount.value = "2";
    el.mergeAt.value = "10";
    el.mergeTribeName.value = "Nexus";
    el.mergeTribeColor.value = "#f59e0b";
    el.idolEnabled.checked = true;
    el.doubleVoteEnabled.checked = true;
    el.voteBlockEnabled.checked = true;
    el.stealVoteEnabled.checked = true;
    el.legacyEnabled.checked = true;
    el.rarityDoubleVote.value = "veryRare";
    el.rarityVoteBlock.value = "rare";
    el.rarityStealVote.value = "veryRare";
    el.rarityLegacy.value = "veryRare";
    el.legacyPlayableAt.value = "7";
    el.openAiKey.value = "";
    el.openAiModel.value = "gpt-4.1-mini";
    buildSetupEditors();
    syncSetupState();
  });
  el.startGame.addEventListener("click", handleStartGame);
}

function bindGameEvents() {
  el.nextPhaseButton.addEventListener("click", runCurrentPhase);
  el.applyHumanAction.addEventListener("click", applyHumanAction);
  el.closeTargetModal.addEventListener("click", closeTargetModal);
  el.closeCouncilModal.addEventListener("click", () => {
    if (!resolveCouncilPhaseAdvance()) {
      addCouncilLog("Le conseil doit être mené jusqu'au résultat avant de fermer la fenêtre.");
    }
  });
  el.councilContinueButton.addEventListener("click", () => {
    const c = app.councilInProgress;
    if (!c) return;
    if (resolveCouncilPhaseAdvance()) {
      return;
    }
    councilStageRunner();
  });
  el.ballotCard.addEventListener("click", handleBallotReveal);
}

function bootstrap() {
  buildSetupEditors();
  bindSetupEvents();
  bindGameEvents();
}

bootstrap();
