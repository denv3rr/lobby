function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

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

function cloneObjective(objective) {
  return {
    ...objective
  };
}

function defaultObjectiveId(index) {
  return `objective-${index + 1}`;
}

function normalizeStabilityConfig(config = {}) {
  const min = clamp01(toFiniteNumber(config.min, 0));
  const max = clamp01(toFiniteNumber(config.max, 1));
  const boundedMin = Math.min(min, max);
  const boundedMax = Math.max(min, max);
  const initial = clamp(
    toFiniteNumber(config.initial, 0.85),
    boundedMin,
    boundedMax
  );
  const lowThreshold = clamp(
    toFiniteNumber(config.lowThreshold, 0.45),
    boundedMin,
    boundedMax
  );
  const criticalThreshold = clamp(
    toFiniteNumber(config.criticalThreshold, 0.25),
    boundedMin,
    lowThreshold
  );

  return {
    min: boundedMin,
    max: boundedMax,
    initial,
    drainPerSecond: Math.max(0, toFiniteNumber(config.drainPerSecond, 0.005)),
    recoverPerSecond: Math.max(0, toFiniteNumber(config.recoverPerSecond, 0.008)),
    recoverDelaySeconds: Math.max(0, toFiniteNumber(config.recoverDelaySeconds, 2)),
    lowThreshold,
    criticalThreshold
  };
}

function normalizeUiConfig(config = {}) {
  const labels = isObject(config.labels) ? config.labels : {};
  return {
    showStabilityMeter: config.showStabilityMeter !== false,
    showObjectivesPanel: config.showObjectivesPanel !== false,
    stabilityLabel: readText(config.stabilityLabel, "Stability"),
    objectivesTitle: readText(config.title, "Objectives"),
    objectivesSubtitle: readText(config.subtitle, ""),
    labels: {
      stable: readText(labels.stable, "Coherent"),
      low: readText(labels.low, "Fraying"),
      critical: readText(labels.critical, "Near Collapse")
    }
  };
}

function normalizeObjectiveConfig(entry, index = 0) {
  const id = readText(entry?.id, defaultObjectiveId(index));
  const target = Number.isFinite(entry?.target) && entry.target > 0 ? entry.target : null;
  const progressSeed = Math.max(0, toFiniteNumber(entry?.progress, 0));
  const progress = target ? clamp(progressSeed, 0, target) : progressSeed;
  const completed = Boolean(entry?.completed) || Boolean(target && progress >= target);

  return {
    id,
    label: readText(entry?.label, id),
    detail: readText(entry?.detail, ""),
    progress,
    target,
    completed,
    failed: Boolean(entry?.failed),
    optional: Boolean(entry?.optional),
    active: entry?.active !== false,
    hidden: Boolean(entry?.hidden),
    stabilityDeltaOnComplete: toFiniteNumber(entry?.stabilityDeltaOnComplete, 0),
    stabilityDeltaOnFail: toFiniteNumber(entry?.stabilityDeltaOnFail, 0)
  };
}

function normalizeConfig(config = {}) {
  const sourceObjectives = Array.isArray(config.objectives) ? config.objectives : [];
  const seenIds = new Set();
  const objectives = [];

  for (let index = 0; index < sourceObjectives.length; index += 1) {
    const objective = normalizeObjectiveConfig(sourceObjectives[index], index);
    if (seenIds.has(objective.id)) {
      continue;
    }
    objectives.push(objective);
    seenIds.add(objective.id);
  }

  return {
    enabled: config.enabled !== false,
    stability: normalizeStabilityConfig(config.stability),
    ui: normalizeUiConfig(config.ui),
    allRequiredCompletedStabilityDelta: toFiniteNumber(
      config.allRequiredCompletedStabilityDelta,
      0
    ),
    objectives
  };
}

