export function createOverlay({
  mount,
  isMobile,
  showDevPanel,
  onEnableSound,
  onThemeChange,
  onQualityChange
}) {
  mount.innerHTML = `
    <div class="lobby-root">
      <div id="viewport" class="viewport"></div>

      <div class="ui-layer">
        <div class="settings-panel ${showDevPanel ? "" : "hidden"}" data-ui>
          <h1>Lobby</h1>
          <label>
            <select id="theme-select" data-ui></select>
          </label>
          <label>
            Quality
            <select id="quality-select" data-ui>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <p id="control-hint" class="control-hint"></p>
        </div>

        <div id="portal-prompt" class="portal-prompt"></div>

        <div id="sound-gate" class="sound-gate hidden" data-ui>
          <div class="sound-card">
            <h2>Sound Is Off</h2>
            <p>Enable ambient audio and interaction SFX.</p>
            <button id="enable-sound-btn" type="button" data-ui>Enable Sound</button>
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
  const fallbackPanel = mount.querySelector("#fallback-panel");
  const controlHint = mount.querySelector("#control-hint");

  if (showDevPanel) {
    controlHint.textContent = isMobile
      ? "Mobile: drag to look, tap floor to move"
      : "Desktop: click scene, WASD move, mouse look, Esc unlock";
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
    showFallback(links) {
      fallbackPanel.classList.remove("hidden");
      fallbackPanel.innerHTML = `
        <h2>WebGL Unavailable</h2>
        <p>Your browser/device cannot run the 3D lobby. Use direct links:</p>
        <ul>
          ${links
            .map(
              (item) =>
                `<li><a href="${item.url}" target="_blank" rel="noreferrer">${item.label}</a></li>`
            )
            .join("")}
        </ul>
      `;
    },
    hideSoundGate() {
      soundGate.classList.add("hidden");
    },
    showSoundGate() {
      soundGate.classList.remove("hidden");
    }
  };
}
