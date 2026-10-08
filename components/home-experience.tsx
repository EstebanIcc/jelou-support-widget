"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, type CSSProperties } from "react";

import { Button } from "@/components/ui/button";
import {
  COLOR_PRESETS,
  DEFAULT_ASSISTANT_THEME,
  RADIUS_OPTIONS,
  buildThemeCssVars,
  loadAssistantTheme,
  saveAssistantTheme,
  type AssistantRadiusId,
  type AssistantTheme,
} from "@/lib/assistant-theme";
import { cn } from "@/lib/utils";

// ChatWidget lee localStorage al montar (historial persistido, ver
// use-eve-chat-sync.ts) — en el servidor eso no existe, así que el HTML que arma el
// server no puede coincidir con el del navegador ni bien hay algo guardado, y React
// tira "Hydration failed" y re-renderiza todo de cero en el cliente. El widget no
// gana nada con SSR (arranca siempre oculto detrás del botón flotante), así que
// directamente no lo renderizamos en el servidor.
const ChatWidget = dynamic(
  () => import("@/components/chat-widget").then((mod) => mod.ChatWidget),
  { ssr: false },
);
// Mismo valor que STORAGE_KEY en chat-widget.tsx (exportado ahí, pero repetido acá en
// vez de importado: así no se mezcla un import estático con el dynamic de arriba, que
// existe específicamente para evitar que ese módulo se ejecute en el servidor).
const WIDGET_STORAGE_KEY = "jelou-eve-agent:widget-chat";

// Prueba de la integración real (loader + iframe) desde esta misma página — ver
// loadEmbeddedWidget() más abajo y public/widget-loader.js.
const EMBED_SCRIPT_ID = "jelou-widget-loader-test";
const EMBED_CONTAINER_ID = "jelou-widget-container";

type JelouWidgetApi = {
  readonly close: () => void;
  readonly open: () => void;
  readonly toggle: () => void;
};

