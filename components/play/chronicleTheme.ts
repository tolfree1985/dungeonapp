export const chronicleTheme = {
  bg: "#0b0c0d",
  panel: "rgba(10,10,10,0.68)",
  panelDeep: "rgba(6,6,7,0.9)",
  border: "rgba(180,160,120,0.18)",
  borderSoft: "rgba(180,160,120,0.12)",
  text: "#e7e2d9",
  textMuted: "rgba(231,226,217,0.72)",
  accent: "#b8955f",
  warning: "#c89a4b",
  danger: "#b35a4a",
  debug: "rgba(165,181,208,0.72)",
} as const;

export type ChroniclePanelTone = "default" | "warning" | "danger" | "debug";

export const chroniclePanelRoles = {
  latestTurn: "Latest Turn",
  resolution: "Resolution",
  consequences: "Consequences",
  commandComposer: "Command Composer",
  careNow: "Care Now",
  world: "World",
  state: "State",
  inventory: "Inventory",
  relations: "Relations",
  causalLedger: "Causal Ledger",
  devInspection: "Dev Inspection",
} as const;
