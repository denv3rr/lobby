function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeModuleIds(value) {
  const source = Array.isArray(value) ? value : [value];
  const seen = new Set();
  const ids = [];
  for (const entry of source) {
    const normalized = typeof entry === "string" ? entry.trim() : "";
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    ids.push(normalized);
  }
  return ids;
}

function looksLikeSceneTarget(value) {
  return Boolean(
    value?.hitbox ||
      typeof value?.setHovered === "function" ||
      value?.inspectData ||
      value?.userData?.owner
  );
}

function normalizeActionLikeInteraction(value) {
  if (!isObject(value)) {
    return null;
  }

  const normalized = {
    ...value
  };
  const explicitType =
    looksLikeSceneTarget(value) || typeof value.type !== "string" ? "" : value.type.trim();
  const url = typeof value.url === "string" ? value.url.trim() : "";
  const theme = typeof value.theme === "string" ? value.theme.trim() : "";
  const portalId = typeof value.portalId === "string" ? value.portalId.trim() : "";
  const secretId = typeof value.secretId === "string" ? value.secretId.trim() : "";
  const moduleIds = normalizeModuleIds(value.moduleIds || value.moduleId || value.modules);
  const hasPosition = Array.isArray(value.position) && value.position.length >= 3;
  const hasSteps = Array.isArray(value.steps) && value.steps.length > 0;

  normalized.url = url;
  normalized.theme = theme;
  normalized.portalId = portalId;
  normalized.secretId = secretId;
  normalized.moduleIds = moduleIds;

  let type = explicitType;
  if (!type) {
    if (hasSteps) {
      type = "sequence";
    } else if (url) {
      type = "url";
    } else if (theme) {
      type = "theme";
    } else if (secretId) {
      type = "unlock-secret";
    } else if (hasPosition) {
      type = "teleport";
    } else if (moduleIds.length) {
      type = "modules";
    } else if (portalId) {
      type = "portal";
    } else if (typeof value.message === "string" && value.message.trim()) {
      type = "message";
    }
  }

  if (!type) {
    return null;
  }

  normalized.type = type;
  return normalized;
}

function normalizeTargetInteraction(target) {
  const interaction = normalizeActionLikeInteraction(target?.interaction);
  if (interaction?.type) {
    return interaction;
  }
  if (target?.inspectData) {
    return { type: "inspect" };
  }
  const url = typeof target?.url === "string" ? target.url.trim() : "";
  if (url) {
    return {
      type: "url",
      url
    };
  }
  return null;
}

