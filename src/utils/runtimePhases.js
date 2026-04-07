export const ARTIFACT_TRANSITION_RUNTIME_PHASE = "artifact-transition";

const RUNTIME_PHASE_ALIASES = new Map([
  ["", ""],
  ["always", ""],
  ["artifact-transition", ARTIFACT_TRANSITION_RUNTIME_PHASE],
  ["artifact-fog", ARTIFACT_TRANSITION_RUNTIME_PHASE],
  ["artifactfog", ARTIFACT_TRANSITION_RUNTIME_PHASE],
  ["fog-transition", ARTIFACT_TRANSITION_RUNTIME_PHASE],
  ["fogtransition", ARTIFACT_TRANSITION_RUNTIME_PHASE]
]);

export const RUNTIME_PHASE_OPTIONS = [
  {
    id: "",
    label: "Always Visible"
  },
  {
    id: ARTIFACT_TRANSITION_RUNTIME_PHASE,
    label: "Reveal With Artifact Fog"
  }
];

export function normalizeRuntimePhase(value) {
  const normalized =
    typeof value === "string" ? value.trim().toLowerCase() : "";
  return RUNTIME_PHASE_ALIASES.get(normalized) || "";
}

export function getRuntimePhaseLabel(value) {
  const normalized = normalizeRuntimePhase(value);
  return (
    RUNTIME_PHASE_OPTIONS.find((entry) => entry.id === normalized)?.label ||
    RUNTIME_PHASE_OPTIONS[0].label
  );
}

export function getRuntimePhaseModuleId(value) {
  const normalized = normalizeRuntimePhase(value);
  return normalized ? `phase:${normalized}` : "";
}

export function getRuntimePhaseModuleIds(value) {
  const moduleId = getRuntimePhaseModuleId(value);
  return moduleId ? [moduleId] : [];
}
