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
      energy: randInt(50, 100),
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
        const value = 0;
        player.trust[other.id] = value;
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

  function appendPublicMemory(memoryEntry) {
    app.gameMemory.publicEvents.push(memoryEntry);
    if (app.gameMemory.publicEvents.length > 240) {
      app.gameMemory.publicEvents = app.gameMemory.publicEvents.slice(-240);
    }
  }

  function appendHiddenMemory(memoryEntry) {
    app.gameMemory.hiddenEvents.push(memoryEntry);
    if (app.gameMemory.hiddenEvents.length > 520) {
      app.gameMemory.hiddenEvents = app.gameMemory.hiddenEvents.slice(-520);
    }
  }

  function registerPrivateChatMessage(playerId, role, text) {
    appendHiddenMemory({
      type: "private-chat",
      playerId,
      role,
      text,
      episode: app.episode,
      phase: getCurrentPhase()
    });
  }

  function gatherPublicMemory(limit = 14) {
    return app.gameMemory.publicEvents.slice(-limit);
  }

  function gatherHiddenMemoryForPlayer(playerId, limit = 20) {
    return app.gameMemory.hiddenEvents.filter((entry) => !entry.playerId || entry.playerId === playerId).slice(-limit);
  }

  function describePlayerStateForPrompt(player, perspectivePlayer = null) {
    if (!player) return "Inconnu";
    const trustVsPerspective =
      perspectivePlayer && perspectivePlayer.id !== player.id ? perspectivePlayer.trust[player.id] ?? 0 : null;
    const trustPercent = trustVsPerspective === null ? null : Math.round((trustVsPerspective + 100) / 2);
    return `${player.name} [tribu=${getTribeName(player.tribeId)}, cible=${Math.round(
      player.target
    )}, énergie=${Math.round(player.energy ?? 0)}, immunisé=${player.immunized ? "oui" : "non"}${
      trustPercent === null ? "" : `, confiance=${trustPercent}%`
    }, avantages=${(player.advantages || []).map((a) => a.type).join("/") || "aucun"}]`;
  }

  function buildStrategicContextForChat(human, aiPlayer) {
    const tribePlayers = getAliveByTribe(aiPlayer.tribeId).filter((p) => p.id !== aiPlayer.id);
    const keyThreats = [...tribePlayers].sort((a, b) => b.target - a.target).slice(0, 3);
    const trusted = [...tribePlayers]
      .sort((a, b) => (aiPlayer.trust[b.id] ?? 0) - (aiPlayer.trust[a.id] ?? 0))
      .slice(0, 3);
    const distrusted = [...tribePlayers]
      .sort((a, b) => (aiPlayer.trust[a.id] ?? 0) - (aiPlayer.trust[b.id] ?? 0))
      .slice(0, 3);
    const allianceNames = [...aiPlayer.alliances]
      .map((id) => getPlayerById(id))
      .filter(Boolean)
      .map((p) => p.name)
      .slice(0, 6);
    return {
      keyThreats,
      trusted,
      distrusted,
      allianceNames,
      recentCouncil: app.gameMemory.councilHistory.slice(-4),
      publicMemory: gatherPublicMemory(16),
      hiddenMemory: gatherHiddenMemoryForPlayer(aiPlayer.id, 24),
      humanState: describePlayerStateForPrompt(human, aiPlayer),
      aiState: describePlayerStateForPrompt(aiPlayer),
      pendingUnanswered: app.chatState.pendingReplies[aiPlayer.id] || 0
    };
  }

  function applyRelationshipShift(a, b, trustDeltaA, trustDeltaB, targetDeltaA = 0, targetDeltaB = 0) {
    increaseTrust(a, b, trustDeltaA);
    increaseTrust(b, a, trustDeltaB);
    if (targetDeltaA) applyTargetDelta(a, targetDeltaA);
    if (targetDeltaB) applyTargetDelta(b, targetDeltaB);
    maybeCreateAlliance(a, b);
    maybeBreakAlliance(a, b);
  }

  function applyEnergyDelta(player, delta) {
    if (!player) return;
    player.energy = clamp((player.energy ?? 60) + delta, 0, 100);
  }

  function logCouncilHistoryEntry(councilState, eliminated, scoreboardText) {
    const votes = councilState.votes.map((vote) => {
      const voter = getPlayerById(vote.voterId)?.name || "Inconnu";
      const target = getPlayerById(vote.targetId)?.name || "Inconnu";
      return `${voter} -> ${target}${vote.source === "bonus" ? " (bonus)" : ""}`;
    });
    app.gameMemory.councilHistory.push({
      episode: app.episode,
      tribeId: councilState.tribeId,
      eliminatedId: eliminated?.id || null,
      eliminatedName: eliminated?.name || "Inconnu",
      scoreboardText,
      votes
    });
    if (app.gameMemory.councilHistory.length > 140) {
      app.gameMemory.councilHistory = app.gameMemory.councilHistory.slice(-140);
    }
  }

  function degradePendingReplies() {
    const human = getPlayerById(app.humanPlayerId);
    if (!human || !human.alive) return;
    Object.entries(app.chatState.pendingReplies || {}).forEach(([playerId, count]) => {
      if (!count || count <= 0) return;
      const ai = getPlayerById(playerId);
      if (!ai || !ai.alive) return;
      if (!app.merged && ai.tribeId !== human.tribeId) return;
      const penalty = Math.min(2 + count, 7);
      increaseTrust(ai, human, -penalty);
      if (count >= 2) applyTargetDelta(human, 1);
    });
  }

  function runGeneratedPhaseEvents(label, tribeScopeIds = null) {
    const alive = getAlivePlayers();
    if (alive.length < 2) return;
    const base = Math.max(5, Math.min(15, Math.floor(alive.length / 1.4)));
    const eventsCount = randInt(base, Math.min(15, base + 3));
    const possibleTribes = tribeScopeIds?.length ? tribeScopeIds : [...new Set(alive.map((p) => p.tribeId))];
    const publicTemplates = [
      {
        emoji: "💥",
        title: "Grosse dispute",
        text: (a, b) => `${a.name} et ${b.name} se disputent violemment devant le camp.`,
        effect: (a, b) => {
          applyRelationshipShift(a, b, -18, -16, 2, 2);
          applyEnergyDelta(a, -8);
          applyEnergyDelta(b, -7);
        }
      },
      {
        emoji: "📢",
        title: "Annonce risquée",
        text: (a, b) => `${a.name} annonce publiquement vouloir voter contre ${b.name}.`,
        effect: (a, b) => {
          applyRelationshipShift(a, b, -12, -20, 2, 4);
          applyTargetDelta(a, 3);
          applyEnergyDelta(a, -5);
        }
      },
      {
        emoji: "🤝",
        title: "Promesse publique",
        text: (a, b) => `${a.name} promet publiquement de protéger ${b.name} jusqu'au prochain vote.`,
        effect: (a, b) => {
          applyRelationshipShift(a, b, 12, 9, 1, -1);
          applyEnergyDelta(a, -2);
          applyEnergyDelta(b, 2);
        }
      }
    ];
    const hiddenTemplates = [
      {
        title: "Pacte secret",
        text: (a, b) => `${a.name} et ${b.name} concluent un pacte discret.`,
        effect: (a, b) => applyRelationshipShift(a, b, 10, 10, -1, -1)
      },
      {
        title: "Rumeur ciblée",
        text: (a, b, c) => `${a.name} souffle à ${b.name} que ${c.name} prépare un blindside.`,
        effect: (a, b, c) => {
          applyRelationshipShift(a, b, 7, 6, 0, 0);
          increaseTrust(b, c, -10);
          applyTargetDelta(c, 3);
        }
      },
      {
        title: "Négociation de vote",
        text: (a, b) => `${a.name} et ${b.name} alignent discrètement leur prochain vote.`,
        effect: (a, b) => applyRelationshipShift(a, b, 8, 8, 1, 1)
      },
      {
        title: "Mensonge stratégique",
        text: (a, b) => `${a.name} ment à ${b.name} pour détourner les soupçons.`,
        effect: (a, b) => {
          increaseTrust(b, a, -8);
          applyTargetDelta(a, 1);
          applyTargetDelta(b, 1);
        }
      }
    ];
    for (let i = 0; i < eventsCount; i += 1) {
      const tribeId = pickRandom(possibleTribes);
      const tribePlayers = alive.filter((p) => p.tribeId === tribeId);
      if (tribePlayers.length < 2) continue;
      const actor = pickRandom(tribePlayers);
      const target = pickRandom(tribePlayers.filter((p) => p.id !== actor.id));
      if (!actor || !target) continue;
      const isPublic = chance(0.25);
      if (isPublic) {
        const tpl = pickRandom(publicTemplates);
        tpl.effect(actor, target);
        const txt = tpl.text(actor, target);
        logJournal(tpl.emoji, `${label} • ${tpl.title}`, txt);
        appendPublicMemory({
          type: "public-event",
          title: tpl.title,
          text: txt,
          episode: app.episode,
          phase: getCurrentPhase()
        });
        continue;
      }
      const tpl = pickRandom(hiddenTemplates);
      const third = pickRandom(tribePlayers.filter((p) => p.id !== actor.id && p.id !== target.id));
      tpl.effect(actor, target, third || target);
      appendHiddenMemory({
        type: "hidden-event",
        playerId: actor.id,
        title: tpl.title,
        text: tpl.text(actor, target, third || target),
        episode: app.episode,
        phase: getCurrentPhase()
      });
    }
  }

  function renderCouncilResultPanel(councilState, eliminated) {
    if (!el.councilResultPanel || !el.councilResultEliminated || !el.councilResultScore || !el.councilResultSummary) return;
    const countedEntries = Object.entries(councilState.tally?.counted || {})
      .map(([playerId, count]) => ({ player: getPlayerById(playerId), count }))
      .filter((entry) => entry.player)
      .sort((a, b) => b.count - a.count);
    const scoreText = countedEntries.length
      ? countedEntries.map((entry) => String(entry.count)).join("-")
      : "0";
    el.councilResultPanel.classList.remove("hidden");
    el.councilResultEliminated.textContent = `Éliminé : ${eliminated?.name || "Inconnu"}`;
    el.councilResultScore.textContent = `Score final : ${scoreText}`;
    const summary = councilState.votes
      .map((vote) => {
        const voter = getPlayerById(vote.voterId)?.name || "Inconnu";
        const target = getPlayerById(vote.targetId)?.name || "Inconnu";
        const marker = vote.source === "bonus" ? " (bonus)" : "";
        return `<li><strong>${escapeHtml(voter)}</strong> → ${escapeHtml(target)}${marker}</li>`;
      })
      .join("");
    el.councilResultSummary.innerHTML = `<ul class="council-result-summary-list">${summary}</ul>`;
  }

  function hideCouncilResultPanel() {
    if (!el.councilResultPanel || !el.councilResultEliminated || !el.councilResultScore || !el.councilResultSummary) return;
    el.councilResultPanel.classList.add("hidden");
    el.councilResultEliminated.textContent = "";
    el.councilResultScore.textContent = "";
    el.councilResultSummary.innerHTML = "";
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

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function styleTextForJournal(text) {
    let output = escapeHtml(text);
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

    const background = ctx.createLinearGradient(0, margin.top, 0, height - margin.bottom);
    background.addColorStop(0, "rgba(255, 255, 255, 0.95)");
    background.addColorStop(1, "rgba(236, 246, 255, 0.98)");
    ctx.fillStyle = background;
    ctx.fillRect(margin.left, margin.top, chartW, chartH);

    ctx.strokeStyle = "rgba(30, 64, 175, 0.22)";
    ctx.lineWidth = 1;
    for (let y = 0; y <= 5; y += 1) {
      const yy = margin.top + (chartH * y) / 5;
      ctx.beginPath();
      ctx.moveTo(margin.left, yy);
      ctx.lineTo(width - margin.right, yy);
      ctx.stroke();
      const value = 100 - y * 20;
      ctx.fillStyle = "rgba(30, 41, 59, 0.9)";
      ctx.font = "600 11px Inter, sans-serif";
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
    const seriesPalette = [
      "#0ea5e9",
      "#f97316",
      "#8b5cf6",
      "#10b981",
      "#e11d48",
      "#f59e0b",
      "#14b8a6",
      "#3b82f6",
      "#ef4444",
      "#6366f1"
    ];
    el.targetChartLegend.innerHTML = "";
    players.forEach((player, playerIndex) => {
      const baseColor = seriesPalette[playerIndex % seriesPalette.length];
      const color = player.id === app.humanPlayerId ? "#f59e0b" : baseColor;
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
      ctx.shadowColor = "rgba(15, 23, 42, 0.18)";
      ctx.shadowBlur = player.id === app.humanPlayerId ? 8 : 5;
      ctx.beginPath();
      points.forEach((pt, idx) => {
        if (idx === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.fillStyle = color;
      points.forEach((pt) => {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, player.id === app.humanPlayerId ? 4 : 3, 0, Math.PI * 2);
        ctx.fill();
      });

      const legendItem = document.createElement("span");
      legendItem.className = "target-legend-item";
      legendItem.innerHTML = `<i style="background:${color}"></i>${player.name}${player.id === app.humanPlayerId ? " (Humain)" : ""}`;
      el.targetChartLegend.appendChild(legendItem);
    });

    ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
    ctx.font = "600 11px Inter, sans-serif";
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

  function getTrustBandStyle(percent) {
    if (percent >= 95) return { color: "#ec4899", label: "Adoration" };
    if (percent >= 80) return { color: "#a855f7", label: "Alliance forte" };
    if (percent >= 70) return { color: "#22c55e", label: "Alliance solide" };
    if (percent >= 51) return { color: "#3b82f6", label: "Positif / ami" };
    if (percent >= 50) return { color: "#ffffff", label: "Neutre" };
    if (percent >= 40) return { color: "#fde047", label: "Méfiant" };
    if (percent >= 20) return { color: "#f97316", label: "Hostile" };
    return { color: "#ef4444", label: "Ennemi" };
  }

  function drawRelationsGraph(tribeId) {
    const canvas = el.relationsCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const nodes = getAliveByTribe(tribeId);
    if (!nodes.length) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 760;
    const height = canvas.clientHeight || 520;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = "rgba(5, 12, 30, 0.9)";
    ctx.fillRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;
    const zoom = app.relationsView?.zoom || 1;
    const radius = Math.min(width, height) * 0.36 * zoom;
    const positioned = nodes.map((player, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(nodes.length, 1) - Math.PI / 2;
      return {
        player,
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius
      };
    });

    for (let i = 0; i < positioned.length; i += 1) {
      for (let j = i + 1; j < positioned.length; j += 1) {
        const a = positioned[i];
        const b = positioned[j];
        const trustAB = a.player.trust[b.player.id] ?? 0;
        const trustBA = b.player.trust[a.player.id] ?? 0;
        const avgTrust = clamp((trustAB + trustBA) / 2, -100, 100);
        const percent = Math.round((avgTrust + 100) / 2);
        const band = getTrustBandStyle(percent);
        ctx.strokeStyle = band.color;
        ctx.lineWidth = percent >= 80 ? 2.8 : percent >= 60 ? 2 : 1.4;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    positioned.forEach((node) => {
      ctx.beginPath();
      ctx.fillStyle = "#ffffff";
      ctx.arc(node.x, node.y, node.player.id === app.humanPlayerId ? 14 : 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = getTribeColor(node.player.tribeId);
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.font = "600 12px Inter, sans-serif";
      const labelWidth = Math.max(62, ctx.measureText(node.player.name).width + 18);
      const labelX = node.x - labelWidth / 2;
      const labelY = node.y + 16;
      ctx.fillStyle = "rgba(7, 18, 43, 0.9)";
      ctx.fillRect(labelX, labelY, labelWidth, 18);
      ctx.fillStyle = "#f8fbff";
      ctx.fillText(node.player.name, labelX + 9, labelY + 12.5);
    });
  }

  function openRelationsModal(tribeId) {
    if (!el.relationsModal) return;
    app.relationsView = {
      tribeId,
      zoom: app.relationsView?.tribeId === tribeId ? app.relationsView.zoom || 1 : 1
    };
    el.relationsModalTitle.textContent = `Relations au sein de la tribu ${getTribeName(tribeId)}`;
    drawRelationsGraph(tribeId);
    el.relationsModal.showModal();
  }

  function closeRelationsModal() {
    if (el.relationsModal?.open) el.relationsModal.close();
  }

  function renderEliminatedBoard() {
    if (!el.eliminatedBoard) return;
    const eliminated = app.players
      .filter((p) => !p.alive)
      .sort((a, b) => {
        const aEp = a.eliminatedAt?.episode ?? 999;
        const bEp = b.eliminatedAt?.episode ?? 999;
        return aEp - bEp;
      });
    if (!eliminated.length) {
      el.eliminatedBoard.innerHTML = `<p class="hint">Aucun joueur éliminé pour le moment.</p>`;
      return;
    }
    el.eliminatedBoard.innerHTML = eliminated
      .map((player, idx) => {
        const rank = app.players.length - idx;
        return `
          <article class="eliminated-card">
            <strong>${escapeHtml(player.name)}</strong>
            <span>Éliminé • ${rank}e</span>
          </article>
        `;
      })
      .join("");
  }

  function renderTribesBoard() {
    el.tribesBoard.innerHTML = "";
    const tribesToShow = app.merged ? [app.mergeTribe] : app.tribes;
    const human = getPlayerById(app.humanPlayerId);
    tribesToShow.forEach((tribe) => {
      const players = getAliveByTribe(tribe.id);
      const box = document.createElement("section");
      box.className = "tribe-box";
      box.innerHTML = `
      <header>
        <div class="tribe-name">
          <span class="tribe-dot" style="background:${tribe.color}"></span>
          <strong>${tribe.name}</strong>
        </div>
        <div class="tribe-actions">
          <button class="secondary icon-button" data-open-target="${tribe.id}" title="Tableau des targets">🎯</button>
          <button class="secondary icon-button" data-open-relations="${tribe.id}" title="Tableau des liens">💗</button>
        </div>
      </header>
      <div class="players-grid"></div>
    `;
      const list = box.querySelector(".players-grid");

      players.forEach((player) => {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "player-square";
        const canChat =
          Boolean(human?.alive && player.alive && player.id !== human.id) &&
          (app.merged || player.tribeId === human.tribeId);
        if (player.immunized) card.classList.add("immune");
        if (player.id === app.humanPlayerId) card.classList.add("human-player-highlight");
        if (canChat) card.classList.add("chat-openable");
        card.style.setProperty("--tribe-color", getTribeColor(player.tribeId));
        const markers = [
          player.immunized ? "👑" : "",
          player.jury ? "⚖️" : "",
          ...player.advantages.map((a) => ADVANTAGE_EMOJI[a.type])
        ]
          .filter(Boolean)
          .join(" ");
        card.innerHTML = `
        <div class="player-square-top">
          <span class="player-square-name">${escapeHtml(player.name)}${player.id === app.humanPlayerId ? " 👤" : ""}</span>
          <span class="player-square-markers">${markers}</span>
        </div>
        <small class="player-square-tribe">${escapeHtml(tribe.name)}</small>
      `;
        if (canChat) {
          card.addEventListener("click", () => openChatWithPlayer(player.id));
        }
        list.appendChild(card);
      });
      el.tribesBoard.appendChild(box);
    });

    renderEliminatedBoard();

    el.tribesBoard.querySelectorAll("[data-open-target]").forEach((btn) => {
      btn.addEventListener("click", () => openTargetModal(btn.getAttribute("data-open-target")));
    });
    el.tribesBoard.querySelectorAll("[data-open-relations]").forEach((btn) => {
      btn.addEventListener("click", () => openRelationsModal(btn.getAttribute("data-open-relations")));
    });
  }

  function renderHumanTargetOptions() {
    renderChatLaunchArea();
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
      row.innerHTML = `
      <span>${formatPlayerNameInList(player)}</span>
      <strong>${Math.round(player.target)}%</strong>
      <div class="target-progress"><i style="width:${Math.round(player.target)}%"></i></div>
    `;
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

  async function callOpenAiText(prompt) {
    const key = String(app.openAi?.key || "").trim();
    const model = String(app.openAi?.model || "gpt-4.1-mini").trim();
    if (!key || !prompt) return "";

    if (window.location.protocol === "file:") {
      logJournal(
        "⚠️",
        "OpenAI",
        "Le chat OpenAI nécessite un serveur local (http://...), pas une ouverture directe du fichier index.html."
      );
      return "";
    }

    try {
      const response = await fetch("/api/openai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          key,
          model,
          prompt
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const details = payload?.error || `Erreur HTTP ${response.status}`;
        logJournal("⚠️", "OpenAI", `Proxy OpenAI: ${escapeHtml(details)}.`);
        return "";
      }
      const text = String(payload?.text || "").trim();
      if (text) return text;
      if (payload?.error) {
        logJournal("⚠️", "OpenAI", `Proxy OpenAI: ${escapeHtml(payload.error)}.`);
      }
      return "";
    } catch (error) {
      logJournal(
        "⚠️",
        "OpenAI",
        `Proxy OpenAI inaccessible (${escapeHtml(error?.message || "réseau")}). Lance le jeu via \"node server.js\" puis http://localhost:8080.`
      );
      return "";
    }
  }

  function getChatPersonality(playerId) {
    if (app.chatState.personalities[playerId]) return app.chatState.personalities[playerId];
    const personalities = [
      "froid et analytique",
      "honnête et direct",
      "manipulateur et ambigu",
      "social et chaleureux",
      "méfiant et discret",
      "stratège opportuniste"
    ];
    const personality = pickRandom(personalities);
    app.chatState.personalities[playerId] = personality;
    return personality;
  }

  function getConversation(playerId) {
    app.chatState.conversations[playerId] = app.chatState.conversations[playerId] || [];
    return app.chatState.conversations[playerId];
  }

  function renderChatLaunchArea() {
    if (!el.chatLaunchArea) return;
    const human = getPlayerById(app.humanPlayerId);
    if (!human || !human.alive) {
      el.chatLaunchArea.innerHTML = `<p class="hint">Le joueur humain n'est plus actif.</p>`;
      return;
    }
    const candidates = getAlivePlayers().filter((p) => p.id !== human.id && p.tribeId === human.tribeId);
    if (!candidates.length) {
      el.chatLaunchArea.innerHTML = `<p class="hint">Aucun joueur disponible dans ta tribu pour discuter.</p>`;
      return;
    }
    el.chatLaunchArea.innerHTML = candidates
      .map(
        (player) => `
        <button class="chat-launch-card" data-chat-player-id="${player.id}" style="--tribe-color:${getTribeColor(player.tribeId)}">
          <span class="name">${escapeHtml(player.name)}</span>
          ${
            (app.chatState.pendingReplies[player.id] || 0) > 0
              ? `<span class="player-square-unread">✉ ${app.chatState.pendingReplies[player.id]}</span>`
              : ""
          }
          <small>${getTribeName(player.tribeId)}</small>
        </button>
      `
      )
      .join("");
    el.chatLaunchArea.querySelectorAll("[data-chat-player-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const playerId = button.getAttribute("data-chat-player-id");
        openChatWithPlayer(playerId);
      });
    });
  }

  function renderChatFeed(playerId) {
    if (!el.chatFeed) return;
    const conversation = getConversation(playerId);
    el.chatFeed.innerHTML = "";
    if (!conversation.length) {
      const empty = document.createElement("article");
      empty.className = "journal-entry";
      empty.innerHTML = `<header><span class="meta">💬 Chat</span></header><p>Conversation vide pour le moment.</p>`;
      el.chatFeed.appendChild(empty);
      return;
    }
    conversation.forEach((message) => {
      const item = document.createElement("article");
      item.className = `journal-entry chat-entry ${message.role}`;
      item.innerHTML = `<header><span class="meta">${message.author}</span></header><p>${styleTextForJournal(message.text)}</p>`;
      el.chatFeed.appendChild(item);
    });
    el.chatFeed.scrollTop = el.chatFeed.scrollHeight;
  }

  function applyChatImpact(human, aiPlayer, humanText, aiText) {
    const combined = `${humanText} ${aiText}`.toLowerCase();
    if (/(alliance|confiance|protéger|vote ensemble|final)/.test(combined)) {
      increaseTrust(human, aiPlayer, 10);
      increaseTrust(aiPlayer, human, 8);
      maybeCreateAlliance(human, aiPlayer);
      applyTargetDelta(human, 1);
    }
    if (/(mensonge|trahir|target|cible|danger|eliminer|blindside)/.test(combined)) {
      applyTargetDelta(aiPlayer, 4);
      applyTargetDelta(human, 2);
      increaseTrust(aiPlayer, human, -5);
    }
    if (/(calme|discret|low profile|ombre)/.test(combined)) {
      applyTargetDelta(human, -2);
    }
  }

  async function buildAiChatReply(human, aiPlayer, userMessage) {
    const personality = getChatPersonality(aiPlayer.id);
    const cleanUserMessage = String(userMessage || "").replace(/[\r\n]+/g, " ").trim();
    if (!String(app.openAi?.key || "").trim()) {
      return `${aiPlayer.name} : Je note ce que tu dis. On garde ça entre nous pour l'instant.`;
    }
    const conversation = getConversation(aiPlayer.id).slice(-14);
    const history = conversation
      .map((msg) => `${msg.author}: ${msg.text}`)
      .reverse()
      .join("\n");
    const strategicContext = buildStrategicContextForChat(human, aiPlayer);
    const memoryPublic = strategicContext.publicMemory.map((e) => `- ${e.title}: ${e.text}`).join("\n");
    const memoryHidden = strategicContext.hiddenMemory.map((e) => `- ${e.title}: ${e.text}`).join("\n");
    const threatNames = strategicContext.keyThreats.map((p) => `${p.name}(${Math.round(p.target)}%)`).join(", ");
    const trustedNames = strategicContext.trusted.map((p) => p.name).join(", ");
    const distrustedNames = strategicContext.distrusted.map((p) => p.name).join(", ");
    const councilContext = strategicContext.recentCouncil
      .map(
        (c) =>
          `E${c.episode}: éliminé=${c.eliminatedName}, score=${c.scoreboardText}, votes=${(c.votes || []).slice(0, 6).join(" ; ")}`
      )
      .join("\n");
    const prompt = `Tu joues ${aiPlayer.name} dans un simulateur Survivor.
Personnalité: ${personality}.
Objectif principal: gagner la partie. Tu n'es pas loyal par défaut au joueur humain.
Tu peux mentir, manipuler, dire la vérité, trahir, proposer des plans clairs.
Tu dois tenir compte des conversations passées, des votes, des avantages, des immunités et des liens.
Contexte joueur humain: ${strategicContext.humanState}
Contexte toi (IA): ${strategicContext.aiState}
Menaces actuelles: ${threatNames || "aucune"}
Joueurs que tu apprécies: ${trustedNames || "aucun"}
Joueurs que tu suspectes: ${distrustedNames || "aucun"}
Alliances connues: ${strategicContext.allianceNames.join(", ") || "aucune"}
Messages envoyés sans réponse par l'humain: ${strategicContext.pendingUnanswered}
Conseils récents:
${councilContext || "- aucun"}
Événements publics récents:
${memoryPublic || "- aucun"}
Événements cachés connus:
${memoryHidden || "- aucun"}
Historique privé avec l'humain:
${history || "Aucun historique."}
Message reçu: ${cleanUserMessage}
Réponds en français en 1 à 4 phrases, utile, stratégique et contextuelle. Si possible, prends position claire. Tu peux faire des erreurs, mais reste cohérent.`;

    const openAiText = await callOpenAiText(prompt);
    if (openAiText) return openAiText;

    // Fallback local contextualisé si OpenAI indisponible.
    const fallbackThoughts = [
      `Tu n'as pas encore répondu à ${aiPlayer.name}; ça peut jouer contre toi.`,
      `${aiPlayer.name} pense que ${threatNames || "personne"} est une menace actuelle.`,
      `${aiPlayer.name} n'accorde pas sa confiance facilement.`,
      `${aiPlayer.name} veut un plan concret pour le prochain conseil.`
    ];
    return `${aiPlayer.name} : ${pickRandom(fallbackThoughts)}`;
  }

  function maybePushAiInitiatedMessage(playerId) {
    const human = getPlayerById(app.humanPlayerId);
    const aiPlayer = getPlayerById(playerId);
    if (!human || !aiPlayer || !human.alive || !aiPlayer.alive) return;
    if (!app.merged && aiPlayer.tribeId !== human.tribeId) return;
    if (!chance(0.22)) return;
    const conversation = getConversation(playerId);
    const suggestions = [
      "J'ai entendu ton nom circuler, reste prudent.",
      "On devrait verrouiller un vote à trois.",
      "Je ne fais pas confiance à tout le monde ici.",
      "Si on se protège mutuellement, on passe le prochain conseil."
    ];
    const text = pickRandom(suggestions);
    conversation.push({ role: "ai", author: aiPlayer.name, text });
    registerPrivateChatMessage(playerId, "ai", text);
    increaseTrust(aiPlayer, human, 3);
    applyTargetDelta(human, 1);
    app.chatState.pendingReplies[playerId] = (app.chatState.pendingReplies[playerId] || 0) + 1;
    renderTribesBoard();
    renderChatLaunchArea();
    if (app.chatState.openWithPlayerId === playerId) {
      renderChatFeed(playerId);
    }
    logJournal("💬", "Chat IA", `${aiPlayer.name} envoie un message privé à ${human.name}.`);
  }

  async function sendChatMessage() {
    const targetId = app.chatState.openWithPlayerId;
    const human = getPlayerById(app.humanPlayerId);
    const aiPlayer = getPlayerById(targetId);
    if (!human || !aiPlayer || !human.alive || !aiPlayer.alive) return;
    const userMessage = (el.chatInput?.value || "").trim();
    if (!userMessage) return;
    if (!app.merged && aiPlayer.tribeId !== human.tribeId) {
      logJournal("⛔", "Chat refusé", `${human.name} ne peut discuter qu'avec sa tribu avant la fusion.`);
      return;
    }
    const conversation = getConversation(targetId);
    conversation.push({ role: "human", author: human.name, text: userMessage });
    registerPrivateChatMessage(targetId, "human", userMessage);
    app.chatState.pendingReplies[targetId] = 0;
    renderTribesBoard();
    renderChatLaunchArea();
    if (el.chatInput) el.chatInput.value = "";
    renderChatFeed(targetId);
    const reply = await buildAiChatReply(human, aiPlayer, userMessage);
    conversation.push({ role: "ai", author: aiPlayer.name, text: reply });
    registerPrivateChatMessage(targetId, "ai", reply);
    app.chatState.pendingReplies[targetId] = (app.chatState.pendingReplies[targetId] || 0) + 1;
    renderTribesBoard();
    renderChatLaunchArea();
    renderChatFeed(targetId);
    applyChatImpact(human, aiPlayer, userMessage, reply);
    logJournal("💬", "Chat", `${human.name} discute avec ${aiPlayer.name}.`);
  }

  function openChatWithPlayer(playerId) {
    const human = getPlayerById(app.humanPlayerId);
    const target = getPlayerById(playerId);
    if (!human || !target || !human.alive || !target.alive) return;
    if (!app.merged && target.tribeId !== human.tribeId) {
      logJournal("⛔", "Chat refusé", `${human.name} ne peut discuter qu'avec sa tribu avant la fusion.`);
      return;
    }
    app.chatState.openWithPlayerId = playerId;
    app.chatState.pendingReplies[playerId] = 0;
    if (el.chatTitle) el.chatTitle.textContent = `Chat avec ${target.name}`;
    renderChatFeed(playerId);
    renderTribesBoard();
    renderChatLaunchArea();
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

  function runCampLifePhase(label) {
    const alive = getAlivePlayers();
    if (!alive.length) return;
    runGeneratedPhaseEvents(label);

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

    alive
      .filter((p) => p.id !== app.humanPlayerId)
      .forEach((p) => {
        maybePushAiInitiatedMessage(p.id);
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
    runGeneratedPhaseEvents("Discussions pré-conseil", app.councilQueue);
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

  function getCurrentImmunityStateForPrompt(player) {
    if (!player || !player.alive) return "éliminé";
    if (!player.immunized) return "vulnérable";
    return app.merged ? "immunité individuelle" : "immunité tribale";
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

  function maybeUsePreVoteAdvantage(voter, councilPlayers, strategyContext, forcedPlan = null) {
    if (forcedPlan) {
      return [...forcedPlan];
    }
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

  function consumeHumanAdvantage(human, type) {
    if (!human) return false;
    return removeAdvantage(human, type);
  }

  function cloneAdvantagesList(advantages) {
    return (advantages || []).map((adv) => ({ ...adv }));
  }

  function snapshotCouncilAdvantages(players) {
    const snap = new Map();
    players.forEach((player) => {
      snap.set(player.id, cloneAdvantagesList(player.advantages));
    });
    return snap;
  }

  function restoreCouncilAdvantages(snapshot) {
    if (!snapshot) return;
    snapshot.forEach((advantages, playerId) => {
      const player = getPlayerById(playerId);
      if (!player) return;
      player.advantages = cloneAdvantagesList(advantages);
    });
  }

  function normalizeHumanCouncilPlan(rawPlan, councilState) {
    if (!rawPlan) return null;
    const human = getPlayerById(app.humanPlayerId);
    if (!human || !human.alive) return null;
    const participantIds = new Set(councilState?.players || []);
    if (!participantIds.has(human.id)) return null;
    const candidateIds = (councilState?.players || []).filter((pid) => {
      const p = getPlayerById(pid);
      return p && p.id !== human.id && !p.immunized;
    });
    if (!candidateIds.length) return null;
    const hasValidTarget = candidateIds.includes(rawPlan.targetId);
    const fallbackTargetId = hasValidTarget ? rawPlan.targetId : candidateIds[0];
    const sanitizeTarget = (value) => (candidateIds.includes(value) ? value : candidateIds[0]);
    const idolTargetAllowed = new Set([human.id, ...candidateIds]);
    const legacyAdv = human.advantages.find((adv) => adv.type === "legacy");
    const legacyPlayableNow =
      Boolean(legacyAdv) && (legacyAdv.playableAt == null || legacyAdv.playableAt === getAlivePlayers().length);
    return {
      voterId: human.id,
      targetId: fallbackTargetId,
      useDoubleVote: Boolean(rawPlan.useDoubleVote) && human.advantages.some((adv) => adv.type === "doubleVote"),
      useVoteBlock: Boolean(rawPlan.useVoteBlock) && human.advantages.some((adv) => adv.type === "voteBlock"),
      voteBlockTargetId: sanitizeTarget(rawPlan.voteBlockTargetId),
      useStealVote: Boolean(rawPlan.useStealVote) && human.advantages.some((adv) => adv.type === "stealVote"),
      stealVoteTargetId: sanitizeTarget(rawPlan.stealVoteTargetId),
      useIdol: Boolean(rawPlan.useIdol) && human.advantages.some((adv) => adv.type === "idol"),
      idolTargetId: idolTargetAllowed.has(rawPlan.idolTargetId) ? rawPlan.idolTargetId : human.id,
      useLegacy: Boolean(rawPlan.useLegacy) && legacyPlayableNow
    };
  }

  function buildHumanCouncilUi(councilState) {
    const human = getPlayerById(app.humanPlayerId);
    if (!human || !human.alive) return null;
    if (!councilState.players.includes(human.id)) return null;
    const legacyAdv = human.advantages.find((adv) => adv.type === "legacy");
    const legacyPlayableNow =
      Boolean(legacyAdv) && (legacyAdv.playableAt == null || legacyAdv.playableAt === getAlivePlayers().length);
    const optionsList = councilState.players
      .map((id) => getPlayerById(id))
      .filter((p) => p && p.id !== human.id && !p.immunized);
    const options = optionsList.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
    if (!options) return null;
    const hasDoubleVote = human.advantages.some((a) => a.type === "doubleVote");
    const hasVoteBlock = human.advantages.some((a) => a.type === "voteBlock");
    const hasStealVote = human.advantages.some((a) => a.type === "stealVote");
    const hasIdol = human.advantages.some((a) => a.type === "idol");
    const canUseAnyAdv = hasDoubleVote || hasVoteBlock || hasStealVote || hasIdol || legacyPlayableNow;
    return `
      <div class="human-council-box">
        <h4>Ton vote au conseil</h4>
        <label>Cible principale<select id="humanCouncilVoteTarget">${options}</select></label>
        ${
          canUseAnyAdv
            ? `
        <label class="toggle"><input id="humanCouncilPlayDoubleVote" type="checkbox" ${hasDoubleVote ? "" : "disabled"} /> Jouer Double vote</label>
        <label class="toggle"><input id="humanCouncilPlayVoteBlock" type="checkbox" ${hasVoteBlock ? "" : "disabled"} /> Jouer Annule vote</label>
        <label>Cible Annule vote<select id="humanCouncilVoteBlockTarget">${options}</select></label>
        <label class="toggle"><input id="humanCouncilPlayStealVote" type="checkbox" ${hasStealVote ? "" : "disabled"} /> Jouer Steal vote</label>
        <label>Cible Steal vote<select id="humanCouncilStealVoteTarget">${options}</select></label>
        <label class="toggle"><input id="humanCouncilPlayIdol" type="checkbox" ${hasIdol ? "" : "disabled"} /> Jouer Idole</label>
        <label>Sur qui jouer l'idole
          <select id="humanCouncilIdolTarget">
            <option value="${human.id}">${escapeHtml(human.name)} (toi)</option>
            ${options}
          </select>
        </label>
        <label class="toggle"><input id="humanCouncilPlayLegacy" type="checkbox" ${
          legacyPlayableNow ? "" : "disabled"
        } /> Jouer Legacy</label>
        `
            : `<p class="hint">Aucun avantage disponible pour ce conseil.</p>`
        }
        <button id="confirmHumanCouncilButton" class="primary">Valider mon plan</button>
      </div>
    `;
  }

  function readHumanCouncilPlan(councilState, explicitPlan = null) {
    const human = getPlayerById(app.humanPlayerId);
    if (!human || !human.alive) return null;
    if (!councilState.players.includes(human.id)) return null;
    if (explicitPlan) {
      return normalizeHumanCouncilPlan(explicitPlan, councilState);
    }
    const targetId = document.getElementById("humanCouncilVoteTarget")?.value;
    if (!targetId) return null;
    const plan = {
      voterId: human.id,
      targetId,
      useDoubleVote: Boolean(document.getElementById("humanCouncilPlayDoubleVote")?.checked),
      useVoteBlock: Boolean(document.getElementById("humanCouncilPlayVoteBlock")?.checked),
      voteBlockTargetId: document.getElementById("humanCouncilVoteBlockTarget")?.value || null,
      useStealVote: Boolean(document.getElementById("humanCouncilPlayStealVote")?.checked),
      stealVoteTargetId: document.getElementById("humanCouncilStealVoteTarget")?.value || null,
      useIdol: Boolean(document.getElementById("humanCouncilPlayIdol")?.checked),
      idolTargetId: document.getElementById("humanCouncilIdolTarget")?.value || human.id,
      useLegacy: Boolean(document.getElementById("humanCouncilPlayLegacy")?.checked)
    };
    return normalizeHumanCouncilPlan(plan, councilState);
  }

  function applyHumanPlanToCouncil(councilState, blocked, stolen, doubled, explicitPlan = null) {
    const human = getPlayerById(app.humanPlayerId);
    if (!human) return [];
    const plan = readHumanCouncilPlan(councilState, explicitPlan);
    if (!plan) return [];
    const actions = [];
    const protections = [];
    if (plan.useVoteBlock && plan.voteBlockTargetId && consumeHumanAdvantage(human, "voteBlock")) {
      actions.push({ type: "voteBlock", actorId: human.id, targetId: plan.voteBlockTargetId });
      blocked.add(plan.voteBlockTargetId);
    }
    if (plan.useStealVote && plan.stealVoteTargetId && consumeHumanAdvantage(human, "stealVote")) {
      actions.push({ type: "stealVote", actorId: human.id, targetId: plan.stealVoteTargetId });
      blocked.add(plan.stealVoteTargetId);
      stolen[human.id] = (stolen[human.id] || 0) + 1;
    }
    if (plan.useDoubleVote && consumeHumanAdvantage(human, "doubleVote")) {
      actions.push({ type: "doubleVote", actorId: human.id });
      doubled.add(human.id);
    }
    if (plan.useIdol && plan.idolTargetId && consumeHumanAdvantage(human, "idol")) {
      protections.push({ type: "idol", actorId: human.id, protectedId: plan.idolTargetId });
    }
    if (plan.useLegacy && consumeHumanAdvantage(human, "legacy")) {
      protections.push({ type: "legacy", actorId: human.id, protectedId: human.id });
    }
    councilState.humanVoteTargetId = plan.targetId;
    councilState.humanProtectionActions = protections;
    return actions;
  }

  function runCouncilComputation(tribeId, humanOverride = null, options = {}) {
    const { commit = true } = options;
    const players = getCouncilPlayers(tribeId);
    const advantageSnapshot = commit ? null : snapshotCouncilAdvantages(players);
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
    const humanId = app.humanPlayerId;
    const hasHumanOverride = Boolean(humanOverride && humanOverride.voterId === humanId);
    let humanVoteTargetId = hasHumanOverride ? humanOverride.targetId : null;
    let humanProtectionActions = [];

    players.forEach((voter) => {
      if (hasHumanOverride && voter.id === humanId) return;
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
    if (hasHumanOverride) {
      const virtualCouncilState = {
        players: players.map((p) => p.id),
        humanVoteTargetId,
        humanProtectionActions: [],
        humanPlan: humanOverride
      };
      const humanActions = applyHumanPlanToCouncil(virtualCouncilState, blocked, stolen, doubled, humanOverride);
      preActions.push(...humanActions);
      humanVoteTargetId = virtualCouncilState.humanVoteTargetId || humanVoteTargetId;
      humanProtectionActions = [...(virtualCouncilState.humanProtectionActions || [])];
    }

    const votes = [];
    players.forEach((voter) => {
      if (blocked.has(voter.id)) return;
      let baseTarget = null;
      if (hasHumanOverride && voter.id === humanId) {
        const forced = getPlayerById(humanVoteTargetId);
        if (forced && forced.alive && !forced.immunized && forced.id !== voter.id) {
          baseTarget = forced;
        }
      }
      if (!baseTarget) {
        baseTarget = chooseVoteTarget(voter, players);
      }
      if (!baseTarget) return;
      const extraVotes = (doubled.has(voter.id) ? 1 : 0) + (stolen[voter.id] || 0);
      votes.push({ voterId: voter.id, targetId: baseTarget.id, weight: 1, source: "normal" });
      for (let i = 0; i < extraVotes; i += 1) {
        const nextTarget =
          hasHumanOverride && voter.id === humanId && baseTarget
            ? baseTarget
            : chooseVoteTarget(voter, players);
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
    const protections = [...humanProtectionActions];
    const aiProtections = maybeUsePostVoteProtection(players, firstCountMap, remainingCount).filter(
      (action) => !(hasHumanOverride && action.actorId === humanId)
    );
    protections.push(...aiProtections);
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

    const result = {
      tribeId,
      players: players.map((p) => p.id),
      preActions,
      votes,
      protections,
      tally,
      top,
      tieRound,
      rocksResult,
      eliminatedId: top[0] || null,
      humanOverride
    };
    if (!commit) {
      restoreCouncilAdvantages(advantageSnapshot);
    }
    return result;
  }

  function lockCouncilComputation(councilState) {
    if (!councilState || councilState.computationLocked) return councilState;
    const participantSet = new Set(councilState.players || []);
    let humanPlan = councilState.humanPlan || null;
    if (!humanPlan && participantSet.has(app.humanPlayerId)) {
      humanPlan = readHumanCouncilPlan(councilState);
    }
    const committed = runCouncilComputation(councilState.tribeId, humanPlan, { commit: true });
    const nextState = {
      ...councilState,
      ...committed,
      humanPlan,
      revealIndex: 0,
      revealSequence: shuffle([...(committed.tally?.visible || [])]),
      stage: 0,
      phaseResolved: false,
      runningTally: {},
      computationLocked: true
    };
    return nextState;
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
    const previewState = runCouncilComputation(councilState.tribeId, null, { commit: false });
    app.councilInProgress = {
      ...councilState,
      ...previewState,
      revealIndex: 0,
      revealSequence: shuffle([...(previewState.tally?.visible || [])]),
      stage: 0,
      phaseResolved: false,
      runningTally: {},
      humanPlan: null,
      computationLocked: false
    };
    el.councilTitle.textContent = `Conseil Tribal - ${getTribeName(councilState.tribeId)}`;
    el.councilLog.innerHTML = "";
    el.councilReveal.classList.add("hidden");
    if (el.councilRunningTally) {
      el.councilRunningTally.classList.add("hidden");
      el.councilRunningTally.innerHTML = "";
    }
    hideCouncilResultPanel();
    el.councilContinueButton.classList.remove("hidden");
    el.councilContinueButton.textContent = "Commencer le conseil";
    renderCouncilParticipants(councilState);
    el.humanCouncilControls.innerHTML = "";
    const humanUi = buildHumanCouncilUi(app.councilInProgress);
    if (humanUi) {
      el.humanCouncilControls.innerHTML = humanUi;
      const confirmButton = document.getElementById("confirmHumanCouncilButton");
      if (confirmButton) {
        confirmButton.addEventListener("click", () => {
          const plan = readHumanCouncilPlan(app.councilInProgress);
          if (!plan) {
            addCouncilLog("Plan de vote humain invalide.");
            return;
          }
          const recomputed = runCouncilComputation(councilState.tribeId, plan, { commit: false });
          app.councilInProgress = {
            ...app.councilInProgress,
            ...recomputed,
            humanPlan: plan,
            revealIndex: 0,
            revealSequence: shuffle([...(recomputed.tally?.visible || [])]),
            stage: 0,
            phaseResolved: false,
            runningTally: {},
            computationLocked: false
          };
          addCouncilLog("Plan humain confirmé. Le conseil est recalculé avec ton vote.");
          el.humanCouncilControls.innerHTML = "<p class=\"hint\">Plan validé. Tu peux lancer le vote.</p>";
        });
      }
    }
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
    let c = app.councilInProgress;
    if (!c) return;
    if (c.stage === 0 && !c.computationLocked) {
      c = lockCouncilComputation(c);
      app.councilInProgress = c;
      if (el.humanCouncilControls && c.humanPlan) {
        el.humanCouncilControls.innerHTML = "<p class=\"hint\">Plan verrouillé pour ce conseil.</p>";
      }
    }
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
      hideCouncilResultPanel();
      el.councilContinueButton.textContent = "Fermer";
      c.stage = 6;
      return;
    }

    const eliminated = getPlayerById(c.eliminatedId);
    if (!eliminated) return;
    eliminatePlayer(eliminated, c.rocksResult ? "rocks" : "vote");
    updateTargetAfterVote(c.votes, eliminated.id);
    app.councilOccurredThisEpisode = true;

    const countedEntries = Object.entries(c.tally?.counted || {})
      .map(([playerId, count]) => ({ player: getPlayerById(playerId), count }))
      .filter((entry) => entry.player)
      .sort((a, b) => b.count - a.count);
    const scoreboardText = countedEntries.length ? countedEntries.map((entry) => String(entry.count)).join("-") : "0";
    addCouncilLog(`Éliminé: ${eliminated.name}${c.rocksResult ? " (Rocks)" : ""}.`);
    renderCouncilRunningTally(c.runningTally);
    const table = buildVoteTable(c.votes);
    el.councilLog.appendChild(table);
    renderCouncilResultPanel(c, eliminated);
    logCouncilHistoryEntry(c, eliminated, scoreboardText);

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
      const players = getCouncilPlayers(tribeId);
      if (!players.length) {
        logJournal("🪵", "Conseil", `Le conseil de ${getTribeName(tribeId)} est annulé (aucun joueur votable).`);
        continue;
      }
      const draftState = {
        tribeId,
        players: players.map((p) => p.id),
        preActions: [],
        votes: [],
        protections: [],
        tally: { visible: [], counted: {} },
        top: [],
        tieRound: null,
        rocksResult: null,
        eliminatedId: null
      };
      openCouncilModal(draftState);
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

    degradePendingReplies();
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
    app.chatState = {
      openWithPlayerId: null,
      conversations: {},
      personalities: {},
      pendingReplies: {}
    };
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
    el.closeTargetModal.addEventListener("click", closeTargetModal);

    if (el.closeRelationsModal) {
      el.closeRelationsModal.addEventListener("click", closeRelationsModal);
    }
    if (el.relationsZoomIn) {
      el.relationsZoomIn.addEventListener("click", () => {
        const tribeId = app.relationsView?.tribeId;
        if (!tribeId) return;
        app.relationsView.zoom = clamp((app.relationsView.zoom || 1) + 0.1, 0.6, 1.6);
        drawRelationsGraph(tribeId);
      });
    }
    if (el.relationsZoomOut) {
      el.relationsZoomOut.addEventListener("click", () => {
        const tribeId = app.relationsView?.tribeId;
        if (!tribeId) return;
        app.relationsView.zoom = clamp((app.relationsView.zoom || 1) - 0.1, 0.6, 1.6);
        drawRelationsGraph(tribeId);
      });
    }
    if (el.relationsResetView) {
      el.relationsResetView.addEventListener("click", () => {
        const tribeId = app.relationsView?.tribeId;
        if (!tribeId) return;
        app.relationsView.zoom = 1;
        drawRelationsGraph(tribeId);
      });
    }
    if (el.chatSendButton) {
      el.chatSendButton.addEventListener("click", sendChatMessage);
    }
    if (el.chatInput) {
      el.chatInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          sendChatMessage();
        }
      });
    }
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
      if (el.relationsModal?.open && app.relationsView?.tribeId) {
        drawRelationsGraph(app.relationsView.tribeId);
      }
    });
  }

  window.SurvivorGameplay = {
    bindGameEvents,
    initGame,
    runCurrentPhase,
    closeTargetModal
  };
})();
