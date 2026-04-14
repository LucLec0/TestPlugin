(() => {
  const {
    DEFAULT_NAMES,
    DEFAULT_TRIBES,
    DEFAULT_OPENAI_KEY,
    app,
    el,
    clamp
  } = window.SurvivorCore;

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
        key: (el.openAiKey.value || DEFAULT_OPENAI_KEY).trim(),
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

    addInfo(`OpenAI actif avec le modèle: ${setup.openAi.model}.`);
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

  function buildSetupEditors() {
    const state = createDefaultSetup();
    renderTribeEditor(state.tribes);
    renderPlayersEditor(state.players, state.tribes);
    renderHumanSelect(state.players);
    updateDivisibilityWarning();
    setSetupStep(0);
    renderSetupDiagnostics();
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
      el.openAiKey.value = DEFAULT_OPENAI_KEY;
      el.openAiModel.value = "gpt-4.1-mini";
      buildSetupEditors();
      syncSetupState();
    });
  }

  window.SurvivorSetup = {
    buildSetupEditors,
    bindSetupEvents,
    getSetupData,
    renderSetupDiagnostics,
    validateSetup,
    validateSetupDetailed,
    setSetupStep,
    renderHumanSelect
  };
})();
