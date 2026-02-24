function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function toFiniteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function readText(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed || fallback;
}

export function createOverlay({
  mount,
  isMobile,
  showDevPanel,
  showThemePanel = showDevPanel,
  onEnableSound,
  onThemeChange,
  onQualityChange
}) {
  const settingsVisible = showDevPanel || showThemePanel;
  const qualityHiddenClass = showDevPanel ? "" : "hidden";
  const hintHiddenClass = showDevPanel ? "" : "hidden";

  mount.innerHTML = `
    <div class="lobby-root">
      <div id="viewport" class="viewport"></div>

      <div class="ui-layer">
        <div class="settings-panel ${settingsVisible ? "" : "hidden"}" data-ui>
          <h1>Lobby</h1>
          <label>
            <select id="theme-select" data-ui></select>
          </label>
          <label class="${qualityHiddenClass}">
            Quality
            <select id="quality-select" data-ui>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <p id="control-hint" class="control-hint ${hintHiddenClass}"></p>
        </div>

        <div id="portal-prompt" class="portal-prompt"></div>

        <div id="diegetic-hud" class="diegetic-hud" aria-live="polite">
          <section id="stability-meter" class="stability-meter hidden">
            <div class="stability-head">
              <span id="stability-label" class="stability-label">Stability</span>
              <span id="stability-reading" class="stability-reading">100%</span>
            </div>
            <div
              id="stability-track"
              class="stability-track"
              role="meter"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow="100"
            >
              <span id="stability-fill" class="stability-fill"></span>
            </div>
            <p id="stability-status" class="stability-status">Stable</p>
          </section>

          <section id="objectives-panel" class="objectives-panel hidden">
            <h2 id="objectives-title">Objectives</h2>
            <p id="objectives-subtitle" class="objectives-subtitle hidden"></p>
            <ul id="objectives-list" class="objectives-list"></ul>
          </section>
        </div>

        <div id="sound-gate" class="sound-gate hidden" data-ui>
          <div class="sound-card">
            <h2>Sound Is Off</h2>
            <p>Enable ambient audio and interaction SFX.</p>
            <button id="enable-sound-btn" type="button" data-ui>Enable Sound</button>
          </div>
        </div>

        <div id="loading-panel" class="loading-panel hidden" aria-live="polite" data-ui>
          <div class="loading-card">
            <h2 id="loading-title">Entering Lobby</h2>
            <p id="loading-message">Preparing liminal architecture.</p>
            <div
              id="loading-track"
              class="loading-track"
              role="progressbar"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuetext="Preparing liminal architecture."
            >
              <span class="loading-pulse"></span>
            </div>
          </div>
        </div>

        <div id="fallback-panel" class="fallback-panel hidden" data-ui></div>
      </div>
    </div>
  `;

  const viewport = mount.querySelector("#viewport");
  const themeSelect = mount.querySelector("#theme-select");
  const qualitySelect = mount.querySelector("#quality-select");
  const portalPrompt = mount.querySelector("#portal-prompt");
  const soundGate = mount.querySelector("#sound-gate");
  const enableSoundButton = mount.querySelector("#enable-sound-btn");
  const loadingPanel = mount.querySelector("#loading-panel");
  const loadingTitle = mount.querySelector("#loading-title");
  const loadingMessage = mount.querySelector("#loading-message");
  const loadingTrack = mount.querySelector("#loading-track");
  const fallbackPanel = mount.querySelector("#fallback-panel");
  const controlHint = mount.querySelector("#control-hint");
  const stabilityMeter = mount.querySelector("#stability-meter");
  const stabilityLabel = mount.querySelector("#stability-label");
  const stabilityReading = mount.querySelector("#stability-reading");
  const stabilityTrack = mount.querySelector("#stability-track");
  const stabilityFill = mount.querySelector("#stability-fill");
  const stabilityStatus = mount.querySelector("#stability-status");
  const objectivesPanel = mount.querySelector("#objectives-panel");
  const objectivesTitle = mount.querySelector("#objectives-title");
  const objectivesSubtitle = mount.querySelector("#objectives-subtitle");
  const objectivesList = mount.querySelector("#objectives-list");

  if (showDevPanel) {
    controlHint.textContent = isMobile
      ? "Mobile: drag to look, tap floor to move"
      : "Desktop: click scene, WASD move, mouse look, Esc unlock";
  }

  let objectiveOrder = [];
  const objectiveMap = new Map();
  let objectivesPanelVisible = false;

  function resolveStabilityState(value, explicitState) {
    const override = readText(explicitState, "");
    if (override) {
      return override.toLowerCase();
    }
    if (value <= 0.26) {
      return "critical";
    }
    if (value <= 0.5) {
      return "low";
    }
    return "stable";
  }

  function normalizeObjective(entry, indexHint = 0) {
    const idBase = readText(entry?.id, "");
    const id = idBase || `objective-${indexHint + 1}`;
    const target = Number.isFinite(entry?.target) && entry.target > 0 ? entry.target : null;
    const rawProgress = Number.isFinite(entry?.progress) ? Math.max(0, entry.progress) : null;
    const progress = target ? clamp(rawProgress ?? 0, 0, target) : rawProgress;
    return {
      id,
      label: readText(entry?.label, id),
      detail: readText(entry?.detail, ""),
      progress,
      target,
      completed: Boolean(entry?.completed),
      failed: Boolean(entry?.failed),
      optional: Boolean(entry?.optional),
      active: entry?.active !== false,
      hidden: Boolean(entry?.hidden)
    };
  }

  function setObjectivesPanelVisible(visible) {
    objectivesPanelVisible = Boolean(visible);
    objectivesPanel.classList.toggle("hidden", !objectivesPanelVisible);
  }

  function setObjectivesPanelTitle(title, subtitle = "") {
    objectivesTitle.textContent = readText(title, "Objectives");
    const safeSubtitle = readText(subtitle, "");
    objectivesSubtitle.textContent = safeSubtitle;
    objectivesSubtitle.classList.toggle("hidden", !safeSubtitle);
  }

  function createObjectiveItem(entry) {
    const item = document.createElement("li");
    item.className = "objectives-item";
    item.dataset.objectiveId = entry.id;
    if (entry.completed) {
      item.classList.add("is-complete");
    } else if (entry.failed) {
      item.classList.add("is-failed");
    } else if (entry.active) {
      item.classList.add("is-active");
    }
    if (entry.optional) {
      item.classList.add("is-optional");
    }

    const line = document.createElement("div");
    line.className = "objectives-line";

    const label = document.createElement("span");
    label.className = "objectives-item-label";
    label.textContent = entry.label;
    line.appendChild(label);

    const progress = document.createElement("span");
    progress.className = "objectives-item-progress";
    if (entry.completed) {
      progress.textContent = "Done";
    } else if (entry.failed) {
      progress.textContent = "Lost";
    } else if (entry.target) {
      const value = clamp(toFiniteNumber(entry.progress, 0), 0, entry.target);
      progress.textContent = `${Math.round(value)}/${Math.round(entry.target)}`;
    } else if (entry.optional) {
      progress.textContent = "Optional";
    } else {
      progress.textContent = "";
    }
    line.appendChild(progress);
    item.appendChild(line);

    if (entry.detail) {
      const detail = document.createElement("p");
      detail.className = "objectives-item-detail";
      detail.textContent = entry.detail;
      item.appendChild(detail);
    }

    return item;
  }

  function renderObjectives() {
    objectivesList.innerHTML = "";
    let visibleCount = 0;
    for (const id of objectiveOrder) {
      const objective = objectiveMap.get(id);
      if (!objective || objective.hidden) {
        continue;
      }
      objectivesList.appendChild(createObjectiveItem(objective));
      visibleCount += 1;
    }
    if (!visibleCount) {
      const emptyState = document.createElement("li");
      emptyState.className = "objectives-item is-empty";
      emptyState.textContent = "No active objectives";
      objectivesList.appendChild(emptyState);
    }
  }

  function setObjectives(entries) {
    objectiveMap.clear();
    objectiveOrder = [];
    const source = Array.isArray(entries) ? entries : [];
    for (let index = 0; index < source.length; index += 1) {
      const entry = normalizeObjective(source[index], index);
      if (objectiveMap.has(entry.id)) {
        continue;
      }
      objectiveMap.set(entry.id, entry);
      objectiveOrder.push(entry.id);
    }
    renderObjectives();
  }

  function setObjectiveState(id, patch = {}) {
    const safeId = readText(id, "");
    if (!safeId) {
      return false;
    }
    const current = objectiveMap.get(safeId);
    const normalizedPatch = normalizeObjective(
      {
        ...(current || { id: safeId, label: safeId }),
        ...(patch || {}),
        id: safeId
      },
      objectiveOrder.length
    );
    objectiveMap.set(safeId, normalizedPatch);
    if (!objectiveOrder.includes(safeId)) {
      objectiveOrder.push(safeId);
    }
    renderObjectives();
    return true;
  }

  function clearObjectives() {
    objectiveMap.clear();
    objectiveOrder = [];
    renderObjectives();
  }

  function setStabilityMeter(value, options = {}) {
    const level = clamp01(toFiniteNumber(value, 0));
    const percentage = Math.round(level * 100);
    const label = readText(options?.label, "Stability");
    const status = readText(options?.status, "");
    const state = resolveStabilityState(level, options?.state);
    const visible = options?.visible === undefined ? true : Boolean(options.visible);

    stabilityMeter.classList.toggle("hidden", !visible);
    stabilityMeter.dataset.state = state;
    stabilityLabel.textContent = label;
    stabilityReading.textContent = `${percentage}%`;
    stabilityFill.style.width = `${percentage}%`;
    stabilityTrack.setAttribute("aria-valuenow", String(percentage));
    stabilityTrack.setAttribute("aria-label", label);
    stabilityStatus.textContent = status || state;
  }

  function showStabilityMeter() {
    stabilityMeter.classList.remove("hidden");
  }

  function hideStabilityMeter() {
    stabilityMeter.classList.add("hidden");
  }

  function setObjectivesPanel({
    title,
    subtitle,
    objectives,
    visible
  } = {}) {
    if (title !== undefined || subtitle !== undefined) {
      setObjectivesPanelTitle(title, subtitle);
    }
    if (objectives !== undefined) {
      setObjectives(objectives);
    }
    if (visible !== undefined) {
      setObjectivesPanelVisible(visible);
    }
  }

  function setLoadingState({ visible = true, title, message } = {}) {
    if (title !== undefined) {
      loadingTitle.textContent = readText(title, "Entering Lobby");
    }
    if (message !== undefined) {
      const safeMessage = readText(message, "Preparing liminal architecture.");
      loadingMessage.textContent = safeMessage;
      loadingTrack.setAttribute("aria-valuetext", safeMessage);
    }
    loadingPanel.classList.toggle("hidden", !Boolean(visible));
  }

  function hideLoading() {
    loadingPanel.classList.add("hidden");
  }

  function normalizeFallbackLinks(links) {
    const seen = new Set();
    const output = [];
    for (const item of Array.isArray(links) ? links : []) {
      const label = readText(item?.label, "");
      const url = readText(item?.url, "");
      if (!label || !url || seen.has(url)) {
        continue;
      }
      output.push({ label, url });
      seen.add(url);
    }
    return output;
  }

  async function handleRetryClick(button, handler, label) {
    button.disabled = true;
    button.textContent = "Retrying...";
    try {
      await handler();
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  }

  function showFallback(links, options = {}) {
    const safeLinks = normalizeFallbackLinks(links);
    const title = readText(options?.title, "WebGL Unavailable");
    const message = readText(
      options?.message,
      "Your browser/device cannot run the 3D lobby. Use direct links:"
    );
    const detail = readText(options?.detail, "");
    const retryLabel = readText(options?.retryLabel, "Retry");
    const retryHandler = typeof options?.onRetry === "function" ? options.onRetry : null;

    fallbackPanel.classList.remove("hidden");
    fallbackPanel.innerHTML = "";

    const heading = document.createElement("h2");
    heading.textContent = title;
    fallbackPanel.appendChild(heading);

    const messageText = document.createElement("p");
    messageText.textContent = message;
    fallbackPanel.appendChild(messageText);

    if (detail) {
      const detailText = document.createElement("p");
      detailText.className = "fallback-detail";
      detailText.textContent = detail;
      fallbackPanel.appendChild(detailText);
    }

    if (safeLinks.length) {
      const list = document.createElement("ul");
      for (const item of safeLinks) {
        const listItem = document.createElement("li");
        const link = document.createElement("a");
        link.href = item.url;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.textContent = item.label;
        listItem.appendChild(link);
        list.appendChild(listItem);
      }
      fallbackPanel.appendChild(list);
    }

    if (retryHandler) {
      const retryButton = document.createElement("button");
      retryButton.type = "button";
      retryButton.className = "fallback-retry";
      retryButton.textContent = retryLabel;
      retryButton.addEventListener("click", () =>
        handleRetryClick(retryButton, retryHandler, retryLabel)
      );
      fallbackPanel.appendChild(retryButton);
    }
  }

  function hideFallback() {
    fallbackPanel.classList.add("hidden");
    fallbackPanel.innerHTML = "";
  }

  enableSoundButton.addEventListener("click", async () => {
    if (onEnableSound) {
      await onEnableSound();
    }
  });

  qualitySelect.addEventListener("change", () => {
    if (onQualityChange) {
      onQualityChange(qualitySelect.value);
    }
  });

  themeSelect.addEventListener("change", () => {
    if (onThemeChange) {
      onThemeChange(themeSelect.value);
    }
  });

  return {
    viewport,
    setThemeOptions(entries, selected) {
      const seen = new Set();
      const safeEntries = [];
      for (const entry of Array.isArray(entries) ? entries : []) {
        const id = typeof entry?.id === "string" ? entry.id.trim() : "";
        if (!id || seen.has(id)) {
          continue;
        }
        const label =
          typeof entry?.label === "string" && entry.label.trim()
            ? entry.label.trim()
            : id;
        safeEntries.push({ id, label });
        seen.add(id);
      }
      if (!safeEntries.length) {
        safeEntries.push({ id: "lobby", label: "Lobby" });
      }

      themeSelect.innerHTML = "";
      for (const entry of safeEntries) {
        const option = document.createElement("option");
        option.value = entry.id;
        option.textContent = entry.label;
        if (entry.id === selected) {
          option.selected = true;
        }
        themeSelect.appendChild(option);
      }
      if (![...themeSelect.options].some((option) => option.value === themeSelect.value)) {
        themeSelect.value = safeEntries[0].id;
      }
    },
    setTheme(value) {
      themeSelect.value = value;
    },
    setQuality(value) {
      qualitySelect.value = value;
    },
    setPortalPrompt(portal) {
      if (!portal) {
        portalPrompt.textContent = "";
        return;
      }
      portalPrompt.textContent = portal.label;
    },
    setPointerLockState(locked) {
      if (isMobile || !showDevPanel) {
        return;
      }
      controlHint.textContent = locked
        ? "WASD move • Click portal to open • Esc to unlock"
        : "Click scene to focus • WASD move • Mouse look";
    },
    showLoading(messageOrOptions) {
      if (typeof messageOrOptions === "string") {
        setLoadingState({ visible: true, message: messageOrOptions });
        return;
      }
      setLoadingState({
        visible: true,
        ...(messageOrOptions && typeof messageOrOptions === "object" ? messageOrOptions : {})
      });
    },
    hideLoading() {
      hideLoading();
    },
    setLoadingState(state) {
      setLoadingState(state);
    },
    showFallback(links, options) {
      showFallback(links, options);
    },
    hideFallback() {
      hideFallback();
    },
    hideSoundGate() {
      soundGate.classList.add("hidden");
    },
    showSoundGate() {
      soundGate.classList.remove("hidden");
    },
    setStabilityMeter(value, options) {
      setStabilityMeter(value, options);
    },
    showStabilityMeter() {
      showStabilityMeter();
    },
    hideStabilityMeter() {
      hideStabilityMeter();
    },
    setObjectivesPanelVisible(visible) {
      setObjectivesPanelVisible(visible);
    },
    setObjectivesPanelTitle(title, subtitle) {
      setObjectivesPanelTitle(title, subtitle);
    },
    setObjectives(entries) {
      setObjectives(entries);
    },
    setObjectiveState(id, patch) {
      return setObjectiveState(id, patch);
    },
    clearObjectives() {
      clearObjectives();
    },
    setObjectivesPanel(panelState) {
      setObjectivesPanel(panelState);
    }
  };
}