export class StabilityObjectivesSystem {
  constructor({
    config = {},
    ui = null,
    onStabilityChange,
    onObjectiveComplete,
    onObjectiveFail,
    onAllRequiredComplete
  } = {}) {
    this.config = normalizeConfig(config);
    this.enabled = this.config.enabled;
    this.ui = ui;

    this.onStabilityChange =
      typeof onStabilityChange === "function" ? onStabilityChange : null;
    this.onObjectiveComplete =
      typeof onObjectiveComplete === "function" ? onObjectiveComplete : null;
    this.onObjectiveFail = typeof onObjectiveFail === "function" ? onObjectiveFail : null;
    this.onAllRequiredComplete =
      typeof onAllRequiredComplete === "function" ? onAllRequiredComplete : null;

    this.stability = this.config.stability.initial;
    this.recoveryCooldownRemaining = 0;
    this.stressSources = new Set();
    this.panelVisibleOverride = null;
    this.initialized = false;
    this.allRequiredCompleteRewardGranted = false;

    this.baseObjectives = this.config.objectives.map((objective) => cloneObjective(objective));
    this.objectives = this.baseObjectives.map((objective) => cloneObjective(objective));
    this.objectivesById = new Map();
    this.refreshObjectiveIndex();
  }

  refreshObjectiveIndex() {
    this.objectivesById.clear();
    for (const objective of this.objectives) {
      this.objectivesById.set(objective.id, objective);
    }
  }

  resolveStabilityState(value) {
    if (value <= this.config.stability.criticalThreshold) {
      return "critical";
    }
    if (value <= this.config.stability.lowThreshold) {
      return "low";
    }
    return "stable";
  }

  resolveStabilityStatus(value) {
    const state = this.resolveStabilityState(value);
    return this.config.ui.labels[state] || state;
  }

  toUiObjective(objective) {
    return {
      id: objective.id,
      label: objective.label,
      detail: objective.detail,
      progress: objective.progress,
      target: objective.target,
      completed: objective.completed,
      failed: objective.failed,
      optional: objective.optional,
      active: objective.active,
      hidden: objective.hidden
    };
  }

  resolveObjectivesPanelVisible() {
    const hasRenderableObjectives = this.objectives.some((objective) => !objective.hidden);
    const configVisible = this.config.ui.showObjectivesPanel;
    const override = this.panelVisibleOverride;
    const visible = override === null ? configVisible : override;
    return visible && hasRenderableObjectives;
  }

  syncStabilityUi() {
    if (!this.ui?.setStabilityMeter) {
      return;
    }

    this.ui.setStabilityMeter(this.stability, {
      visible: this.config.ui.showStabilityMeter,
      label: this.config.ui.stabilityLabel,
      status: this.resolveStabilityStatus(this.stability),
      state: this.resolveStabilityState(this.stability)
    });
  }

  syncObjectivesUi() {
    const panelState = {
      title: this.config.ui.objectivesTitle,
      subtitle: this.config.ui.objectivesSubtitle,
      objectives: this.objectives.map((objective) => this.toUiObjective(objective)),
      visible: this.resolveObjectivesPanelVisible()
    };

    if (this.ui?.setObjectivesPanel) {
      this.ui.setObjectivesPanel(panelState);
      return;
    }

    this.ui?.setObjectivesPanelTitle?.(panelState.title, panelState.subtitle);
    this.ui?.setObjectives?.(panelState.objectives);
    this.ui?.setObjectivesPanelVisible?.(panelState.visible);
  }

  syncObjectiveEntryUi(objective) {
    if (this.ui?.setObjectiveState) {
      this.ui.setObjectiveState(objective.id, this.toUiObjective(objective));
      this.ui?.setObjectivesPanelVisible?.(this.resolveObjectivesPanelVisible());
      return;
    }

    this.syncObjectivesUi();
  }

  initialize() {
    if (this.initialized) {
      return this.getState();
    }

    this.initialized = true;
    this.syncStabilityUi();
    this.syncObjectivesUi();
    return this.getState();
  }