export function HomeExperience({
  email,
  name,
  sessionId: initialSessionId,
}: {
  readonly email?: string;
  readonly name?: string;
  readonly sessionId?: string;
}) {
  const [theme, setTheme] = useState<AssistantTheme>(DEFAULT_ASSISTANT_THEME);
  const [ready, setReady] = useState(false);
  // sessionId activo (el que de verdad viaja al agente) vs. lo que hay tipeado en el
  // input — separados a propósito: cambiar el input no dispara nada hasta "Aplicar".
  const [sessionId, setSessionId] = useState(initialSessionId ?? "");
  const [sessionIdInput, setSessionIdInput] = useState(initialSessionId ?? "");
  // true mientras el widget embebido de prueba (loader + iframe) está cargado. Se
  // desmonta el ChatWidget directo de abajo mientras tanto: los dos usan la misma
  // esquina de la pantalla y el mismo localStorage, y se pisarían.
  const [embedded, setEmbedded] = useState(false);

  useEffect(() => {
    setTheme(loadAssistantTheme());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    saveAssistantTheme(theme);
  }, [theme, ready]);

  const cssVars = buildThemeCssVars(theme);

  function updateTheme(patch: Partial<AssistantTheme>) {
    setTheme((prev) => ({ ...prev, ...patch }));
  }

  // Aplicar un sessionId nuevo tiene que forzar una sesión de eve nueva, no solo
  // cambiar el header en la sesión ya abierta: agent/sandbox.ts::onSession (donde se
  // pide el api-key dinámico) corre una sola vez por sesión, al arrancarla — si
  // reusáramos la sesión guardada en localStorage, el companyId/sessionId nuevos
  // nunca llegarían a onSession. Por eso se limpia el chat persistido y se remonta
  // todo el ChatWidget con key={sessionId}.
  function applySessionId() {
    const trimmed = sessionIdInput.trim();
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(WIDGET_STORAGE_KEY);
    }
    setSessionId(trimmed);
  }

  // Simula a un sitio externo que integra el widget con <script src="widget-loader.js">
  // y data-open="true": el panel carga ya abierto, sin tocar el botón flotante. Es el
  // mismo camino que usa producción (iframe a /widget + postMessage), no el ChatWidget
  // directo que se renderiza abajo.
  function loadEmbeddedWidget() {
    if (typeof document === "undefined" || embedded) return;
    const script = document.createElement("script");
    script.id = EMBED_SCRIPT_ID;
    script.src = "/widget-loader.js";
    script.dataset.title = theme.title;
    script.dataset.subtitle = theme.subtitle;
    if (email) script.dataset.email = email;
    if (sessionId) script.dataset.sessionId = sessionId;
    script.dataset.open = "true";
    document.body.appendChild(script);
    setEmbedded(true);
  }

  function unloadEmbeddedWidget() {
    document.getElementById(EMBED_SCRIPT_ID)?.remove();
    document.getElementById(EMBED_CONTAINER_ID)?.remove();
    delete (window as unknown as { JelouWidget?: JelouWidgetApi }).JelouWidget;
    setEmbedded(false);
  }

  function callEmbeddedWidget(method: keyof JelouWidgetApi) {
    (window as unknown as { JelouWidget?: JelouWidgetApi }).JelouWidget?.[method]();
  }

  function generateSessionId() {
    const value = crypto.randomUUID();
    setSessionIdInput(value);
  }

  return (
    <div
      className="relative min-h-svh overflow-hidden transition-[background] duration-300"
      style={
        {
          ...cssVars,
          background: cssVars["--assistant-page-bg"],
        } as CSSProperties
      }
    >
      <main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col justify-center gap-12 px-6 py-16">
        <section>
          <p className="mb-3 text-sm font-medium tracking-[0.18em] text-muted-foreground uppercase">
            Chat Widget
          </p>
          <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Asistente Jelou con Eve + shadcn
          </h1>
          <p className="mt-4 max-w-lg text-base leading-7 text-muted-foreground">
            Abre el botón flotante. Personaliza color y bordes aquí; el widget
            cambia al instante.
          </p>
        </section>

        <section
          aria-labelledby="appearance-heading"
          className="max-w-lg space-y-6 border-t border-border pt-8"
        >
          <div>
            <h2
              id="appearance-heading"
              className="text-lg font-semibold tracking-tight text-foreground"
            >
              Apariencia del widget
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Los cambios se aplican en vivo y se guardan en este navegador.
            </p>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Color</p>
            <div className="flex flex-wrap gap-2">
              {COLOR_PRESETS.map((preset) => {
                const active = theme.hue === preset.hue;
                return (
                  <button
                    key={preset.hue}
                    type="button"
                    onClick={() => updateTheme({ hue: preset.hue })}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-foreground hover:bg-accent",
                    )}
                    aria-pressed={active}
                  >
                    <span
                      className="size-3 rounded-full ring-1 ring-black/10"
                      style={{
                        background: `oklch(0.55 0.27 ${preset.hue})`,
                      }}
                    />
                    {preset.label}
                  </button>
                );
              })}
            </div>
            <label className="flex flex-col gap-2 text-sm text-muted-foreground">
              Matiz personalizado ({theme.hue}°)
              <input
                type="range"
                min={0}
                max={360}
                value={theme.hue}
                onChange={(event) =>
                  updateTheme({ hue: Number(event.target.value) })
                }
                className="w-full"
                style={{ accentColor: `oklch(0.55 0.27 ${theme.hue})` }}
              />
            </label>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Bordes</p>
            <div className="flex flex-wrap gap-2">
              {RADIUS_OPTIONS.map((radius) => {
                const active = theme.radius === radius.id;
                return (
                  <button
                    key={radius.id}
                    type="button"
                    onClick={() =>
                      updateTheme({ radius: radius.id as AssistantRadiusId })
                    }
                    className={cn(
                      "border px-3 py-2 text-sm transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-foreground hover:bg-accent",
                    )}
                    style={{ borderRadius: radius.value }}
                    aria-pressed={active}
                  >
                    {radius.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-foreground">Nombre</span>
              <input
                value={theme.title}
                onChange={(event) => updateTheme({ title: event.target.value })}
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-foreground">Subtítulo</span>
              <input
                value={theme.subtitle}
                onChange={(event) =>
                  updateTheme({ subtitle: event.target.value })
                }
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </label>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() => setTheme(DEFAULT_ASSISTANT_THEME)}
          >
            Restaurar apariencia
          </Button>
        </section>

        <section
          aria-labelledby="debug-heading"
          className="max-w-lg space-y-3 border-t border-border pt-8"
        >
          <div>
            <h2
              id="debug-heading"
              className="text-lg font-semibold tracking-tight text-foreground"
            >
              Session ID de prueba
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Lo manda el widget como header al agente, junto al correo. Sirve para
              validar el api-key dinámico del CLI: al aplicar un valor nuevo se
              abre una sesión nueva y deberías ver en la terminal
              {" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                [support-widget-service]
              </code>{" "}
              con ese sessionId.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={sessionIdInput}
              onChange={(event) => setSessionIdInput(event.target.value)}
              placeholder="sessionId"
              className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            <Button type="button" variant="outline" onClick={generateSessionId}>
              Generar
            </Button>
            <Button
              type="button"
              onClick={applySessionId}
              disabled={sessionIdInput.trim() === sessionId}
            >
              Aplicar (sesión nueva)
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Sesión activa:{" "}
            <code className="rounded bg-muted px-1 py-0.5">
              {sessionId || "(sin sessionId)"}
            </code>
          </p>
        </section>

        <section
          aria-labelledby="embed-heading"
          className="max-w-lg space-y-3 border-t border-border pt-8"
        >
          <div>
            <h2
              id="embed-heading"
              className="text-lg font-semibold tracking-tight text-foreground"
            >
              Prueba de integración (iframe)
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Carga el widget como lo haría un sitio externo, con{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                widget-loader.js
              </code>{" "}
              y{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                data-open=&quot;true&quot;
              </code>
              : el panel aparece ya abierto, sin tocar el botón flotante. Mientras
              esté cargado se oculta el widget directo de esta página.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {embedded ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => callEmbeddedWidget("open")}
                >
                  JelouWidget.open()
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => callEmbeddedWidget("close")}
                >
                  JelouWidget.close()
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => callEmbeddedWidget("toggle")}
                >
                  JelouWidget.toggle()
                </Button>
                <Button type="button" onClick={unloadEmbeddedWidget}>
                  Quitar widget embebido
                </Button>
              </>
            ) : (
              <Button type="button" onClick={loadEmbeddedWidget}>
                Cargar widget ya abierto
              </Button>
            )}
          </div>
        </section>
      </main>

      {embedded ? null : (
        <ChatWidget
          key={sessionId}
          title={theme.title}
          subtitle={theme.subtitle}
          email={email}
          name={name}
          sessionId={sessionId}
        />
      )}
    </div>
  );
}
