export type AssistantRadiusId = "sm" | "md" | "lg";

export type AssistantTheme = {
  hue: number;
  radius: AssistantRadiusId;
  title: string;
  subtitle: string;
};

export const RADIUS_OPTIONS: {
  id: AssistantRadiusId;
  label: string;
  value: string;
}[] = [
  { id: "sm", label: "Compacto", value: "0.4rem" },
  { id: "md", label: "Medio", value: "0.625rem" },
  { id: "lg", label: "Suave", value: "1rem" },
];

export const COLOR_PRESETS: { label: string; hue: number }[] = [
  { label: "Azul eléctrico", hue: 255 },
  { label: "Cian", hue: 210 },
  { label: "Índigo", hue: 275 },
  { label: "Violeta", hue: 300 },
  { label: "Verde agua", hue: 175 },
];

export const DEFAULT_ASSISTANT_THEME: AssistantTheme = {
  hue: 255,
  radius: "md",
  title: "Asistente Jelou",
  subtitle: "Docs MCP · Eve",
};

const STORAGE_KEY = "jelou-eve-assistant-theme";

export function buildThemeCssVars(
  theme: AssistantTheme,
): Record<string, string> {
  const h = theme.hue;
  const radius =
    RADIUS_OPTIONS.find((r) => r.id === theme.radius)?.value ?? "0.625rem";

  return {
    "--radius": radius,
    "--background": `oklch(0.985 0.01 ${h})`,
    "--foreground": `oklch(0.2 0.04 ${h})`,
    "--card": `oklch(1 0.005 ${h})`,
    "--card-foreground": `oklch(0.2 0.04 ${h})`,
    "--popover": `oklch(1 0.005 ${h})`,
    "--popover-foreground": `oklch(0.2 0.04 ${h})`,
    "--primary": `oklch(0.55 0.27 ${h})`,
    "--primary-foreground": `oklch(0.99 0.01 ${h})`,
    "--secondary": `oklch(0.94 0.04 ${h})`,
    "--secondary-foreground": `oklch(0.35 0.12 ${h})`,
    "--muted": `oklch(0.95 0.02 ${h})`,
    "--muted-foreground": `oklch(0.5 0.05 ${h})`,
    "--accent": `oklch(0.92 0.06 ${h})`,
    "--accent-foreground": `oklch(0.3 0.14 ${h})`,
    "--border": `oklch(0.9 0.03 ${h})`,
    "--input": `oklch(0.9 0.03 ${h})`,
    "--ring": `oklch(0.55 0.27 ${h})`,
    "--assistant-page-bg": `radial-gradient(circle at top left, oklch(0.92 0.08 ${h}), transparent 45%), radial-gradient(circle at bottom right, oklch(0.9 0.1 ${h}), transparent 40%), oklch(0.97 0.02 ${h})`,
  };
}

export function loadAssistantTheme(): AssistantTheme {
  if (typeof window === "undefined") return DEFAULT_ASSISTANT_THEME;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ASSISTANT_THEME;
    const parsed = JSON.parse(raw) as Partial<AssistantTheme>;
    return {
      ...DEFAULT_ASSISTANT_THEME,
      ...parsed,
      hue:
        typeof parsed.hue === "number"
          ? Math.min(360, Math.max(0, parsed.hue))
          : DEFAULT_ASSISTANT_THEME.hue,
    };
  } catch {
    return DEFAULT_ASSISTANT_THEME;
  }
}

export function saveAssistantTheme(theme: AssistantTheme) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
}