  update(deltaTime, { stressed = false, suppressRecovery = false } = {}) {
    if (!this.enabled) {
      return this.getState();
    }

    const dt = Math.max(0, toFiniteNumber(deltaTime, 0));
    if (dt <= 0) {
      return this.getState();
    }

    const underStress = Boolean(stressed) || this.stressSources.size > 0;

    if (underStress) {
      this.recoveryCooldownRemaining = this.config.stability.recoverDelaySeconds;
      const drain = this.config.stability.drainPerSecond * dt;
      if (drain > 0) {
        this.adjustStability(-drain, { reason: "drain" });
      }
    } else {
      this.recoveryCooldownRemaining = Math.max(
        0,
        this.recoveryCooldownRemaining - dt
      );

      if (!suppressRecovery && this.recoveryCooldownRemaining <= 0) {
        const recover = this.config.stability.recoverPerSecond * dt;
        if (recover > 0) {
          this.adjustStability(recover, { reason: "recover" });
        }
      }
    }

    return this.getState();
  }

  setStress(active) {
    return this.setStressSource("manual", active);
  }

  setStressSource(sourceId, active = true) {
    const id = readText(sourceId, "manual");
    const enabled = Boolean(active);

    if (enabled) {
      this.stressSources.add(id);
      this.recoveryCooldownRemaining = this.config.stability.recoverDelaySeconds;
    } else {
      this.stressSources.delete(id);
    }

    return this.stressSources.has(id);
  }

  setStability(value, { reason = "set", silent = false } = {}) {
    const previous = this.stability;
    const next = clamp(
      toFiniteNumber(value, previous),
      this.config.stability.min,
      this.config.stability.max
    );

    if (Math.abs(previous - next) < 1e-5) {
      return next;
    }

    this.stability = next;

    if (!silent) {
      this.syncStabilityUi();
    }

    if (this.onStabilityChange) {
      this.onStabilityChange({
        value: next,
        previous,
        reason,
        state: this.resolveStabilityState(next)
      });
    }

    return next;
  }

  adjustStability(delta, options = {}) {
    const amount = toFiniteNumber(delta, 0);
    if (Math.abs(amount) < 1e-5) {
      return this.stability;
    }
    return this.setStability(this.stability + amount, options);
  }

  setObjectivesPanelVisible(visible) {
    this.panelVisibleOverride = Boolean(visible);
    this.ui?.setObjectivesPanelVisible?.(this.resolveObjectivesPanelVisible());
  }

  clearObjectivesPanelVisibilityOverride() {
    this.panelVisibleOverride = null;
    this.ui?.setObjectivesPanelVisible?.(this.resolveObjectivesPanelVisible());
  }

  getObjective(id) {
    const safeId = readText(id, "");
    if (!safeId) {
      return null;
    }
    const objective = this.objectivesById.get(safeId);
    return objective ? cloneObjective(objective) : null;
  }

  setObjectiveActive(id, active = true) {
    const objective = this.objectivesById.get(readText(id, ""));
    if (!objective) {
      return false;
    }

    const next = Boolean(active);
    if (objective.active === next) {
      return true;
    }

    objective.active = next;
    this.syncObjectiveEntryUi(objective);
    return true;
  }

  setObjectiveHidden(id, hidden = true) {
    const objective = this.objectivesById.get(readText(id, ""));
    if (!objective) {
      return false;
    }

    const next = Boolean(hidden);
    if (objective.hidden === next) {
      return true;
    }

    objective.hidden = next;
    this.syncObjectivesUi();
    return true;
  }

