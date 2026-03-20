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
  enableInspectPanel = showDevPanel,
  devMenu = null,
  onEnableSound,
  onInspectAction,
  onThemeChange,
  onQualityChange
}) {
  const settingsVisible = showDevPanel || showThemePanel;
  const qualityHiddenClass = showDevPanel ? "" : "hidden";
  const hintHiddenClass = showDevPanel ? "" : "hidden";
  const themeHiddenClass = showThemePanel ? "" : "hidden";
  const devPanelHiddenClass = devMenu?.enabled ? "" : "hidden";
  const devModeLabel = devMenu?.writable ? "Local Write" : "Read Only";
  const editorSupported = Boolean(devMenu?.editorSupported);
  const editorActive = Boolean(devMenu?.editorActive);
  const editorButtonLabel = editorActive ? "Close Editor" : "Open Editor";
  const editorNote = editorSupported
    ? editorActive
      ? "Editor is active. RMB look plus Q/W/E/R editing is available, with create/duplicate/delete tools, local session saves, and scene override export."
      : "Local editor is available here. It opens the current scene authoring shell for selecting, creating, moving, and exporting scene overrides."
    : "Editor is local-only. Open this app on localhost or the Vite dev server to use it.";

  mount.innerHTML = `
    <div class="lobby-root">
      <div id="viewport" class="viewport"></div>

      <div class="ui-layer">
        <div class="settings-panel ${settingsVisible ? "" : "hidden"}" data-ui>
          <div class="settings-panel-headline" data-ui>
            <p class="settings-kicker" data-ui>Seperet Lobby</p>
            <div class="settings-title-row" data-ui>
              <div data-ui>
                <h1 data-ui>Command Deck</h1>
                <p class="settings-summary" data-ui>Runtime controls, world-state HUD, and local authoring live here without taking over the whole screen.</p>
              </div>
              <span class="settings-mode-pill" data-ui>${isMobile ? "Touch Runtime" : "Desktop Runtime"}</span>
            </div>
          </div>
          <div class="settings-panel-grid" data-ui>
            <section class="settings-card settings-card-runtime" data-ui>
              <div class="settings-card-head" data-ui>
                <h2 data-ui>Session Controls</h2>
                <p data-ui>Theme, quality, and movement context.</p>
              </div>
              <label class="${themeHiddenClass}">
                Theme
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
            </section>

            <section id="dev-panel" class="dev-panel settings-card ${devPanelHiddenClass}" data-ui>
              <div class="dev-panel-head">
                <div data-ui>
                  <h2>Config Console</h2>
                  <p class="dev-panel-subtitle" data-ui>Local-only editing and runtime reload tools.</p>
                </div>
                <span id="dev-mode-badge" class="dev-mode-badge">${devModeLabel}</span>
              </div>
              <label class="dev-label">
                Config
                <select id="dev-config-file" data-ui></select>
              </label>
              <label class="dev-label">
                Load Source
                <select id="dev-config-source" data-ui>
                  <option value="effective">Effective</option>
                  <option value="local">Local Override</option>
                  <option value="defaults">Deploy Defaults</option>
                </select>
              </label>
              <textarea
                id="dev-config-editor"
                class="dev-config-editor"
                spellcheck="false"
                data-ui
              ></textarea>
              <p id="dev-config-status" class="dev-config-status">
                Local save writes to public/config. Deploy save writes to public/config.defaults.
              </p>
              <div class="dev-actions">
                <button id="dev-load-btn" type="button" data-ui>Reload</button>
                <button id="dev-save-local-btn" type="button" data-ui>Set Local</button>
                <button id="dev-save-defaults-btn" type="button" data-ui>Save Deploy</button>
                <button id="dev-delete-local-btn" type="button" data-ui>Clear Local</button>
                <button id="dev-reload-runtime-btn" type="button" data-ui>Reload App</button>
                <button
                  id="dev-editor-toggle-btn"
                  type="button"
                  data-ui
                  ${editorSupported ? "" : "disabled"}
                >${editorButtonLabel}</button>
              </div>
              <p id="dev-editor-note" class="dev-config-status" data-tone="${editorSupported ? "info" : "muted"}">
                ${editorNote}
              </p>
            </section>
          </div>
        </div>

        <div id="portal-prompt" class="portal-prompt" role="status" aria-live="polite"></div>

        <div
          id="inspect-panel"
          class="inspect-panel hidden${enableInspectPanel ? "" : " hidden"}"
          data-ui
          role="dialog"
          aria-modal="false"
          aria-labelledby="inspect-title"
          tabindex="-1"
        >
          <article class="inspect-card" data-ui>
            <button id="inspect-close-btn" class="inspect-close" type="button" data-ui>
              Close
            </button>
            <h2 id="inspect-title" class="inspect-title"></h2>
            <p id="inspect-description" class="inspect-description hidden"></p>
            <div id="inspect-tags" class="inspect-tags hidden"></div>
            <div id="inspect-actions" class="inspect-actions hidden"></div>
          </article>
        </div>

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
          <div class="sound-chip">
            <span id="sound-status-text">Sound Off</span>
            <button id="enable-sound-btn" type="button" data-ui>Enable</button>
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
  const inspectPanel = mount.querySelector("#inspect-panel");
  const inspectCloseButton = mount.querySelector("#inspect-close-btn");
  const inspectTitle = mount.querySelector("#inspect-title");
  const inspectDescription = mount.querySelector("#inspect-description");
  const inspectTags = mount.querySelector("#inspect-tags");
  const inspectActions = mount.querySelector("#inspect-actions");
  const soundGate = mount.querySelector("#sound-gate");
  const soundStatusText = mount.querySelector("#sound-status-text");
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
  const devConfigFile = mount.querySelector("#dev-config-file");
  const devConfigSource = mount.querySelector("#dev-config-source");
  const devConfigEditor = mount.querySelector("#dev-config-editor");
  const devConfigStatus = mount.querySelector("#dev-config-status");
  const devLoadButton = mount.querySelector("#dev-load-btn");
  const devSaveLocalButton = mount.querySelector("#dev-save-local-btn");
  const devSaveDefaultsButton = mount.querySelector("#dev-save-defaults-btn");
  const devDeleteLocalButton = mount.querySelector("#dev-delete-local-btn");
  const devReloadRuntimeButton = mount.querySelector("#dev-reload-runtime-btn");
  const devEditorToggleButton = mount.querySelector("#dev-editor-toggle-btn");
  const devEditorNote = mount.querySelector("#dev-editor-note");

  if (showDevPanel) {
    controlHint.textContent = isMobile
      ? "Mobile: drag to look, tap floor to move"
      : "Desktop: click scene, WASD move, mouse look, Esc unlock";
  }

  let objectiveOrder = [];
  const objectiveMap = new Map();
  let objectivesPanelVisible = false;
  let activeDevFile = "";
  let devBusy = false;
  let lastInspectFocus = null;

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

  function setDevStatus(message, tone = "muted") {
    if (!devConfigStatus) {
      return;
    }
    devConfigStatus.textContent = readText(message, "");
    devConfigStatus.dataset.tone = readText(tone, "muted");
  }

  function setDevButtonsDisabled(disabled) {
    const next = Boolean(disabled);
    for (const element of [
      devLoadButton,
      devSaveLocalButton,
      devSaveDefaultsButton,
      devDeleteLocalButton,
      devReloadRuntimeButton,
      devConfigFile,
      devConfigSource
    ]) {
      if (element) {
        element.disabled = next;
      }
    }
  }

  function setDevWriteButtonsEnabled(enabled) {
    const next = Boolean(enabled);
    if (devSaveLocalButton) {
      devSaveLocalButton.disabled = !next;
    }
    if (devSaveDefaultsButton) {
      devSaveDefaultsButton.disabled = !next;
    }
    if (devDeleteLocalButton) {
      devDeleteLocalButton.disabled = !next;
    }
    if (devConfigEditor) {
      devConfigEditor.readOnly = !next;
    }
  }

  function setDevEditorState() {
    if (devEditorToggleButton) {
      devEditorToggleButton.textContent = Boolean(devMenu?.editorActive) ? "Close Editor" : "Open Editor";
      devEditorToggleButton.disabled = !Boolean(devMenu?.editorSupported) || devBusy;
    }
    if (devEditorNote) {
      const supported = Boolean(devMenu?.editorSupported);
      const active = Boolean(devMenu?.editorActive);
      devEditorNote.textContent = supported
        ? active
          ? "Editor is active. RMB look plus Q/W/E/R editing is available, with create/duplicate/delete tools, local session saves, and scene override export."
          : "Local editor is available here. It opens the current scene authoring shell for selecting, creating, moving, and exporting scene overrides."
        : "Editor is local-only. Open this app on localhost or the Vite dev server to use it.";
      devEditorNote.dataset.tone = supported ? "info" : "muted";
    }
  }

  async function loadDevConfig(requestedSource = null) {
    if (!devMenu?.enabled || typeof devMenu.loadConfig !== "function" || !devConfigFile) {
      return false;
    }

    const fileName = readText(devConfigFile.value, "");
    if (!fileName) {
      return false;
    }

    activeDevFile = fileName;
    devBusy = true;
    setDevButtonsDisabled(true);
    setDevStatus(`Loading ${fileName}...`, "info");

    try {
      const payload = await devMenu.loadConfig(fileName, requestedSource || devConfigSource?.value || "effective");
      if (devConfigEditor) {
        devConfigEditor.value = payload?.text || "";
      }
      if (devConfigSource) {
        devConfigSource.value = payload?.source || requestedSource || devConfigSource.value;
      }
      const sourceLabel = readText(payload?.source, "effective");
      const localState = payload?.hasLocal ? "local override present" : "no local override";
      setDevStatus(`${fileName} loaded from ${sourceLabel}. ${localState}.`, "success");
      return true;
    } catch (error) {
      setDevStatus(error instanceof Error ? error.message : "Failed to load config.", "error");
      return false;
    } finally {
      devBusy = false;
      setDevButtonsDisabled(false);
      setDevWriteButtonsEnabled(Boolean(devMenu?.writable));
      setDevEditorState();
    }
  }

  async function saveDevConfig(target) {
    if (!devMenu?.enabled || typeof devMenu.saveConfig !== "function" || !devConfigEditor || devBusy) {
      return false;
    }

    const fileName = readText(devConfigFile?.value || activeDevFile, "");
    if (!fileName) {
      return false;
    }

    devBusy = true;
    setDevButtonsDisabled(true);
    setDevStatus(`Saving ${fileName} to ${target}...`, "info");

    try {
      await devMenu.saveConfig(fileName, target, devConfigEditor.value);
      await loadDevConfig(target === "defaults" ? "defaults" : "local");
      setDevStatus(
        target === "defaults"
          ? `${fileName} saved to deploy defaults. Push to publish it.`
          : `${fileName} saved as a local override.`,
        "success"
      );
      return true;
    } catch (error) {
      setDevStatus(error instanceof Error ? error.message : "Failed to save config.", "error");
      return false;
    } finally {
      devBusy = false;
      setDevButtonsDisabled(false);
      setDevWriteButtonsEnabled(Boolean(devMenu?.writable));
      setDevEditorState();
    }
  }

  async function deleteLocalDevConfig() {
    if (!devMenu?.enabled || typeof devMenu.deleteConfig !== "function" || devBusy) {
      return false;
    }

    const fileName = readText(devConfigFile?.value || activeDevFile, "");
    if (!fileName) {
      return false;
    }

    devBusy = true;
    setDevButtonsDisabled(true);
    setDevStatus(`Clearing local override for ${fileName}...`, "info");

    try {
      await devMenu.deleteConfig(fileName, "local");
      await loadDevConfig("effective");
      setDevStatus(`${fileName} local override cleared.`, "success");
      return true;
    } catch (error) {
      setDevStatus(error instanceof Error ? error.message : "Failed to clear local override.", "error");
      return false;
    } finally {
      devBusy = false;
      setDevButtonsDisabled(false);
      setDevWriteButtonsEnabled(Boolean(devMenu?.writable));
      setDevEditorState();
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

  function normalizeInspectData(data) {
    if (!data || typeof data !== "object") {
      return null;
    }

    const title = readText(data.title, "");
    if (!title) {
      return null;
    }

    const description = readText(data.description, "");
    const tags = Array.isArray(data.tags)
      ? data.tags.map((entry) => readText(entry, "")).filter(Boolean).slice(0, 12)
      : [];
    const actions = Array.isArray(data.actions)
      ? data.actions
          .map((entry) => ({
            label: readText(entry?.label, "Open"),
            type: readText(entry?.type, entry?.url ? "url" : "").toLowerCase(),
            url: readText(entry?.url, ""),
            theme: readText(entry?.theme, ""),
            secretId: readText(entry?.secretId, ""),
            portalId: readText(entry?.portalId, ""),
            message: readText(entry?.message, readText(entry?.prompt, "")),
            moduleIds: Array.isArray(entry?.moduleIds)
              ? entry.moduleIds.map((value) => readText(value, "")).filter(Boolean).slice(0, 8)
              : readText(entry?.moduleId, "")
                ? [readText(entry?.moduleId, "")]
                : [],
            position: Array.isArray(entry?.position)
              ? entry.position.slice(0, 3).map((value) => toFiniteNumber(value, 0))
              : null,
            yaw: toFiniteNumber(entry?.yaw, null),
            pitch: toFiniteNumber(entry?.pitch, null),
            steps: Array.isArray(entry?.steps) ? entry.steps : null,
            closeOnRun: entry?.closeOnRun !== false
          }))
          .filter(
            (entry) =>
              entry.url ||
              entry.theme ||
              entry.secretId ||
              entry.portalId ||
              entry.message ||
              entry.moduleIds.length ||
              entry.position ||
              entry.steps?.length ||
              entry.type
          )
          .slice(0, 6)
      : [];

    return {
      title,
      description,
      tags,
      actions
    };
  }

  function hideInspectPanel() {
    inspectPanel.classList.add("hidden");
    inspectTitle.textContent = "";
    inspectDescription.textContent = "";
    inspectDescription.classList.add("hidden");
    inspectTags.innerHTML = "";
    inspectTags.classList.add("hidden");
    inspectActions.innerHTML = "";
    inspectActions.classList.add("hidden");
    if (
      lastInspectFocus &&
      typeof lastInspectFocus.focus === "function" &&
      document.contains(lastInspectFocus)
    ) {
      lastInspectFocus.focus();
    }
    lastInspectFocus = null;
  }

  function showInspectPanel(data) {
    if (!enableInspectPanel) {
      hideInspectPanel();
      return false;
    }
    const normalized = normalizeInspectData(data);
    if (!normalized) {
      hideInspectPanel();
      return false;
    }

    inspectTitle.textContent = normalized.title;

    inspectDescription.textContent = normalized.description;
    inspectDescription.classList.toggle("hidden", !normalized.description);

    inspectTags.innerHTML = "";
    for (const tag of normalized.tags) {
      const chip = document.createElement("span");
      chip.className = "inspect-tag";
      chip.textContent = tag;
      inspectTags.appendChild(chip);
    }
    inspectTags.classList.toggle("hidden", !normalized.tags.length);

    inspectActions.innerHTML = "";
    for (const action of normalized.actions) {
      const isUrlAction = action.type === "url" && action.url;
      if (isUrlAction) {
        const link = document.createElement("a");
        link.className = "inspect-action";
        link.href = action.url;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.textContent = action.label;
        link.dataset.ui = "true";
        inspectActions.appendChild(link);
        continue;
      }

      const button = document.createElement("button");
      button.className = "inspect-action";
      button.type = "button";
      button.textContent = action.label;
      button.dataset.ui = "true";
      button.addEventListener("click", async () => {
        if (typeof onInspectAction !== "function") {
          return;
        }
        const handled = await onInspectAction(action);
        if (handled !== false && action.closeOnRun !== false) {
          hideInspectPanel();
        }
      });
      inspectActions.appendChild(button);
    }
    inspectActions.classList.toggle("hidden", !normalized.actions.length);

    if (!inspectPanel.contains(document.activeElement)) {
      lastInspectFocus = document.activeElement;
    }
    inspectPanel.classList.remove("hidden");
    queueMicrotask(() => {
      inspectCloseButton?.focus?.();
    });
    return true;
  }

  function setDevConfigFiles(entries) {
    if (!devMenu?.enabled) {
      return;
    }

    const nextEntries = Array.isArray(entries) ? entries : [];
    const previousValue = readText(devConfigFile?.value, "");
    devConfigFile.innerHTML = "";
    for (const entry of nextEntries) {
      const fileName = readText(entry?.fileName, "");
      if (!fileName) {
        continue;
      }
      const option = document.createElement("option");
      option.value = fileName;
      option.textContent = readText(entry?.label, fileName);
      devConfigFile.appendChild(option);
    }

    if (!devConfigFile.options.length) {
      const option = document.createElement("option");
      option.value = "scene.json";
      option.textContent = "Scene";
      devConfigFile.appendChild(option);
    }

    const hasPrevious = [...devConfigFile.options].some((option) => option.value === previousValue);
    devConfigFile.value = hasPrevious ? previousValue : devConfigFile.options[0].value;
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

  inspectCloseButton.addEventListener("click", () => {
    hideInspectPanel();
  });

  if (devMenu?.enabled) {
    setDevConfigFiles(devMenu.configFiles);

    setDevWriteButtonsEnabled(Boolean(devMenu.writable));
    setDevEditorState();
    setDevStatus(
      devMenu.writable
        ? "Edit JSON here, then save locally or directly to deploy defaults."
        : "Read-only mode. Open local dev to save config files from this panel.",
      "muted"
    );

    devConfigFile.addEventListener("change", () => {
      loadDevConfig().catch(() => {});
    });
    devConfigSource.addEventListener("change", () => {
      loadDevConfig(devConfigSource.value).catch(() => {});
    });
    devLoadButton.addEventListener("click", () => {
      loadDevConfig().catch(() => {});
    });
    devSaveLocalButton.addEventListener("click", () => {
      saveDevConfig("local").catch(() => {});
    });
    devSaveDefaultsButton.addEventListener("click", () => {
      saveDevConfig("defaults").catch(() => {});
    });
    devDeleteLocalButton.addEventListener("click", () => {
      deleteLocalDevConfig().catch(() => {});
    });
    devReloadRuntimeButton.addEventListener("click", () => {
      devMenu.reloadRuntime?.();
    });
    devEditorToggleButton?.addEventListener("click", () => {
      devMenu.toggleEditor?.();
    });

    loadDevConfig().catch(() => {});
  }

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
      portalPrompt.textContent = readText(portal.label, "");
    },
    showInspectPanel(data) {
      return showInspectPanel(data);
    },
    hideInspectPanel() {
      hideInspectPanel();
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
      if (soundStatusText) {
        soundStatusText.textContent = "Sound On";
      }
      soundGate.classList.add("hidden");
    },
    showSoundGate() {
      if (soundStatusText) {
        soundStatusText.textContent = "Sound Off";
      }
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
    setDevConfigFiles(entries) {
      setDevConfigFiles(entries);
    },
    setObjectivesPanel(panelState) {
      setObjectivesPanel(panelState);
    }
  };
}