export class InteractionDirector {
  constructor(context = {}) {
    this.context = { ...context };
    this.handlers = new Map();

    this.register("inspect", async ({ target, context, interaction }) => {
      if (!target?.inspectData || typeof context.inspectTarget !== "function") {
        return false;
      }
      const handled = await context.inspectTarget(target, interaction);
      if (handled && interaction?.message && typeof context.showPrompt === "function") {
        context.showPrompt(interaction.message);
      }
      return Boolean(handled);
    });

    this.register("url", async ({ target, context, interaction }) => {
      if (typeof context.openUrl !== "function") {
        return false;
      }
      const url =
        typeof interaction?.url === "string" && interaction.url.trim()
          ? interaction.url.trim()
          : typeof target?.url === "string" && target.url.trim()
            ? target.url.trim()
            : "";
      if (!url) {
        return false;
      }
      const opened = await context.openUrl(url, target, interaction);
      if (opened && interaction?.message && typeof context.showPrompt === "function") {
        context.showPrompt(interaction.message);
      }
      return Boolean(opened);
    });

    this.register("theme", async ({ interaction, context }) => {
      if (typeof context.applyTheme !== "function") {
        return false;
      }
      const theme =
        typeof interaction?.theme === "string" ? interaction.theme.trim() : "";
      if (!theme) {
        return false;
      }
      const appliedTheme = await context.applyTheme(theme, interaction);
      if (!appliedTheme) {
        return false;
      }
      if (typeof context.showPrompt === "function") {
        context.showPrompt(
          interaction?.message || `Theme tuned: ${appliedTheme}`
        );
      }
      return true;
    });

    this.register("teleport", async ({ interaction, context }) => {
      if (typeof context.teleport !== "function") {
        return false;
      }
      const handled = await context.teleport(interaction);
      if (handled && interaction?.message && typeof context.showPrompt === "function") {
        context.showPrompt(interaction.message);
      }
      return Boolean(handled);
    });

    this.register("unlock-secret", async ({ interaction, context }) => {
      if (typeof context.unlockSecret !== "function") {
        return false;
      }
      const secretId = typeof interaction?.secretId === "string" ? interaction.secretId.trim() : "";
      if (!secretId) {
        return false;
      }
      return Boolean(
        await context.unlockSecret(secretId, {
          message: interaction?.message
        })
      );
    });

    this.register("center-artifact", async ({ target, context, interaction }) => {
      if (typeof context.activateCenterArtifact !== "function") {
        return false;
      }
      context.activateCenterArtifact(target);
      if (interaction?.inspect === false) {
        if (interaction?.message && typeof context.showPrompt === "function") {
          context.showPrompt(interaction.message);
        }
        return true;
      }
      return this.runInteraction(
        {
          ...target,
          interaction: {
            type: "inspect",
            message: interaction?.message
          }
        },
        context
      );
    });

    this.register("modules", async ({ interaction, context }) => {
      if (typeof context.toggleModules !== "function") {
        return false;
      }
      const moduleIds = normalizeModuleIds(interaction?.moduleIds);
      if (!moduleIds.length) {
        return false;
      }
      const updated = await context.toggleModules(moduleIds, interaction);
      if (!updated || (Array.isArray(updated) && !updated.length)) {
        return false;
      }
      if (typeof context.showPrompt === "function") {
        context.showPrompt(
          interaction?.message ||
            `Modules toggled: ${moduleIds.join(", ")}`
        );
      }
      return true;
    });

    this.register("show-module", async ({ interaction, context }) => {
      if (typeof context.setModulesVisible !== "function") {
        return false;
      }
      const moduleIds = normalizeModuleIds(interaction?.moduleIds);
      if (!moduleIds.length) {
        return false;
      }
      const updated = await context.setModulesVisible(moduleIds, true, interaction);
      if (!updated || (Array.isArray(updated) && !updated.length)) {
        return false;
      }
      if (typeof context.showPrompt === "function") {
        context.showPrompt(interaction?.message || "Scene module revealed.");
      }
      return true;
    });

    this.register("hide-module", async ({ interaction, context }) => {
      if (typeof context.setModulesVisible !== "function") {
        return false;
      }
      const moduleIds = normalizeModuleIds(interaction?.moduleIds);
      if (!moduleIds.length) {
        return false;
      }
      const updated = await context.setModulesVisible(moduleIds, false, interaction);
      if (!updated || (Array.isArray(updated) && !updated.length)) {
        return false;
      }
      if (typeof context.showPrompt === "function") {
        context.showPrompt(interaction?.message || "Scene module stowed.");
      }
      return true;
    });

    this.register("toggle-module", async ({ interaction, context }) => {
      if (typeof context.toggleModules !== "function") {
        return false;
      }
      const moduleIds = normalizeModuleIds(interaction?.moduleIds);
      if (!moduleIds.length) {
        return false;
      }
      const updated = await context.toggleModules(moduleIds, interaction);
      if (!updated || (Array.isArray(updated) && !updated.length)) {
        return false;
      }
      if (typeof context.showPrompt === "function") {
        const anyVisible = Array.isArray(updated) && updated.some((entry) => entry.visible);
        context.showPrompt(
          interaction?.message || (anyVisible ? "Scene module expanded." : "Scene module stowed.")
        );
      }
      return true;
    });

    this.register("portal", async ({ interaction, context }) => {
      if (typeof context.activatePortal !== "function") {
        return false;
      }
      const portalId = typeof interaction?.portalId === "string" ? interaction.portalId.trim() : "";
      if (!portalId) {
        return false;
      }
      const handled = await context.activatePortal(portalId, interaction);
      if (handled && interaction?.message && typeof context.showPrompt === "function") {
        context.showPrompt(interaction.message);
      }
      return Boolean(handled);
    });

    this.register("screen-video", async ({ interaction, context }) => {
      if (typeof context.playScreenVideo !== "function") {
        return false;
      }
      return Boolean(await context.playScreenVideo(interaction));
    });

    this.register("message", async ({ interaction, context }) => {
      if (typeof context.showPrompt !== "function") {
        return false;
      }
      const message = typeof interaction?.message === "string" ? interaction.message.trim() : "";
      if (!message) {
        return false;
      }
      context.showPrompt(message);
      return true;
    });

    this.register("sequence", async ({ target, interaction, context }) => {
      const steps = Array.isArray(interaction?.steps) ? interaction.steps : [];
      if (!steps.length) {
        return false;
      }

      let handled = false;
      for (const step of steps) {
        handled =
          (await this.runInteraction(
            {
              ...target,
              interaction: step
            },
            context
          )) || handled;
      }
      return handled;
    });
  }

  setContext(nextContext = {}) {
    this.context = {
      ...this.context,
      ...nextContext
    };
  }

  register(type, handler) {
    const normalizedType = typeof type === "string" ? type.trim() : "";
    if (!normalizedType || typeof handler !== "function") {
      return false;
    }
    this.handlers.set(normalizedType, handler);
    return true;
  }

  async runInteraction(target, context = this.context) {
    const actionLikeInteraction = normalizeActionLikeInteraction(target);
    const interaction = actionLikeInteraction || normalizeTargetInteraction(target);
    if (!interaction?.type) {
      return false;
    }

    const handler = this.handlers.get(interaction.type);
    if (!handler) {
      return false;
    }

    return Boolean(
      await handler({
        target,
        interaction,
        context,
        director: this
      })
    );
  }

  async activate(target) {
    return this.runInteraction(target, this.context);
  }
}