  setObjectiveProgress(id, progress, { completeWhenTarget = true, force = false } = {}) {
    const objective = this.objectivesById.get(readText(id, ""));
    if (!objective) {
      return false;
    }

    if (!force && (objective.completed || objective.failed)) {
      return false;
    }

    const nextRaw = Math.max(0, toFiniteNumber(progress, objective.progress));
    const nextProgress = objective.target
      ? clamp(nextRaw, 0, objective.target)
      : nextRaw;

    if (Math.abs(nextProgress - objective.progress) < 1e-5) {
      return true;
    }

    objective.progress = nextProgress;

    if (
      completeWhenTarget &&
      objective.target &&
      nextProgress >= objective.target &&
      !objective.completed
    ) {
      this.completeObjective(objective.id);
      return true;
    }

    this.syncObjectiveEntryUi(objective);
    return true;
  }

  incrementObjectiveProgress(id, amount = 1, options = {}) {
    const objective = this.objectivesById.get(readText(id, ""));
    if (!objective) {
      return false;
    }

    const delta = toFiniteNumber(amount, 0);
    return this.setObjectiveProgress(objective.id, objective.progress + delta, options);
  }

  completeObjective(id, { applyStabilityDelta = true } = {}) {
    const objective = this.objectivesById.get(readText(id, ""));
    if (!objective || objective.completed) {
      return false;
    }

    objective.completed = true;
    objective.failed = false;
    objective.active = false;
    if (objective.target) {
      objective.progress = objective.target;
    }

    if (applyStabilityDelta && objective.stabilityDeltaOnComplete) {
      this.adjustStability(objective.stabilityDeltaOnComplete, {
        reason: `objective:${objective.id}:complete`
      });
    }

    if (this.onObjectiveComplete) {
      this.onObjectiveComplete(cloneObjective(objective));
    }

    this.syncObjectiveEntryUi(objective);
    this.handleRequiredObjectivesComplete();
    return true;
  }

  failObjective(id, { applyStabilityDelta = true } = {}) {
    const objective = this.objectivesById.get(readText(id, ""));
    if (!objective || objective.failed) {
      return false;
    }

    objective.failed = true;
    objective.active = false;
    objective.completed = false;

    if (applyStabilityDelta && objective.stabilityDeltaOnFail) {
      this.adjustStability(objective.stabilityDeltaOnFail, {
        reason: `objective:${objective.id}:fail`
      });
    }

    if (this.onObjectiveFail) {
      this.onObjectiveFail(cloneObjective(objective));
    }

    this.syncObjectiveEntryUi(objective);
    return true;
  }

  handleRequiredObjectivesComplete() {
    if (this.allRequiredCompleteRewardGranted) {
      return;
    }

    const required = this.objectives.filter((objective) => !objective.optional);
    if (!required.length) {
      return;
    }

    if (!required.every((objective) => objective.completed)) {
      return;
    }

    this.allRequiredCompleteRewardGranted = true;
    const reward = this.config.allRequiredCompletedStabilityDelta;
    if (reward) {
      this.adjustStability(reward, { reason: "all-required-complete" });
    }

    if (this.onAllRequiredComplete) {
      this.onAllRequiredComplete({
        stability: this.stability,
        objectives: required.map((objective) => cloneObjective(objective))
      });
    }
  }

  reset() {
    this.stability = this.config.stability.initial;
    this.recoveryCooldownRemaining = 0;
    this.stressSources.clear();
    this.panelVisibleOverride = null;
    this.allRequiredCompleteRewardGranted = false;

    this.objectives = this.baseObjectives.map((objective) => cloneObjective(objective));
    this.refreshObjectiveIndex();

    this.syncStabilityUi();
    this.syncObjectivesUi();
    return this.getState();
  }

  getState() {
    return {
      enabled: this.enabled,
      stability: this.stability,
      stabilityState: this.resolveStabilityState(this.stability),
      recoveryCooldownRemaining: this.recoveryCooldownRemaining,
      stressSourceCount: this.stressSources.size,
      objectives: this.objectives.map((objective) => cloneObjective(objective))
    };
  }

  dispose() {
    this.stressSources.clear();
  }
}

export function createStabilityObjectivesSystem(options = {}) {
  return new StabilityObjectivesSystem(options);
}
