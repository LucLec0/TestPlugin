(() => {
  const {
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
  } = window.SurvivorCore;

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

  function getCurrentPhase() {
    return PHASE_ORDER[app.phaseIndex];
  }

  function logJournal(emoji, title, text, phaseOverride = getCurrentPhase(), episodeOverride = app.episode) {
    app.journalCounter += 1;
    const frag = el.journalEntryTemplate.content.cloneNode(true);
    const entry = frag.querySelector(".journal-entry");
    const phaseText = PHASE_LABELS[phaseOverride] || phaseOverride || "Phase";
    frag.querySelector(".meta").textContent = `${emoji} ${title} • Épisode ${episodeOverride} • ${phaseText}`;
    frag.querySelector("p").innerHTML = styleTextForJournal(text);
    if (entry) entry.classList.add("new-phase-entry");
    if (el.journalFeed.firstChild) {
      el.journalFeed.insertBefore(frag, el.journalFeed.firstChild);
    } else {
      el.journalFeed.appendChild(frag);
    }
    el.journalFeed.scrollTop = 0;
    if (entry) {
      void entry.offsetHeight;
    }
  }

  function addCouncilLog(text) {
    const node = document.createElement("article");
    node.className = "journal-entry";
    node.innerHTML = `<header><span class="meta">🔥 Conseil</span></header><p>${styleTextForJournal(text)}</p>`;
    if (el.councilLog.firstChild) {
      el.councilLog.insertBefore(node, el.councilLog.firstChild);
    } else {
      el.councilLog.appendChild(node);
    }
    el.councilLog.scrollTop = 0;
  }

  function clearJournalEntryHighlights() {
    el.journalFeed.querySelectorAll(".journal-entry.new-phase-entry").forEach((entry) => {
      entry.classList.remove("new-phase-entry");
    });
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

  function updateTopBar() {
    el.episodeBadge.textContent = `Épisode ${app.episode}`;
    el.phaseBadge.textContent = `Phase: ${PHASE_LABELS[getCurrentPhase()]}`;
    el.aliveCounter.textContent = `Joueurs restants: ${getAlivePlayers().length}`;
  }

  function getTribeName(tribeId) {
    if (app.mergeTribe?.id === tribeId) return app.mergeTribe.name;
    const tribe = app.tribes.find((t) => t.id === tribeId);
    return tribe ? tribe.name : "Inconnu";
  }

  function getTribeColor(tribeId) {
    if (app.mergeTribe?.id === tribeId) return app.mergeTribe.color;
    const tribe = app.tribes.find((t) => t.id === tribeId);
    return tribe?.color || "#93c5fd";
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function styleTextForJournal(text) {
    let output = text;
    const sortedTribes = [...app.tribes, app.mergeTribe].filter(Boolean);
    sortedTribes.forEach((tribe) => {
      const color = getTribeColor(tribe.id);
      if (!tribe?.name) return;
      const re = new RegExp(`\\b${escapeRegExp(tribe.name)}\\b`, "g");
      output = output.replace(
        re,
        `<span class="tribe-token" style="--tribe-color:${color}">${tribe.name}</span>`
      );
    });
    app.players.forEach((player) => {
      const color = getTribeColor(player.tribeId);
      if (!player?.name) return;
      const re = new RegExp(`\\b${escapeRegExp(player.name)}\\b`, "g");
      output = output.replace(
        re,
        `<strong class="player-token" style="--tribe-color:${color}">${player.name}</strong>`
      );
    });
    return output;
  }

  function recordTargetSnapshot() {
    const alive = getAlivePlayers();
    app.targetHistoryByEpisode[app.episode] = app.targetHistoryByEpisode[app.episode] || {};
    alive.forEach((player) => {
      app.targetHistoryByEpisode[app.episode][player.id] = Math.round(player.target);
    });
  }

  function drawTargetHistoryChart(tribeId) {
    const canvas = el.targetChartCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || canvas.width;
    const height = canvas.clientHeight || canvas.height;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const margin = { top: 16, right: 18, bottom: 26, left: 34 };
    const chartW = width - margin.left - margin.right;
    const chartH = height - margin.top - margin.bottom;
    if (chartW <= 0 || chartH <= 0) return;

    ctx.strokeStyle = "rgba(147,197,253,0.2)";
    ctx.lineWidth = 1;
    for (let y = 0; y <= 5; y += 1) {
      const yy = margin.top + (chartH * y) / 5;
      ctx.beginPath();
      ctx.moveTo(margin.left, yy);
      ctx.lineTo(width - margin.right, yy);
      ctx.stroke();
      const value = 100 - y * 20;
      ctx.fillStyle = "rgba(226,232,240,0.8)";
      ctx.font = "11px Inter, sans-serif";
      ctx.fillText(`${value}`, 4, yy + 4);
    }

    const episodes = Object.keys(app.targetHistoryByEpisode)
      .map(Number)
      .sort((a, b) => a - b);
    if (!episodes.length) return;
    const minEpisode = episodes[0];
    const maxEpisode = episodes[episodes.length - 1];
    const span = Math.max(1, maxEpisode - minEpisode);

    const players = app.players.filter((p) => p.tribeId === tribeId);
    el.targetChartLegend.innerHTML = "";
    players.forEach((player) => {
      const color = getTribeColor(player.tribeId);
      const points = [];
      episodes.forEach((ep) => {
        const value = app.targetHistoryByEpisode[ep]?.[player.id];
        if (typeof value !== "number") return;
        const x = margin.left + ((ep - minEpisode) / span) * chartW;
        const y = margin.top + chartH - (value / 100) * chartH;
        points.push({ x, y, ep, value });
      });
      if (points.length < 2) return;

      ctx.strokeStyle = color;
      ctx.lineWidth = player.id === app.humanPlayerId ? 3 : 2;
      ctx.beginPath();
      points.forEach((pt, idx) => {
        if (idx === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();

      ctx.fillStyle = color;
      points.forEach((pt) => {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, player.id === app.humanPlayerId ? 3.5 : 2.5, 0, Math.PI * 2);
        ctx.fill();
      });

      const legendItem = document.createElement("span");
      legendItem.className = "target-legend-item";
      legendItem.innerHTML = `<i style="background:${color}"></i>${player.name}${player.id === app.humanPlayerId ? " (Humain)" : ""}`;
      el.targetChartLegend.appendChild(legendItem);
    });

    ctx.fillStyle = "rgba(226,232,240,0.85)";
    ctx.font = "11px Inter, sans-serif";
    episodes.forEach((ep) => {
      const x = margin.left + ((ep - minEpisode) / span) * chartW;
      ctx.fillText(`E${ep}`, x - 8, height - 8);
    });
  }

  function formatPlayerNameInList(player) {
    const color = getTribeColor(player.tribeId);
    const humanBadge = player.id === app.humanPlayerId ? " 👤" : "";
    return `<strong class="player-token" style="--tribe-color:${color}">${player.name}</strong>${humanBadge}`;
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
        if (player.id === app.humanPlayerId) li.classList.add("human-player-highlight");
        li.innerHTML = `
        <span>${formatPlayerNameInList(player)}</span>
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
    if (!human) {
      el.humanActionTarget.innerHTML = "";
      return;
    }
    const alive = getAlivePlayers().filter((p) => p.id !== app.humanPlayerId);
    const sameTribe = app.merged ? alive : alive.filter((p) => p.tribeId === human.tribeId);
    const options = sameTribe;
    el.humanActionTarget.innerHTML = options
      .map((p) => `<option value="${p.id}">${p.name}</option>`)
      .join("");
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
    drawTargetHistoryChart(tribeId);
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

  function applyHumanAction() {
    const human = getPlayerById(app.humanPlayerId);
    if (!human || !human.alive) return;
    const type = el.humanActionType.value;
    const target = getPlayerById(el.humanActionTarget.value);
    if (!app.merged && target && target.tribeId !== human.tribeId) {
      logJournal("⛔", "Action refusée", `${human.name} ne peut interagir qu'avec sa propre tribu avant la fusion.`);
      return;
    }
    app.humanPendingAction = { type, targetId: target?.id ?? null };
    logJournal("🧭", "Directive joueur", `Action préparée: ${human.name} -> ${describeHumanAction(app.humanPendingAction)}`);
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

  function formatAdvantageName(type) {
    if (type === "doubleVote") return "Double vote";
    if (type === "voteBlock") return "Annule vote";
    if (type === "stealVote") return "Steal vote";
    if (type === "legacy") return "Legacy";
    if (type === "idol") return "Idole";
    return type;
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

    const shuffledPool = shuffle(pool);
    for (const candidate of shuffledPool) {
      if (chance(RARITY_CHANCE[candidate.rarity] || 0.22)) {
        const added = addAdvantage(
          winner,
          candidate.type,
          candidate.type === "legacy" ? { playableAt: candidate.playableAt } : {}
        );
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
      guidance
        ? `La directive joueur influence les dynamiques: ${guidance.slice(0, 120)}.`
        : "Aucune directive spécifique, le social domine les décisions."
    ];
    return fragments.join(" ");
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

  function computeChallengeWinner(players, kind) {
    const scored = players.map((p) => ({
      player: p,
      score: p.challenge + randInt(-20, 22) + (kind === "immunity" ? p.strategy / 5 : p.social / 8)
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored[0].player;
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
      const score = players.reduce((acc, p) => acc + p.challenge + randInt(-8, 8), 0) / Math.max(players.length, 1);
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
      const score = players.reduce((acc, p) => acc + p.challenge + randInt(-12, 12), 0) / Math.max(players.length, 1);
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
        tribePlayers.forEach((player) => {
          player.immunized = true;
        });
        logJournal(
          "🛡️",
          "Immunité tribale",
          `La tribu ${r.tribe.name} remporte l'immunité. Toute la tribu est protégée pour ce conseil.`
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

  function renderCouncilRunningTally(tallyMap) {
    if (!el.councilRunningTally) return;
    const entries = Object.entries(tallyMap || {})
      .map(([playerId, count]) => ({ player: getPlayerById(playerId), count }))
      .filter((entry) => entry.player)
      .sort((a, b) => b.count - a.count);

    if (!entries.length) {
      el.councilRunningTally.classList.add("hidden");
      el.councilRunningTally.innerHTML = "";
      return;
    }

    el.councilRunningTally.classList.remove("hidden");
    const lines = entries
      .map(
        (entry) =>
          `<span class="running-tally-chip">${formatPlayerNameInList(entry.player)} : <strong>${entry.count}</strong></span>`
      )
      .join("");
    el.councilRunningTally.innerHTML = `<h4>Résultat actuel du dépouillement</h4><div class="running-tally-row">${lines}</div>`;
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
      phaseResolved: false,
      runningTally: {}
    };
    el.councilTitle.textContent = `Conseil Tribal - ${getTribeName(councilState.tribeId)}`;
    el.councilLog.innerHTML = "";
    el.councilReveal.classList.add("hidden");
    if (el.councilRunningTally) {
      el.councilRunningTally.classList.add("hidden");
      el.councilRunningTally.innerHTML = "";
    }
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
            addCouncilLog(`${getPlayerById(action.actorId).name} vole le vote de ${getPlayerById(action.targetId).name}.`);
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
    c.runningTally = c.runningTally || {};
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
    if (ballot.counted) {
      c.runningTally[ballot.targetId] = (c.runningTally[ballot.targetId] || 0) + ballot.weight;
    }
    renderCouncilRunningTally(c.runningTally);

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

  function checkEndGameState() {
    const alive = getAlivePlayers();
    if (alive.length === 3 && app.merged && !app.finalThreeReached) {
      app.finalThreeReached = true;
      runFinalJuryVote();
    }
  }

  function finalizeCouncilResult(c) {
    el.councilStepInfo.textContent = "5/5 - Résultat du conseil";

    if (c.tieRound) {
      addCouncilLog(`Égalité initiale entre ${c.tieRound.candidates.map((id) => getPlayerById(id)?.name).join(" / ")}.`);
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
    renderCouncilRunningTally(c.runningTally);
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
      const map = juryVotes.map((v) => `${getPlayerById(v.jurorId)?.name} -> ${getPlayerById(v.finalistId)?.name}`).join("\n");
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
      if (app.phaseIndex === 0 || app.phaseIndex === 1) {
        recordTargetSnapshot();
      }
      clearJournalEntryHighlights();
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
    app.targetHistoryByEpisode = {};
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
    recordTargetSnapshot();
    logJournal(
      "🚀",
      "Départ",
      `La simulation démarre avec ${setup.playerCount} joueurs en ${setup.tribeCount} tribus. Fusion prévue à ${setup.mergeAt} joueurs restants.`
    );
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
    if (el.targetModal) {
      el.targetModal.addEventListener("close", clearJournalEntryHighlights);
    }
    window.addEventListener("resize", () => {
      if (el.targetModal.open) {
        const title = el.targetModalTitle.textContent || "";
        const tribe = [...app.tribes, app.mergeTribe].find((t) => title.includes(t?.name || ""));
        if (tribe) drawTargetHistoryChart(tribe.id);
      }
    });
  }

  window.SurvivorGameplay = {
    bindGameEvents,
    initGame,
    applyHumanAction,
    runCurrentPhase,
    closeTargetModal
  };
})();
