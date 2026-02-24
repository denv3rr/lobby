function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return "-";
  }
  return Math.round(value).toString();
}

export function createPerfHud({ mount }) {
  const panel = document.createElement("div");
  panel.className = "perf-hud";
  panel.setAttribute("data-ui", "1");
  panel.textContent = "Perf: initializing...";
  mount.appendChild(panel);

  let fps = 0;
  let fpsFrames = 0;
  let fpsClock = 0;

  return {
    update({ delta = 0, stats = null } = {}) {
      fpsFrames += 1;
      fpsClock += delta;
      if (fpsClock >= 0.5) {
        fps = fpsFrames / fpsClock;
        fpsFrames = 0;
        fpsClock = 0;
      }

      const render = stats?.render || {};
      const props = stats?.props || {};
      const propTags = props.byTag || {};
      const themeExtraCount = propTags["theme-extra"] || 0;

      panel.textContent = [
        `FPS ${formatNumber(fps)}`,
        `Draw ${formatNumber(render.calls)}`,
        `Tri ${formatNumber(render.triangles)}`,
        `Geo ${formatNumber(render.geometries)}`,
        `Tex ${formatNumber(render.textures)}`,
        `Theme ${stats?.theme || "-"}`,
        `ThemeProps ${formatNumber(themeExtraCount)}`,
        `Targets ${formatNumber(stats?.interactionTargetCount)}`,
        `HeapMB ${stats?.jsHeapMb ?? "-"}`
      ].join(" | ");
    },
    dispose() {
      panel.remove();
    }
  };
}
