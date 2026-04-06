import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";

const EDITOR_STATE_STORAGE_KEY = "lobby.editor.state.v1";
const DEFAULT_TRANSLATE_SNAP = 0.25;
const DEFAULT_ROTATE_SNAP_DEG = 15;
const DEFAULT_SCALE_SNAP = 0.1;

function readText(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed || fallback;
}

function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

function toRounded(value, digits = 4) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Number(numeric.toFixed(digits));
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.map((entry) => readText(entry, "")).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}

function isEditableTarget(target) {
  return Boolean(
    target?.tagName === "INPUT" ||
      target?.tagName === "TEXTAREA" ||
      target?.tagName === "SELECT" ||
      target?.isContentEditable
  );
}

function normalizeEditorOverrides(payload) {
  const state = normalizeSavedState(payload);
  return {
    version: 3,
    createdProps: state.createdProps,
    props: state.props,
    hiddenProps: normalizeStringList(state.hiddenProps),
    hiddenGeneratedNodes: normalizeStringList(state.hiddenGeneratedNodes)
  };
}

function hasEditorOverrideContent(payload) {
  const normalized = normalizeEditorOverrides(payload);
  return (
    normalized.createdProps.length > 0 ||
    Object.keys(normalized.props).length > 0 ||
    normalized.hiddenProps.length > 0 ||
    normalized.hiddenGeneratedNodes.length > 0
  );
}

function normalizeSavedState(payload) {
  if (!payload || typeof payload !== "object") {
    return {
      version: 3,
      createdProps: [],
      props: {},
      hiddenProps: [],
      hiddenGeneratedNodes: []
    };
  }

  const createdProps = Array.isArray(payload.createdProps)
    ? payload.createdProps
        .filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry))
        .map((entry) => cloneJson(entry))
        .filter(Boolean)
    : [];
  const source = payload.props && typeof payload.props === "object" ? payload.props : {};
  const props = {};
  for (const [propId, transform] of Object.entries(source)) {
    const id = readText(propId, "");
    if (!id || !transform || typeof transform !== "object") {
      continue;
    }
    const normalized = {};
    if (Array.isArray(transform.position) && transform.position.length >= 3) {
      normalized.position = transform.position.slice(0, 3).map((value) => Number(value) || 0);
    }
    if (Array.isArray(transform.rotation) && transform.rotation.length >= 3) {
      normalized.rotation = transform.rotation.slice(0, 3).map((value) => Number(value) || 0);
    }
    if (Array.isArray(transform.scale) && transform.scale.length >= 3) {
      normalized.scale = transform.scale
        .slice(0, 3)
        .map((value) => Math.max(0.001, Number(value) || 1));
    }
    props[id] = normalized;
  }

  return {
    version: 3,
    updatedAt: readText(payload.updatedAt, ""),
    createdProps,
    props,
    hiddenProps: normalizeStringList(payload.hiddenProps),
    hiddenGeneratedNodes: normalizeStringList(payload.hiddenGeneratedNodes)
  };
}

function readStoredState() {
  try {
    const raw = window.localStorage.getItem(EDITOR_STATE_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return normalizeSavedState(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeStoredState(state) {
  const normalized = normalizeSavedState(state);
  const withTimestamp = {
    ...normalized,
    updatedAt: new Date().toISOString()
  };
  window.localStorage.setItem(EDITOR_STATE_STORAGE_KEY, JSON.stringify(withTimestamp));
  return withTimestamp;
}

function clearStoredState() {
  window.localStorage.removeItem(EDITOR_STATE_STORAGE_KEY);
}

export function createLocalSceneEditor({
  mount = document.body,
  scene = null,
  camera = null,
  renderer = null,
  sceneContext = null,
  catalogSystem = null,
  applyLookDelta = null,
  clearMovementKeys = null,
  readSceneConfig = null,
  writeSceneConfig = null,
  onSceneMutated = null,
  onSuppressPointerLock = null
} = {}) {
  if (!scene || !camera || !renderer || !sceneContext) {
    return null;
  }

  const domElement = renderer.domElement || null;
  if (!domElement) {
    return null;
  }

  const host =
    mount?.querySelector?.(".ui-layer") ||
    mount?.querySelector?.(".lobby-root") ||
    mount ||
    document.body;

  const root = host.querySelector?.("#local-editor") || document.createElement("section");
  root.id = "local-editor";
  root.className = "editor-panel";
  root.dataset.ui = "true";
  root.innerHTML = `
    <header class="editor-panel-head" data-ui>
      <p class="editor-panel-kicker" data-ui>Scene Tools</p>
      <div class="editor-panel-title-row" data-ui>
        <div data-ui>
          <h2 data-ui>Local Scene Editor</h2>
          <p class="editor-panel-subtitle" data-ui>Local editing for layout, transforms, and export.</p>
        </div>
        <div class="editor-panel-badge-row" data-ui>
          <span class="editor-panel-badge" data-ui>Local</span>
          <span id="editor-mode-badge" class="editor-panel-badge editor-panel-badge-active" data-ui>Select</span>
        </div>
      </div>
    </header>
    <section class="editor-panel-section editor-toolbar-section" data-ui>
      <div class="editor-panel-row editor-mode-row" data-ui>
        <button type="button" data-mode="select" data-ui>Select</button>
        <button type="button" data-mode="translate" data-ui>Move</button>
        <button type="button" data-mode="rotate" data-ui>Rotate</button>
        <button type="button" data-mode="scale" data-ui>Scale</button>
        <label class="editor-panel-checkbox" data-ui>
          <input id="editor-snap-toggle" type="checkbox" checked data-ui />
          Snap
        </label>
      </div>
      <p class="editor-panel-hint" data-ui>RMB look, RMB+WASD move, click to select, and use Q/W/E/R to switch tools.</p>
    </section>
    <section class="editor-panel-section editor-create-section" data-ui>
      <div class="editor-section-head" data-ui>
        <div data-ui>
          <h3 data-ui>Asset Browser</h3>
          <p data-ui>Filter primitives and discovered scene models before placing them.</p>
        </div>
      </div>
      <div class="editor-panel-row editor-create-row" data-ui>
        <input
          id="editor-preset-filter"
          class="editor-search-input"
          type="search"
          placeholder="Filter assets, walls, models..."
          autocomplete="off"
          data-ui
        />
        <select id="editor-create-preset" data-ui></select>
        <button id="editor-create-btn" type="button" data-ui>Place Asset</button>
        <button id="editor-duplicate-btn" type="button" data-ui>Duplicate</button>
      </div>
    </section>
    <div class="editor-panel-columns" data-ui>
      <section class="editor-panel-section editor-outliner-section" data-ui>
        <div class="editor-section-head" data-ui>
          <div data-ui>
            <h3 data-ui>Scene Props</h3>
            <p data-ui>Pick authored objects by id or search term.</p>
          </div>
        </div>
        <input
          id="editor-prop-filter"
          class="editor-search-input"
          type="search"
          placeholder="Search props, ids, modules..."
          autocomplete="off"
          data-ui
        />
        <label class="editor-panel-label" data-ui>
          Props
          <select id="editor-prop-list" size="9" data-ui></select>
        </label>
      </section>
      <section class="editor-panel-section editor-shell-section" data-ui>
        <div class="editor-section-head" data-ui>
          <div data-ui>
            <h3 data-ui>Generated Shell</h3>
            <p data-ui>Inspect catalog rooms, connectors, and shell pieces.</p>
          </div>
        </div>
        <input
          id="editor-generated-filter"
          class="editor-search-input"
          type="search"
          placeholder="Search rooms, walls, shell ids..."
          autocomplete="off"
          data-ui
        />
        <label class="editor-panel-label" data-ui>
          Generated Shell
          <select id="editor-generated-list" size="8" data-ui></select>
        </label>
      </section>
    </div>
    <section class="editor-panel-section editor-inspector-section" data-ui>
      <div class="editor-section-head" data-ui>
        <div data-ui>
          <h3 data-ui>Selection Inspector</h3>
          <p data-ui>Source mapping, transform state, and placement health.</p>
        </div>
      </div>
      <div id="editor-selection-chips" class="editor-chip-row" data-ui></div>
      <div class="editor-panel-row editor-transform-row" data-ui>
        <code id="editor-transform-readout" data-ui>Nothing selected.</code>
      </div>
      <div class="editor-panel-row editor-source-row" data-ui>
        <code id="editor-source-readout" data-ui>No source path.</code>
      </div>
      <div class="editor-panel-row editor-placement-row" data-ui>
        <code id="editor-placement-readout" data-ui>Placement diagnostics unavailable.</code>
      </div>
      <div class="editor-panel-row editor-selection-actions-row" data-ui>
        <button id="editor-hide-selected-btn" type="button" data-ui>Delete / Hide Selected</button>
        <button id="editor-restore-selected-btn" type="button" data-ui>Restore Selected</button>
        <button id="editor-resolve-placement-btn" type="button" data-ui>Resolve Placement</button>
        <button id="editor-restore-room-btn" type="button" data-ui>Restore Room</button>
      </div>
    </section>
    <section class="editor-panel-section editor-actions-shell" data-ui>
      <div class="editor-section-head" data-ui>
        <div data-ui>
          <h3 data-ui>Session And Export</h3>
          <p data-ui>Refresh, copy, persist locally, or promote the current override set.</p>
        </div>
      </div>
      <div class="editor-panel-row editor-actions-row" data-ui>
        <button id="editor-refresh-btn" type="button" data-ui>Refresh</button>
        <button id="editor-save-btn" type="button" data-ui>Save Session</button>
        <button id="editor-load-btn" type="button" data-ui>Load Session</button>
        <button id="editor-clear-btn" type="button" data-ui>Clear Session</button>
        <button id="editor-copy-path-btn" type="button" data-ui>Copy Path</button>
        <button id="editor-copy-btn" type="button" data-ui>Copy JSON</button>
      </div>
      <div class="editor-panel-row editor-export-row" data-ui>
        <button id="editor-export-local-btn" type="button" data-ui>Export Local Scene</button>
        <button id="editor-export-defaults-btn" type="button" data-ui>Export Defaults</button>
      </div>
      <p id="editor-status" class="editor-status" data-ui aria-live="polite"></p>
    </section>
  `;
  if (!root.isConnected) {
    host.appendChild(root);
  }

  const propList = root.querySelector("#editor-prop-list");
  const generatedList = root.querySelector("#editor-generated-list");
  const createPresetList = root.querySelector("#editor-create-preset");
  const presetFilterInput = root.querySelector("#editor-preset-filter");
  const propFilterInput = root.querySelector("#editor-prop-filter");
  const generatedFilterInput = root.querySelector("#editor-generated-filter");
  const createButton = root.querySelector("#editor-create-btn");
  const duplicateButton = root.querySelector("#editor-duplicate-btn");
  const snapToggle = root.querySelector("#editor-snap-toggle");
  const refreshButton = root.querySelector("#editor-refresh-btn");
  const saveButton = root.querySelector("#editor-save-btn");
  const loadButton = root.querySelector("#editor-load-btn");
  const clearButton = root.querySelector("#editor-clear-btn");
  const copyPathButton = root.querySelector("#editor-copy-path-btn");
  const copyButton = root.querySelector("#editor-copy-btn");
  const exportLocalButton = root.querySelector("#editor-export-local-btn");
  const exportDefaultsButton = root.querySelector("#editor-export-defaults-btn");
  const hideSelectedButton = root.querySelector("#editor-hide-selected-btn");
  const restoreSelectedButton = root.querySelector("#editor-restore-selected-btn");
  const resolvePlacementButton = root.querySelector("#editor-resolve-placement-btn");
  const restoreRoomButton = root.querySelector("#editor-restore-room-btn");
  const statusLabel = root.querySelector("#editor-status");
  const readout = root.querySelector("#editor-transform-readout");
  const sourceReadout = root.querySelector("#editor-source-readout");
  const placementReadout = root.querySelector("#editor-placement-readout");
  const selectionChips = root.querySelector("#editor-selection-chips");
  const modeBadge = root.querySelector("#editor-mode-badge");
  const modeButtons = [...root.querySelectorAll("[data-mode]")];

  const transformControls = new TransformControls(camera, domElement);
  transformControls.setSpace("world");
  transformControls.size = 0.8;
  transformControls.enabled = true;
  scene.add(transformControls);
  const selectionBounds = new THREE.Box3();
  const selectionHelper = new THREE.Box3Helper(selectionBounds, 0xff8ed5);
  selectionHelper.visible = false;
  selectionHelper.renderOrder = 10;
  selectionHelper.material.depthTest = false;
  selectionHelper.material.transparent = true;
  selectionHelper.material.opacity = 0.95;
  scene.add(selectionHelper);

  let selectedPropId = "";
  let selectedGeneratedNodeId = "";
  let activeMode = "select";
  let disposed = false;
  let isTransformDragging = false;
  let isCameraLookActive = false;
  let lastLookClientX = 0;
  let lastLookClientY = 0;
  const pickRaycaster = new THREE.Raycaster();
  const pickPointer = new THREE.Vector2();
  const defaultCreatePresets = [
    {
      id: "primitive:box",
      label: "Box",
      category: "Structures",
      config: {
        type: "primitive",
        primitive: "box",
        position: [0, 0.5, 0],
        scale: [1, 1, 1],
        allowCatalogOverlap: false,
        allowDoorwayBlock: false,
        allowPortalBlock: false,
        material: {
          color: "#8a7f73"
        }
      }
    },
    {
      id: "primitive:wall",
      label: "Wall Block",
      category: "Structures",
      config: {
        type: "primitive",
        primitive: "box",
        position: [0, 1.5, 0],
        scale: [3, 3, 0.18],
        allowCatalogOverlap: false,
        allowDoorwayBlock: false,
        allowPortalBlock: false,
        material: {
          color: "#797164",
          roughness: 0.92,
          metalness: 0.06
        }
      }
    },
    {
      id: "primitive:glass-wall",
      label: "Glass Wall",
      category: "Structures",
      config: {
        type: "primitive",
        primitive: "box",
        position: [0, 1.5, 0],
        scale: [3, 3, 0.12],
        allowCatalogOverlap: false,
        allowDoorwayBlock: false,
        allowPortalBlock: false,
        material: {
          color: "#9ec7d4",
          emissiveColor: "#9ec7d4",
          emissiveIntensity: 0.05,
          opacity: 0.16,
          transparent: true,
          doubleSided: true,
          roughness: 0.16,
          metalness: 0.08
        }
      }
    },
    {
      id: "primitive:sphere",
      label: "Sphere",
      category: "Decor",
      config: {
        type: "primitive",
        primitive: "sphere",
        position: [0, 0.5, 0],
        scale: [1, 1, 1],
        allowCatalogOverlap: false,
        allowDoorwayBlock: false,
        allowPortalBlock: false,
        material: {
          color: "#87a4b3"
        }
      }
    },
    {
      id: "primitive:cylinder",
      label: "Cylinder",
      category: "Decor",
      config: {
        type: "primitive",
        primitive: "cylinder",
        position: [0, 0.7, 0],
        scale: [1, 1.4, 1],
        allowCatalogOverlap: false,
        allowDoorwayBlock: false,
        allowPortalBlock: false,
        material: {
          color: "#7a6f63"
        }
      }
    },
    {
      id: "primitive:plane",
      label: "Plane",
      category: "Surfaces",
      config: {
        type: "primitive",
        primitive: "plane",
        position: [0, 1.8, 0],
        scale: [2.2, 1.6, 1],
        rotation: [0, 180, 0],
        allowCatalogOverlap: false,
        allowDoorwayBlock: false,
        allowPortalBlock: false,
        collider: false,
        material: {
          color: "#d4dde4",
          roughness: 0.55,
          metalness: 0.04
        }
      }
    },
    {
      id: "primitive:torus",
      label: "Torus",
      category: "Decor",
      config: {
        type: "primitive",
        primitive: "torus",
        position: [0, 2.2, 0],
        scale: [1.2, 1.2, 0.12],
        rotation: [90, 0, 0],
        allowCatalogOverlap: false,
        allowDoorwayBlock: false,
        allowPortalBlock: false,
        collider: false,
        material: {
          color: "#f2b0d6",
          emissiveColor: "#ff84c6",
          emissiveIntensity: 0.18,
          roughness: 0.24,
          metalness: 0.12
        }
      }
    }
  ];

  function setStatus(text, tone = "muted") {
    if (!statusLabel) {
      return;
    }
    statusLabel.textContent = readText(text, "");
    statusLabel.dataset.tone = tone;
  }

  function getEditableIds() {
    return sceneContext.getEditablePropIds?.() || [];
  }

  function getGeneratedEntries() {
    return catalogSystem?.getGeneratedShellEntries?.() || [];
  }

  function getSelectedType() {
    if (selectedPropId) {
      return "prop";
    }
    if (selectedGeneratedNodeId) {
      return "generated";
    }
    return "";
  }

  function getSelectedObject() {
    if (!selectedPropId) {
      return null;
    }
    return sceneContext.getEditablePropObject?.(selectedPropId) || null;
  }

  function getSelectedPropState() {
    if (!selectedPropId) {
      return null;
    }
    return sceneContext.getPropState?.(selectedPropId) || null;
  }

  function getSelectedPropConfig(options = {}) {
    if (!selectedPropId) {
      return null;
    }
    return sceneContext.getEditablePropConfig?.(selectedPropId, options) || null;
  }

  function getEditorCreatedCount() {
    return sceneContext.getEditorCreatedProps?.().length || 0;
  }

  function getSelectedGeneratedEntry() {
    if (!selectedGeneratedNodeId) {
      return null;
    }
    return getGeneratedEntries().find((entry) => entry.id === selectedGeneratedNodeId) || null;
  }

  function getCreationPresets() {
    const presets = defaultCreatePresets.map((entry) => ({
      id: entry.id,
      label: entry.label,
      category: readText(entry.category, "Primitives"),
      config: cloneJson(entry.config) || {}
    }));
    const seenModels = new Set();

    for (const propId of getEditableIds()) {
      const config = sceneContext.getEditablePropConfig?.(propId, { includeSource: false }) || null;
      const modelPath = readText(config?.model, "");
      if (!modelPath || seenModels.has(modelPath)) {
        continue;
      }
      seenModels.add(modelPath);
      const labelBase = readText(modelPath.split("/").pop(), modelPath).replace(/\.glb$/i, "");
      presets.push({
        id: `model:${modelPath}`,
        label: `Model: ${labelBase}`,
        category: "Scene Models",
        config: {
          type: "model",
          model: modelPath,
          position: [0, 0, 0],
          scale: Array.isArray(config?.scale) ? config.scale.slice(0, 3) : [1, 1, 1],
          rotation: Array.isArray(config?.rotation) ? config.rotation.slice(0, 3) : [0, 0, 0],
          collider: config?.collider !== false,
          modelPlacement: cloneJson(config?.modelPlacement) || undefined,
          modelFallback: cloneJson(config?.modelFallback) || undefined
        }
      });
    }

    return presets;
  }

  function refreshCreationPresets() {
    if (!createPresetList) {
      return;
    }

    const previous = readText(createPresetList.value, "");
    const presets = getCreationPresets();
    const filterQuery = readText(presetFilterInput?.value, "").toLowerCase();
    const filteredPresets = presets.filter((preset) => {
      if (!filterQuery) {
        return true;
      }
      return `${preset.label} ${preset.id} ${preset.category}`.toLowerCase().includes(filterQuery);
    });
    createPresetList.innerHTML = "";
    const groupedPresets = new Map();
    for (const preset of filteredPresets) {
      const category = readText(preset.category, "Assets");
      if (!groupedPresets.has(category)) {
        groupedPresets.set(category, []);
      }
      groupedPresets.get(category).push(preset);
    }
    for (const [category, entries] of groupedPresets.entries()) {
      const group = document.createElement("optgroup");
      group.label = category;
      for (const preset of entries) {
        const option = document.createElement("option");
        option.value = preset.id;
        option.textContent = preset.label;
        group.append(option);
      }
      createPresetList.append(group);
    }
    createPresetList.value = filteredPresets.some((entry) => entry.id === previous)
      ? previous
      : filteredPresets[0]?.id || "";
  }

  function getSelectedCreationPreset() {
    const presetId = readText(createPresetList?.value, "");
    return getCreationPresets().find((entry) => entry.id === presetId) || null;
  }

  function getPlacementAnchor() {
    const selectedObject = getSelectedObject();
    if (selectedObject) {
      return {
        x: selectedObject.position.x + 0.8,
        y: selectedObject.position.y,
        z: selectedObject.position.z + 0.8
      };
    }

    const player = sceneContext?.player || null;
    const floorY = Number(sceneContext?.floorY);
    if (!player) {
      return {
        x: 0,
        y: Number.isFinite(floorY) ? floorY : 0,
        z: 0
      };
    }

    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyEuler(new THREE.Euler(0, player.rotation.y, 0, "YXZ"));
    forward.y = 0;
    if (forward.lengthSq() <= 0.0001) {
      forward.set(0, 0, -1);
    }
    forward.normalize().multiplyScalar(2.6);

    return {
      x: player.position.x + forward.x,
      y: Number.isFinite(floorY) ? floorY : Math.max(0, player.position.y - 1.7),
      z: player.position.z + forward.z
    };
  }

  function buildUniquePropId(baseId = "editor_prop") {
    const root = readText(baseId, "editor_prop")
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "") || "editor_prop";
    const existingIds = new Set(getEditableIds());
    let attempt = 1;
    let candidate = `${root}_${attempt}`;
    while (existingIds.has(candidate)) {
      attempt += 1;
      candidate = `${root}_${attempt}`;
    }
    return candidate;
  }

  function getSelectedSceneObject() {
    if (selectedPropId) {
      return getSelectedObject();
    }
    return getSelectedGeneratedEntry()?.object || null;
  }

  function refreshSelectionHighlight() {
    const object = getSelectedSceneObject();
    if (!object || object.visible === false) {
      selectionHelper.visible = false;
      return;
    }

    object.updateWorldMatrix?.(true, true);
    selectionBounds.setFromObject(object);
    if (selectionBounds.isEmpty()) {
      selectionHelper.visible = false;
      return;
    }
    selectionHelper.visible = true;
    selectionHelper.updateMatrixWorld(true);
  }

  function syncTransformAttachment() {
    if (activeMode === "select" || !selectedPropId) {
      transformControls.detach();
      refreshSelectionHighlight();
      return;
    }

    const object = getSelectedObject();
    if (!object || !object.parent) {
      transformControls.detach();
      refreshSelectionHighlight();
      return;
    }

    transformControls.attach(object);
    refreshSelectionHighlight();
  }

  function setSnapEnabled(enabled) {
    const useSnap = enabled !== false;
    transformControls.translationSnap = useSnap ? DEFAULT_TRANSLATE_SNAP : null;
    transformControls.rotationSnap = useSnap
      ? THREE.MathUtils.degToRad(DEFAULT_ROTATE_SNAP_DEG)
      : null;
    transformControls.scaleSnap = useSnap ? DEFAULT_SCALE_SNAP : null;
  }

  function setMode(mode) {
    const nextMode = ["select", "translate", "rotate", "scale"].includes(mode) ? mode : "select";
    activeMode = nextMode;
    if (nextMode !== "select") {
      transformControls.setMode(nextMode);
    }
    for (const button of modeButtons) {
      const selected = button.dataset.mode === nextMode;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    }
    if (modeBadge) {
      modeBadge.textContent =
        nextMode === "translate"
          ? "Move"
          : nextMode === "rotate"
            ? "Rotate"
            : nextMode === "scale"
              ? "Scale"
              : "Select";
    }
    syncTransformAttachment();
  }

  function renderSelectionChips(items = []) {
    if (!selectionChips) {
      return;
    }
    selectionChips.innerHTML = "";
    for (const item of items) {
      const label = readText(item?.label, "");
      if (!label) {
        continue;
      }
      const chip = document.createElement("span");
      chip.className = "editor-chip";
      chip.dataset.tone = readText(item?.tone, "neutral");
      chip.textContent = label;
      selectionChips.appendChild(chip);
    }
    selectionChips.classList.toggle("is-empty", selectionChips.childElementCount === 0);
  }

  function getSelectedPlacementDiagnostics() {
    if (!selectedPropId) {
      return null;
    }
    return sceneContext.getEditablePropPlacementDiagnostics?.(selectedPropId) || null;
  }

  function updateActionState() {
    const selectedType = getSelectedType();
    const propState = getSelectedPropState();
    const generatedEntry = getSelectedGeneratedEntry();
    const placementDiagnostics = getSelectedPlacementDiagnostics();
    const hasSelection = Boolean(selectedType);
    const canDuplicate = selectedType === "prop" && Boolean(getSelectedPropConfig({ includeSource: false }));
    const canCreate = Boolean(getSelectedCreationPreset());

    if (createButton) {
      createButton.disabled = !canCreate;
    }
    if (duplicateButton) {
      duplicateButton.disabled = !canDuplicate;
    }

    if (hideSelectedButton) {
      if (selectedType === "prop" && propState?.editorCreated === true) {
        hideSelectedButton.textContent = "Delete Added";
      } else {
        hideSelectedButton.textContent = "Delete / Hide Selected";
      }
      hideSelectedButton.disabled =
        !hasSelection ||
        (selectedType === "prop" && propState?.editorCreated !== true && propState?.editorHidden === true) ||
        (selectedType === "generated" && generatedEntry?.visible === false);
    }
    if (restoreSelectedButton) {
      restoreSelectedButton.disabled =
        !hasSelection ||
        (selectedType === "prop" && propState?.editorCreated === true) ||
        (selectedType === "prop" && propState?.editorHidden !== true) ||
        (selectedType === "generated" &&
          generatedEntry?.visible !== false &&
          generatedEntry?.enabledColliderCount === generatedEntry?.colliderCount);
    }
    if (restoreRoomButton) {
      restoreRoomButton.disabled = !generatedEntry;
    }
    if (resolvePlacementButton) {
      resolvePlacementButton.disabled =
        selectedType !== "prop" ||
        !selectedPropId ||
        !placementDiagnostics ||
        placementDiagnostics.valid === true;
    }
    if (copyPathButton) {
      copyPathButton.disabled =
        !hasSelection ||
        (selectedType === "prop" && !readText(propState?.sourcePath, "")) ||
        (selectedType === "generated" && !readText(generatedEntry?.sourcePath, ""));
    }
  }

  function refreshReadout() {
    const selectedType = getSelectedType();
    if (!readout || !sourceReadout || !placementReadout) {
      return;
    }

    if (selectedType === "prop") {
      const transform = sceneContext.getEditablePropTransform?.(selectedPropId);
      const state = getSelectedPropState();
      const placementDiagnostics = getSelectedPlacementDiagnostics();
      if (!transform || !state) {
        readout.textContent = "Nothing selected.";
        sourceReadout.textContent = "No source path.";
        placementReadout.textContent = "Placement diagnostics unavailable.";
        renderSelectionChips([]);
        updateActionState();
        return;
      }

      const [px, py, pz] = transform.position || [0, 0, 0];
      const [rx, ry, rz] = transform.rotation || [0, 0, 0];
      const [sx, sy, sz] = transform.scale || [1, 1, 1];
      const createdLabel = state.editorCreated ? " | created locally" : "";
      const hiddenLabel = state.editorHidden ? " | hidden locally" : "";
      readout.textContent =
        `Prop ${selectedPropId}${createdLabel}${hiddenLabel} | ` +
        `P ${toRounded(px, 2)}, ${toRounded(py, 2)}, ${toRounded(pz, 2)} | ` +
        `R ${toRounded(rx, 1)}, ${toRounded(ry, 1)}, ${toRounded(rz, 1)} | ` +
        `S ${toRounded(sx, 2)}, ${toRounded(sy, 2)}, ${toRounded(sz, 2)}`;

      const configFile = readText(state.sourceConfigFile, "scene.json");
      const sourcePath = readText(state.sourcePath, "");
      const sourceGroupId = readText(state.sourceGroupId, "");
      sourceReadout.textContent = sourcePath
        ? sourceGroupId
          ? `${configFile} :: ${sourcePath} | group ${sourceGroupId}`
          : `${configFile} :: ${sourcePath}`
        : state.editorCreated
          ? "Runtime-only editor object. Export scene overrides to persist it."
          : "Runtime-only object.";
      const chips = [];
      chips.push({
        label: state.editorCreated ? "Added Locally" : "Shipped Prop",
        tone: state.editorCreated ? "info" : "neutral"
      });
      if (state.editorHidden) {
        chips.push({
          label: "Hidden",
          tone: "warn"
        });
      }
      if (state.sourceGroupId) {
        chips.push({
          label: `Group ${state.sourceGroupId}`,
          tone: "neutral"
        });
      }
      if (Array.isArray(state.moduleIds) && state.moduleIds.length) {
        chips.push({
          label: `Modules ${state.moduleIds.join(", ")}`,
          tone: "info"
        });
      }
      if (placementDiagnostics?.valid) {
        chips.push({
          label: "Placement Clear",
          tone: "success"
        });
      } else if (placementDiagnostics?.issueCount) {
        chips.push({
          label: `${placementDiagnostics.issueCount} Placement Issue${placementDiagnostics.issueCount === 1 ? "" : "s"}`,
          tone: "warn"
        });
      }
      renderSelectionChips(chips);
      placementReadout.textContent = placementDiagnostics?.valid
        ? "Placement clear. Door, portal, catalog, and occupied-footprint checks passed."
        : placementDiagnostics?.issues?.length
          ? `Placement issues: ${placementDiagnostics.issues.map((issue) => `${issue.label} (${issue.id})`).join(" • ")}`
          : "Placement diagnostics unavailable.";
      updateActionState();
      return;
    }

    if (selectedType === "generated") {
      const entry = getSelectedGeneratedEntry();
      if (!entry) {
        readout.textContent = "Nothing selected.";
        sourceReadout.textContent = "No source path.";
        updateActionState();
        return;
      }

      const [px, py, pz] = entry.worldPosition || [0, 0, 0];
      const [sx, sy, sz] = entry.worldBoundsSize || [0, 0, 0];
      const hiddenLabel = entry.visible ? "" : " | hidden locally";
      readout.textContent =
        `${entry.label}${hiddenLabel} | ` +
        `${entry.roomId} room ${entry.roomIndex + 1} | ` +
        `P ${toRounded(px, 2)}, ${toRounded(py, 2)}, ${toRounded(pz, 2)} | ` +
        `Size ${toRounded(sx, 2)}, ${toRounded(sy, 2)}, ${toRounded(sz, 2)} | ` +
        `Colliders ${entry.enabledColliderCount}/${entry.colliderCount}`;
      sourceReadout.textContent =
        `${readText(entry.sourceConfigFile, "catalog.json")} :: ${readText(entry.sourcePath, "catalog.rooms")} | ` +
        `${readText(entry.partId, "generated-shell")}`;
      placementReadout.textContent = "Generated shell pieces are topology-driven. Hide, restore, or rebuild them from this inspector.";
      renderSelectionChips([
        {
          label: `${entry.roomId} Room ${entry.roomIndex + 1}`,
          tone: "info"
        },
        {
          label: entry.visible ? "Visible" : "Hidden",
          tone: entry.visible ? "success" : "warn"
        },
        {
          label: `${entry.enabledColliderCount}/${entry.colliderCount} Colliders`,
          tone: "neutral"
        }
      ]);
      updateActionState();
      return;
    }

    readout.textContent = "Nothing selected.";
    sourceReadout.textContent = "No source path.";
    placementReadout.textContent = "Placement diagnostics unavailable.";
    renderSelectionChips([]);
    updateActionState();
  }

  function clearSelection() {
    selectedPropId = "";
    selectedGeneratedNodeId = "";
    transformControls.detach();
    selectionHelper.visible = false;
    if (propList) {
      propList.value = "";
    }
    if (generatedList) {
      generatedList.value = "";
    }
    refreshReadout();
  }

  function buildPropOptionLabel(id) {
    const state = sceneContext.getPropState?.(id) || null;
    if (!state) {
      return id;
    }
    const addedPrefix = state.editorCreated ? "[added] " : "";
    if (state.editorHidden) {
      return `${addedPrefix}[hidden] ${id}`;
    }
    if (state.visible === false) {
      return `${addedPrefix}[culled] ${id}`;
    }
    return `${addedPrefix}${id}`;
  }

  function buildGeneratedOptionLabel(entry) {
    if (!entry) {
      return "";
    }
    const hiddenPrefix = entry.visible ? "" : "[hidden] ";
    return `[${entry.roomId} ${entry.roomIndex + 1}] ${hiddenPrefix}${entry.label}`;
  }

  function getFilteredPropIds() {
    const filterQuery = readText(propFilterInput?.value, "").toLowerCase();
    const ids = getEditableIds();
    if (!filterQuery) {
      return ids;
    }
    return ids.filter((id) => {
      const state = sceneContext.getPropState?.(id) || null;
      const haystack = [
        id,
        readText(state?.sourcePath, ""),
        readText(state?.sourceGroupId, ""),
        ...(Array.isArray(state?.moduleIds) ? state.moduleIds : [])
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(filterQuery);
    });
  }

  function getFilteredGeneratedEntries() {
    const filterQuery = readText(generatedFilterInput?.value, "").toLowerCase();
    const entries = getGeneratedEntries();
    if (!filterQuery) {
      return entries;
    }
    return entries.filter((entry) =>
      `${entry.roomId} ${entry.label} ${entry.partId} ${entry.sourcePath}`.toLowerCase().includes(filterQuery)
    );
  }

  function selectProp(propId) {
    const nextId = readText(propId, "");
    if (!nextId) {
      clearSelection();
      return false;
    }
    const object = sceneContext.getEditablePropObject?.(nextId);
    if (!object || !object.parent) {
      clearSelection();
      return false;
    }

    selectedPropId = nextId;
    selectedGeneratedNodeId = "";
    if (propList) {
      propList.value = nextId;
    }
    if (generatedList) {
      generatedList.value = "";
    }
    syncTransformAttachment();
    refreshReadout();
    return true;
  }

  function selectGeneratedNode(shellNodeId) {
    const nextId = readText(shellNodeId, "");
    if (!nextId) {
      clearSelection();
      return false;
    }
    const object = catalogSystem?.getGeneratedShellObject?.(nextId) || null;
    if (!object || !object.parent) {
      clearSelection();
      return false;
    }

    selectedPropId = "";
    selectedGeneratedNodeId = nextId;
    syncTransformAttachment();
    if (propList) {
      propList.value = "";
    }
    if (generatedList) {
      generatedList.value = nextId;
    }
    refreshReadout();
    return true;
  }

  function refreshPropOutliner() {
    if (!propList) {
      return;
    }

    const ids = getFilteredPropIds();
    const previous = selectedPropId || readText(propList.value, "");
    propList.innerHTML = "";
    for (const id of ids) {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = buildPropOptionLabel(id);
      propList.appendChild(option);
    }

    if (previous && ids.includes(previous) && getSelectedType() === "prop") {
      selectProp(previous);
    } else if (!selectedGeneratedNodeId) {
      refreshReadout();
    }
  }

  function refreshGeneratedOutliner() {
    if (!generatedList) {
      return;
    }

    const entries = getFilteredGeneratedEntries();
    const previous = selectedGeneratedNodeId || readText(generatedList.value, "");
    generatedList.innerHTML = "";
    for (const entry of entries) {
      const option = document.createElement("option");
      option.value = entry.id;
      option.textContent = buildGeneratedOptionLabel(entry);
      generatedList.appendChild(option);
    }

    if (previous && entries.some((entry) => entry.id === previous) && getSelectedType() === "generated") {
      selectGeneratedNode(previous);
    } else if (!selectedPropId) {
      refreshReadout();
    }
  }

  function refreshOutliner() {
    refreshCreationPresets();
    refreshPropOutliner();
    refreshGeneratedOutliner();
    refreshReadout();
  }

  function buildSerializableState() {
    const props = {};
    for (const id of getEditableIds()) {
      const state = sceneContext.getPropState?.(id) || null;
      if (state?.editorCreated === true) {
        continue;
      }
      const transform = sceneContext.getEditablePropTransform?.(id);
      if (!transform) {
        continue;
      }
      props[id] = transform;
    }
    return {
      version: 3,
      createdProps: sceneContext.getEditorCreatedProps?.() || [],
      props,
      hiddenProps: (sceneContext.getHiddenEditablePropIds?.() || []).filter((id) => {
        const state = sceneContext.getPropState?.(id) || null;
        return state?.editorCreated !== true;
      }),
      hiddenGeneratedNodes: catalogSystem?.getHiddenGeneratedShellNodeIds?.() || []
    };
  }

  async function exportStateToConfig(target = "local") {
    if (typeof readSceneConfig !== "function" || typeof writeSceneConfig !== "function") {
      setStatus("Config export is only available in local dev mode.", "warn");
      return false;
    }

    try {
      const current = await readSceneConfig("effective");
      const parsed = JSON.parse(current?.text || "{}");
      const overrides = normalizeEditorOverrides(buildSerializableState());

      if (hasEditorOverrideContent(overrides)) {
        parsed.editorOverrides = overrides;
      } else {
        delete parsed.editorOverrides;
      }

      await writeSceneConfig(target, `${JSON.stringify(parsed, null, 2)}\n`);
      setStatus(
        target === "defaults"
          ? "Exported current editor overrides to public/config.defaults/scene.json."
          : "Exported current editor overrides to public/config/scene.json.",
        "success"
      );
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to export scene overrides.", "warn");
      return false;
    }
  }

  function applyHiddenPropState(hiddenIds = [], { markDirty = true } = {}) {
    const nextHiddenIds = new Set(normalizeStringList(hiddenIds));
    let updatedCount = 0;
    for (const id of getEditableIds()) {
      const state = sceneContext.getPropState?.(id) || null;
      const shouldBeVisible = !nextHiddenIds.has(id);
      const currentlyVisible = state?.editorHidden !== true;
      if (currentlyVisible === shouldBeVisible) {
        continue;
      }
      if (sceneContext.setEditablePropVisible?.(id, shouldBeVisible, { markDirty })) {
        updatedCount += 1;
      }
    }
    return updatedCount;
  }

  function applyHiddenGeneratedState(hiddenIds = []) {
    const nextHiddenIds = new Set(normalizeStringList(hiddenIds));
    const entries = getGeneratedEntries();
    const currentHiddenIds = new Set(
      catalogSystem?.getHiddenGeneratedShellNodeIds?.() ||
        entries.filter((entry) => entry.visible === false).map((entry) => entry.id)
    );
    const allIds = new Set([
      ...entries.map((entry) => entry.id),
      ...currentHiddenIds,
      ...nextHiddenIds
    ]);
    let updatedCount = 0;
    for (const id of allIds) {
      const shouldBeVisible = !nextHiddenIds.has(id);
      const currentlyVisible = !currentHiddenIds.has(id);
      if (currentlyVisible === shouldBeVisible) {
        continue;
      }
      if (catalogSystem?.setGeneratedShellNodeVisible?.(id, shouldBeVisible)) {
        updatedCount += 1;
      }
    }
    return updatedCount;
  }

  async function applyState(state, { markDirty = true } = {}) {
    const normalized = normalizeSavedState(state);
    const updatedCreatedProps =
      (await sceneContext.setEditorCreatedProps?.(normalized.createdProps, { markDirty })) || 0;
    const updatedTransforms =
      sceneContext.applyEditablePropTransforms?.(normalized.props, { markDirty }) || 0;
    const updatedHiddenProps = applyHiddenPropState(normalized.hiddenProps, { markDirty });
    const updatedHiddenGenerated = applyHiddenGeneratedState(normalized.hiddenGeneratedNodes);
    const updated =
      updatedCreatedProps + updatedTransforms + updatedHiddenProps + updatedHiddenGenerated;
    if (updated > 0) {
      onSceneMutated?.();
      refreshOutliner();
    }
    return updated;
  }

  function saveState() {
    const payload = buildSerializableState();
    writeStoredState(payload);
    setStatus(
      `Saved ${Object.keys(payload.props).length} props, ${payload.createdProps.length} added props, ${payload.hiddenProps.length} hidden props, and ${payload.hiddenGeneratedNodes.length} hidden shell pieces locally.`,
      "success"
    );
    return payload;
  }

  async function loadSavedState({ silent = false } = {}) {
    const payload = readStoredState();
    if (!payload) {
      if (!silent) {
        setStatus("No local editor state found.", "warn");
      }
      return 0;
    }
    const applied = await applyState(payload, { markDirty: true });
    if (!silent) {
      setStatus(`Loaded ${applied} local editor changes.`, "success");
    }
    return applied;
  }

  function clearState() {
    clearStoredState();
    setStatus("Cleared local editor state.", "muted");
  }

  async function copyStateToClipboard() {
    const payload = buildSerializableState();
    const text = JSON.stringify(payload, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied editor state JSON to clipboard.", "success");
      return true;
    } catch {
      setStatus("Clipboard unavailable. Use Save Local and load from browser storage.", "warn");
      return false;
    }
  }

  async function copySelectedPathToClipboard() {
    const selectedType = getSelectedType();
    if (selectedType === "prop") {
      const state = getSelectedPropState();
      const sourcePath = readText(state?.sourcePath, "");
      if (!selectedPropId || !sourcePath) {
        setStatus("Select a scene prop with a JSON source path first.", "warn");
        return false;
      }
      const text = `${readText(state?.sourceConfigFile, "scene.json")} :: ${sourcePath}`;
      try {
        await navigator.clipboard.writeText(text);
        setStatus(`Copied source path for ${selectedPropId}.`, "success");
        return true;
      } catch {
        setStatus("Clipboard unavailable. Source path is shown in the editor panel.", "warn");
        return false;
      }
    }

    if (selectedType === "generated") {
      const entry = getSelectedGeneratedEntry();
      const sourcePath = readText(entry?.sourcePath, "");
      if (!entry || !sourcePath) {
        setStatus("Select a generated shell piece first.", "warn");
        return false;
      }
      const text = `${readText(entry.sourceConfigFile, "catalog.json")} :: ${sourcePath} :: ${readText(entry.partId, "generated-shell")}`;
      try {
        await navigator.clipboard.writeText(text);
        setStatus(`Copied source path for ${entry.label}.`, "success");
        return true;
      } catch {
        setStatus("Clipboard unavailable. Source path is shown in the editor panel.", "warn");
        return false;
      }
    }

    setStatus("Select a prop or generated shell piece first.", "warn");
    return false;
  }

  function buildCreatedPropFromPreset(preset) {
    const config = cloneJson(preset?.config) || {};
    const anchor = getPlacementAnchor();
    const offset = Array.isArray(config.position) ? config.position.slice(0, 3) : [0, 0, 0];
    const yaw = toRounded(THREE.MathUtils.radToDeg(sceneContext?.player?.rotation?.y || 0), 3);
    const baseName =
      config.type === "model"
        ? readText(readText(config.model, "").split("/").pop(), "model").replace(/\.glb$/i, "")
        : readText(config.primitive, "prop");
    config.id = buildUniquePropId(baseName);
    config.position = [
      toRounded(anchor.x + (Number(offset[0]) || 0), 4),
      toRounded(anchor.y + (Number(offset[1]) || 0), 4),
      toRounded(anchor.z + (Number(offset[2]) || 0), 4)
    ];
    config.rotation = Array.isArray(config.rotation) ? config.rotation.slice(0, 3) : [0, yaw, 0];
    if (
      config.primitive === "box" ||
      config.primitive === "plane" ||
      preset?.id === "primitive:wall" ||
      preset?.id === "primitive:glass-wall"
    ) {
      config.rotation = [config.rotation[0] || 0, yaw, config.rotation[2] || 0];
    }
    config.scale = Array.isArray(config.scale) ? config.scale.slice(0, 3) : [1, 1, 1];
    if (config.allowCatalogOverlap == null) {
      config.allowCatalogOverlap = false;
    }
    if (config.allowDoorwayBlock == null) {
      config.allowDoorwayBlock = false;
    }
    if (config.allowPortalBlock == null) {
      config.allowPortalBlock = false;
    }
    delete config.sourceConfigFile;
    delete config.sourcePath;
    delete config.sourceGroupId;
    delete config.editorCreated;
    return config;
  }

  async function createPropFromPreset() {
    const preset = getSelectedCreationPreset();
    if (!preset) {
      setStatus("Choose an asset preset first.", "warn");
      return false;
    }

    const config = buildCreatedPropFromPreset(preset);
    const created = await sceneContext.createEditorCreatedProp?.(config, { markDirty: true });
    if (!created) {
      setStatus("Failed to create the selected asset.", "warn");
      return false;
    }

    onSceneMutated?.();
    refreshOutliner();
    selectProp(config.id);
    const placementResult = sceneContext.resolveEditablePropPlacement?.(config.id, {
      markDirty: true
    });
    if (placementResult?.moved) {
      refreshOutliner();
      selectProp(config.id);
    }
    setMode("translate");
    setStatus(
      placementResult?.moved
        ? `Placed ${config.id} and nudged it clear of nearby blocked lanes.`
        : `Placed ${config.id}.`,
      "success"
    );
    return config.id;
  }

  async function duplicateSelectedProp() {
    const baseConfig = getSelectedPropConfig({ includeSource: false });
    if (!baseConfig || !selectedPropId) {
      setStatus("Select a prop before duplicating it.", "warn");
      return false;
    }

    const basePosition = Array.isArray(baseConfig.position) ? baseConfig.position : [0, 0, 0];
    const created = await sceneContext.duplicateEditableProp?.(
      selectedPropId,
      {
        id: buildUniquePropId(`${selectedPropId}_copy`),
        position: [
          toRounded((Number(basePosition[0]) || 0) + 0.8, 4),
          toRounded(Number(basePosition[1]) || 0, 4),
          toRounded((Number(basePosition[2]) || 0) + 0.8, 4)
        ]
      },
      { markDirty: true }
    );
    const nextId = readText(created?.userData?.propId, "");
    if (!created || !nextId) {
      setStatus("Failed to duplicate the selected prop.", "warn");
      return false;
    }

    onSceneMutated?.();
    refreshOutliner();
    selectProp(nextId);
    const placementResult = sceneContext.resolveEditablePropPlacement?.(nextId, {
      markDirty: true
    });
    if (placementResult?.moved) {
      refreshOutliner();
      selectProp(nextId);
    }
    setMode("translate");
    setStatus(
      placementResult?.moved
        ? `Duplicated ${selectedPropId} as ${nextId} and resolved its spawn footprint.`
        : `Duplicated ${selectedPropId} as ${nextId}.`,
      "success"
    );
    return nextId;
  }

  function resolveSelectedPlacement() {
    if (!selectedPropId) {
      setStatus("Select a prop before resolving placement.", "warn");
      return false;
    }

    const result = sceneContext.resolveEditablePropPlacement?.(selectedPropId, {
      markDirty: true
    });
    if (!result) {
      setStatus("Placement resolution is unavailable for this prop.", "warn");
      return false;
    }

    if (result.valid && result.moved) {
      onSceneMutated?.();
      refreshOutliner();
      selectProp(selectedPropId);
      setStatus(`Resolved ${selectedPropId} to the nearest safe footprint.`, "success");
      return true;
    }
    if (result.valid) {
      setStatus(`${selectedPropId} is already clear of doorway, portal, and occupancy conflicts.`, "muted");
      return true;
    }

    setStatus(
      `No safe placement found for ${selectedPropId}. ${result.issues?.map((issue) => issue.label).join(", ") || "Check nearby blockers."}`,
      "warn"
    );
    refreshReadout();
    return false;
  }

  function stopCameraLook() {
    if (!isCameraLookActive) {
      return;
    }
    isCameraLookActive = false;
    clearMovementKeys?.();
  }

  function applyEditorLookDelta(deltaX, deltaY) {
    if (typeof applyLookDelta === "function") {
      applyLookDelta(deltaX, deltaY);
      return;
    }

    const player = sceneContext?.player;
    const pitch = sceneContext?.pitch;
    if (!player || !pitch) {
      return;
    }

    const nextYaw = player.rotation.y - (Number(deltaX) || 0) * 0.0022;
    const nextPitch = pitch.rotation.x - (Number(deltaY) || 0) * 0.0022;
    player.rotation.y = Number.isFinite(nextYaw) ? nextYaw : player.rotation.y;
    pitch.rotation.x = THREE.MathUtils.clamp(
      Number.isFinite(nextPitch) ? nextPitch : pitch.rotation.x,
      -Math.PI * 0.5 + 0.01,
      Math.PI * 0.5 - 0.01
    );
  }

  function suppressPointerLock() {
    if (typeof onSuppressPointerLock === "function") {
      onSuppressPointerLock();
      return;
    }
    if (domElement?.dataset) {
      domElement.dataset.pointerLockSuppressedUntil = String(performance.now() + 600);
    }
    document.exitPointerLock?.();
  }

  function handleCanvasMouseDown(event) {
    if (disposed || event.target !== domElement) {
      return;
    }
    if (event.button !== 2) {
      return;
    }
    event.preventDefault();
    suppressPointerLock();
    clearMovementKeys?.();
    isCameraLookActive = true;
    lastLookClientX = Number(event.clientX) || 0;
    lastLookClientY = Number(event.clientY) || 0;
  }

  function handleWindowMouseMove(event) {
    if (!isCameraLookActive) {
      return;
    }

    const nextX = Number(event.clientX) || 0;
    const nextY = Number(event.clientY) || 0;
    const deltaX = Number.isFinite(event.movementX) && event.movementX !== 0
      ? event.movementX
      : nextX - lastLookClientX;
    const deltaY = Number.isFinite(event.movementY) && event.movementY !== 0
      ? event.movementY
      : nextY - lastLookClientY;
    lastLookClientX = nextX;
    lastLookClientY = nextY;
    applyEditorLookDelta(deltaX, deltaY);
  }

  function handleWindowMouseUp(event) {
    if (event.button === 2) {
      stopCameraLook();
    }
  }

  function handleCanvasContextMenu(event) {
    if (event.target === domElement) {
      event.preventDefault();
    }
  }

  function handleWindowKeyDown(event) {
    if (disposed || event.defaultPrevented || isEditableTarget(event.target)) {
      return;
    }

    if (!isCameraLookActive) {
      if (["KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft", "ShiftRight"].includes(event.code)) {
        clearMovementKeys?.();
        event.preventDefault();
        event.stopPropagation();
      }
      switch (event.code) {
        case "KeyQ":
          setMode("select");
          event.preventDefault();
          event.stopPropagation();
          return;
        case "KeyW":
          setMode("translate");
          event.preventDefault();
          event.stopPropagation();
          return;
        case "KeyE":
          setMode("rotate");
          event.preventDefault();
          event.stopPropagation();
          return;
        case "KeyR":
          setMode("scale");
          event.preventDefault();
          event.stopPropagation();
          return;
        case "Delete":
        case "Backspace":
          deleteSelected();
          event.preventDefault();
          event.stopPropagation();
          return;
        default:
          break;
      }
    }
  }

  function handleWindowKeyUp(event) {
    if (disposed || isEditableTarget(event.target)) {
      return;
    }
    if (!isCameraLookActive && ["KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft", "ShiftRight"].includes(event.code)) {
      clearMovementKeys?.();
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function resolvePickedPropId(object) {
    let current = object;
    while (current) {
      const propId = readText(current.userData?.propId, "");
      if (propId) {
        return propId;
      }
      current = current.parent || null;
    }
    return "";
  }

  function resolvePickedGeneratedNodeId(object) {
    let current = object;
    while (current) {
      const shellNodeId = readText(current.userData?.generatedShellNodeId, "");
      if (shellNodeId) {
        return shellNodeId;
      }
      current = current.parent || null;
    }
    return "";
  }

  function updatePickRaycaster(clientX, clientY) {
    const rect = domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return false;
    }

    pickPointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pickPointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    pickRaycaster.setFromCamera(pickPointer, camera);
    return true;
  }

  function pickPropIdAtClientPosition(clientX, clientY) {
    if (!updatePickRaycaster(clientX, clientY)) {
      return "";
    }

    const editableRoots = getEditableIds()
      .map((id) => sceneContext.getEditablePropObject?.(id))
      .filter((object) => object?.visible !== false);
    if (!editableRoots.length) {
      return "";
    }

    const hits = pickRaycaster.intersectObjects(editableRoots, true);
    for (const hit of hits) {
      const propId = resolvePickedPropId(hit.object);
      if (propId) {
        return propId;
      }
    }
    return "";
  }

  function pickGeneratedNodeIdAtClientPosition(clientX, clientY) {
    if (!updatePickRaycaster(clientX, clientY)) {
      return "";
    }

    const objects = getGeneratedEntries()
      .map((entry) => entry.object)
      .filter((object) => object?.visible !== false);
    if (!objects.length) {
      return "";
    }

    const hits = pickRaycaster.intersectObjects(objects, true);
    for (const hit of hits) {
      const shellNodeId = resolvePickedGeneratedNodeId(hit.object);
      if (shellNodeId) {
        return shellNodeId;
      }
    }
    return "";
  }

  function hideSelected() {
    const selectedType = getSelectedType();
    if (selectedType === "prop" && selectedPropId) {
      if (sceneContext.setEditablePropVisible?.(selectedPropId, false, { markDirty: true })) {
        onSceneMutated?.();
        refreshOutliner();
        setStatus(`Hid ${selectedPropId} locally.`, "success");
      }
      return;
    }

    if (selectedType === "generated" && selectedGeneratedNodeId) {
      const entry = getSelectedGeneratedEntry();
      if (catalogSystem?.setGeneratedShellNodeVisible?.(selectedGeneratedNodeId, false)) {
        onSceneMutated?.();
        refreshOutliner();
        setStatus(`Hid ${entry?.label || selectedGeneratedNodeId} locally.`, "success");
      }
    }
  }

  function deleteSelected() {
    const selectedType = getSelectedType();
    const propState = getSelectedPropState();
    if (selectedType === "prop" && selectedPropId && propState?.editorCreated === true) {
      const deletedId = selectedPropId;
      clearSelection();
      if (sceneContext.removeEditorCreatedProp?.(deletedId, { markDirty: true })) {
        onSceneMutated?.();
        refreshOutliner();
        setStatus(`Deleted ${deletedId}.`, "success");
        return true;
      }
      setStatus(`Failed to delete ${deletedId}.`, "warn");
      return false;
    }

    hideSelected();
    return true;
  }

  function restoreSelected() {
    const selectedType = getSelectedType();
    if (selectedType === "prop" && selectedPropId) {
      if (sceneContext.setEditablePropVisible?.(selectedPropId, true, { markDirty: true })) {
        onSceneMutated?.();
        refreshOutliner();
        setStatus(`Restored ${selectedPropId}.`, "success");
      }
      return;
    }

    if (selectedType === "generated" && selectedGeneratedNodeId) {
      const entry = getSelectedGeneratedEntry();
      if (catalogSystem?.setGeneratedShellNodeVisible?.(selectedGeneratedNodeId, true)) {
        onSceneMutated?.();
        refreshOutliner();
        setStatus(`Restored ${entry?.label || selectedGeneratedNodeId}.`, "success");
      }
    }
  }

  function restoreSelectedRoom() {
    const entry = getSelectedGeneratedEntry();
    if (!entry) {
      setStatus("Select a generated shell piece first.", "warn");
      return;
    }

    const restored = catalogSystem?.restoreGeneratedShellRoom?.(entry.roomId) || 0;
    onSceneMutated?.();
    refreshOutliner();
    setStatus(`Restored ${restored} shell pieces in ${entry.roomId}.`, "success");
  }

  function handleCanvasClick(event) {
    if (disposed || isTransformDragging || isCameraLookActive || event.defaultPrevented || event.button !== 0) {
      return;
    }
    if (event.target !== domElement) {
      return;
    }
    suppressPointerLock();

    const pickedPropId = pickPropIdAtClientPosition(event.clientX, event.clientY);
    if (pickedPropId) {
      if (selectProp(pickedPropId)) {
        const state = getSelectedPropState();
        setStatus(
          readText(state?.sourcePath, "")
            ? `Selected ${pickedPropId} from ${state.sourcePath}.`
            : `Selected ${pickedPropId}.`,
          "muted"
        );
      }
      return;
    }

    const pickedGeneratedNodeId = pickGeneratedNodeIdAtClientPosition(event.clientX, event.clientY);
    if (!pickedGeneratedNodeId) {
      return;
    }
    if (selectGeneratedNode(pickedGeneratedNodeId)) {
      const entry = getSelectedGeneratedEntry();
      setStatus(
        entry
          ? `Selected ${entry.label} from ${entry.sourcePath}.`
          : `Selected ${pickedGeneratedNodeId}.`,
        "muted"
      );
    }
  }

  transformControls.addEventListener("dragging-changed", (event) => {
    if (disposed) {
      return;
    }
    isTransformDragging = Boolean(event?.value);
    if (event?.value) {
      suppressPointerLock();
      return;
    }
    if (selectedPropId) {
      sceneContext.commitEditablePropTransform?.(selectedPropId, { markDirty: true });
      onSceneMutated?.();
      refreshReadout();
      const placementDiagnostics = getSelectedPlacementDiagnostics();
      if (placementDiagnostics && !placementDiagnostics.valid) {
        setStatus(
          `Placement warning for ${selectedPropId}: ${placementDiagnostics.issues.map((issue) => issue.label).join(", ")}. Use Resolve Placement to nudge it clear.`,
          "warn"
        );
      }
    }
  });

  transformControls.addEventListener("objectChange", () => {
    if (disposed || !selectedPropId) {
      return;
    }
    sceneContext.commitEditablePropTransform?.(selectedPropId, { markDirty: false });
    refreshSelectionHighlight();
    refreshReadout();
  });

  propList?.addEventListener("change", () => {
    const nextId = readText(propList.value, "");
    selectProp(nextId);
  });

  generatedList?.addEventListener("change", () => {
    const nextId = readText(generatedList.value, "");
    selectGeneratedNode(nextId);
  });

  snapToggle?.addEventListener("change", () => {
    setSnapEnabled(Boolean(snapToggle.checked));
  });

  for (const button of modeButtons) {
    button.addEventListener("click", () => {
      setMode(button.dataset.mode);
    });
  }

  refreshButton?.addEventListener("click", () => {
    refreshOutliner();
    setStatus("Outliners refreshed.", "muted");
  });
  createPresetList?.addEventListener("change", () => {
    updateActionState();
  });
  presetFilterInput?.addEventListener("input", () => {
    refreshCreationPresets();
    updateActionState();
  });
  propFilterInput?.addEventListener("input", () => {
    refreshPropOutliner();
  });
  generatedFilterInput?.addEventListener("input", () => {
    refreshGeneratedOutliner();
  });
  createButton?.addEventListener("click", () => {
    void createPropFromPreset();
  });
  duplicateButton?.addEventListener("click", () => {
    void duplicateSelectedProp();
  });
  saveButton?.addEventListener("click", () => {
    saveState();
  });
  loadButton?.addEventListener("click", () => {
    void loadSavedState();
  });
  clearButton?.addEventListener("click", () => {
    clearState();
  });
  copyPathButton?.addEventListener("click", () => {
    void copySelectedPathToClipboard();
  });
  copyButton?.addEventListener("click", () => {
    void copyStateToClipboard();
  });
  exportLocalButton?.addEventListener("click", () => {
    void exportStateToConfig("local");
  });
  exportDefaultsButton?.addEventListener("click", () => {
    void exportStateToConfig("defaults");
  });
  hideSelectedButton?.addEventListener("click", () => {
    deleteSelected();
  });
  restoreSelectedButton?.addEventListener("click", () => {
    restoreSelected();
  });
  resolvePlacementButton?.addEventListener("click", () => {
    resolveSelectedPlacement();
  });
  restoreRoomButton?.addEventListener("click", () => {
    restoreSelectedRoom();
  });
  domElement.addEventListener("mousedown", handleCanvasMouseDown);
  domElement.addEventListener("contextmenu", handleCanvasContextMenu);
  domElement.addEventListener("click", handleCanvasClick);
  window.addEventListener("mousemove", handleWindowMouseMove, true);
  window.addEventListener("mouseup", handleWindowMouseUp, true);
  window.addEventListener("keydown", handleWindowKeyDown, true);
  window.addEventListener("keyup", handleWindowKeyUp, true);
  window.addEventListener("blur", stopCameraLook);

  if (exportLocalButton) {
    exportLocalButton.disabled = typeof readSceneConfig !== "function" || typeof writeSceneConfig !== "function";
  }
  if (exportDefaultsButton) {
    exportDefaultsButton.disabled = typeof readSceneConfig !== "function" || typeof writeSceneConfig !== "function";
  }

  setSnapEnabled(true);
  setMode("select");
  refreshOutliner();
  setStatus(
    typeof readSceneConfig === "function" && typeof writeSceneConfig === "function"
      ? `Ready. ${getEditableIds().length} props and ${getGeneratedEntries().length} generated shell pieces available. Export writes scene.json editor overrides.`
      : `Ready. ${getEditableIds().length} props and ${getGeneratedEntries().length} generated shell pieces available.`,
    "muted"
  );

  return {
    selectProp,
    selectGeneratedNode,
    refreshOutliner,
    loadSavedState,
    saveState,
    clearState,
    createFromPreset: createPropFromPreset,
    duplicateSelected: duplicateSelectedProp,
    resolveSelectedPlacement,
    deleteSelected,
    buildState: buildSerializableState,
    getSnapshot: () => ({
      selectionType: getSelectedType(),
      selectedPropId,
      selectedGeneratedNodeId,
      selectedSourcePath:
        readText(getSelectedPropState()?.sourcePath, "") ||
        readText(getSelectedGeneratedEntry()?.sourcePath, ""),
      mode: activeMode,
      propCount: getEditableIds().length,
      createdPropCount: getEditorCreatedCount(),
      creationPresetCount: getCreationPresets().length,
      generatedCount: getGeneratedEntries().length,
      hiddenPropCount: sceneContext.getHiddenEditablePropIds?.().length || 0,
      hiddenGeneratedCount: catalogSystem?.getHiddenGeneratedShellNodeIds?.().length || 0,
      hasStoredState: Boolean(readStoredState())
    }),
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      stopCameraLook();
      window.removeEventListener("blur", stopCameraLook);
      window.removeEventListener("mousemove", handleWindowMouseMove, true);
      window.removeEventListener("mouseup", handleWindowMouseUp, true);
      window.removeEventListener("keydown", handleWindowKeyDown, true);
      window.removeEventListener("keyup", handleWindowKeyUp, true);
      domElement.removeEventListener("mousedown", handleCanvasMouseDown);
      domElement.removeEventListener("contextmenu", handleCanvasContextMenu);
      domElement.removeEventListener("click", handleCanvasClick);
      transformControls.detach();
      scene.remove(transformControls);
      transformControls.dispose();
      scene.remove(selectionHelper);
      root.remove();
    }
  };
}
