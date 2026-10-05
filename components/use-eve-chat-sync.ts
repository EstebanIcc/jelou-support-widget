"use client";

import { Client, type HandleMessageStreamEvent, type SessionState } from "eve/client";
import { useCallback, useEffect, useRef, useState } from "react";

/** Tiempo máximo que se conserva una conversación en localStorage antes de descartarla. */
const CHAT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Conversación de eve persistida en localStorage: el log de eventos crudo
 * (para renderizar el historial sin re-pedirlo al servidor) más el cursor de
 * sesión (para poder seguir enviando turnos). `done` marca una sesión que ya
 * terminó (`session.completed`/`session.failed`) para que el watcher deje de
 * consultarla. `savedAt` es el timestamp (`Date.now()`) de la última escritura
 * — se usa para expirar y descartar automáticamente todo lo que tenga más de
 * `CHAT_TTL_MS` (24h), tanto si sigue abierta la pestaña como si el usuario
 * vuelve más tarde y la lee recién al montar.
 */
export interface PersistedEveChat {
  readonly events: readonly HandleMessageStreamEvent[];
  readonly session?: SessionState;
  readonly done?: boolean;
  readonly savedAt?: number;
}

export function readPersistedChat(storageKey: string): PersistedEveChat {
  if (typeof window === "undefined") return { events: [] };
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return { events: [] };
    const parsed = JSON.parse(raw) as Partial<PersistedEveChat>;
    // Sin `savedAt` (dato de antes de este cambio) o más viejo que el TTL: se
    // descarta como si no hubiera nada guardado, y se limpia la entrada vieja
    // de localStorage de una vez — no tiene sentido dejarla ahí ocupando
    // espacio si de todos modos la vamos a ignorar en cada lectura futura.
    const savedAt = parsed.savedAt;
    if (savedAt === undefined || Date.now() - savedAt > CHAT_TTL_MS) {
      clearPersistedChat(storageKey);
      return { events: [] };
    }
    return {
      done: parsed.done,
      events: parsed.events ?? [],
      savedAt,
      session: parsed.session,
    };
  } catch {
    return { events: [] };
  }
}

export function writePersistedChat(
  storageKey: string,
  chat: Omit<PersistedEveChat, "savedAt">,
) {
  if (typeof window === "undefined") return;
  try {
    // Dos escritores independientes tocan esta misma clave: la conexión principal
    // (`useEveAgent`, vía `onFinish` en agent-chat.tsx/chat-widget.tsx) y el watcher
    // de reconexión (más abajo), que abre su PROPIA conexión de bajo nivel a la
    // misma sesión para detectar actividad externa. Cada uno lleva su propia cuenta
    // de `session.streamIndex` sin saber del otro. Si la conexión principal termina
    // un turno y escribe con un streamIndex más chico que el que el watcher ya había
    // avanzado (porque juntó eventos externos mientras tanto), el cursor retrocede —
    // y en la próxima vuelta el watcher vuelve a pedir desde ese punto más viejo,
    // redescubre lo mismo que ya había visto, y vuelve a forzar un remount. Si esto
    // se repite en cada turno, el remount (que reinicia `Conversation` con
    // `initial="smooth"`) se ve como un auto-scroll que no para nunca, y de paso
    // tira abajo el formulario a mitad de uso. Por eso el streamIndex nunca
    // retrocede acá: siempre se queda con el mayor entre lo que ya había y lo nuevo.
    const previous = readPersistedChat(storageKey);
    const session =
      chat.session === undefined
        ? previous.session
        : {
            ...chat.session,
            streamIndex: Math.max(
              chat.session.streamIndex ?? 0,
              previous.session?.streamIndex ?? 0,
            ),
          };

    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        ...chat,
        savedAt: Date.now(),
        session,
      } satisfies PersistedEveChat),
    );
  } catch {
    // localStorage lleno o no disponible (modo privado, cuota excedida): no persistimos,
    // la conversación sigue funcionando en memoria para esta pestaña.
  }
}

export function clearPersistedChat(storageKey: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // no-op
  }
}

/**
 * `useEveAgent` solo mantiene el stream abierto mientras dura un turno que
 * ella misma inició (ver eve/docs/guides/frontend/overview.mdx): en cuanto la
 * sesión llega a `session.waiting`, la conexión se cierra. Eso significa que
 * si algo externo reanuda esa sesión — por ejemplo, la respuesta de un equipo
 * a un escalamiento entregada vía `el backend (widget_back_end): /escalations/respond` — el navegador
 * nunca se entera, aunque la pestaña siga abierta.
 *
 * Este hook cubre ambos huecos:
 * 1. Restaura la conversación desde localStorage al montar, para sobrevivir
 *    recargas y cierres de pestaña (patrón "Resumable sessions" de eve).
 * 2. Mientras la conversación está inactiva (`reportIdle(true)`), vigila en
 *    segundo plano con el cliente de bajo nivel por eventos nuevos que hayan
 *    llegado a esa misma sesión desde afuera. Al detectarlos, los mezcla en lo
 *    persistido e incrementa `generation` — el llamador debe usarlo como
 *    `key` del árbol que contiene `useEveAgent` para forzar un remount que
 *    relea el estado ya actualizado.
 */
export function useEveChatWatcher(storageKey: string) {
  const [generation, setGeneration] = useState(0);
  const idleRef = useRef(false);

  const reportIdle = useCallback((idle: boolean) => {
    idleRef.current = idle;
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Red de seguridad ante el caso de arriba (streamIndex que retrocede y vuelve a
    // avanzar hasta el mismo punto): si dos vueltas seguidas del loop terminan
    // bumpeando `generation` hacia el MISMO streamIndex resultante, es que no hay
    // nada nuevo de verdad — estamos remontando el árbol entero en bucle por algo
    // que ya procesamos. Cortamos ahí en vez de seguir remontando sin parar (eso es
    // lo que se percibe como "el auto-scroll no termina nunca" y tira abajo el
    // formulario a mitad de uso).
    let lastBumpedIndex: number | null = null;

    async function watchLoop() {
      while (!cancelled) {
        const current = readPersistedChat(storageKey);
        const knownIndex = current.session?.streamIndex ?? 0;

        if (!current.session?.sessionId || current.done || !idleRef.current) {
          await sleep(4_000);
          continue;
        }

        const collected: HandleMessageStreamEvent[] = [];
        const controller = new AbortController();
        // Fase 1: espera larga por si no llega nada nuevo. Fase 2: al llegar el primer
        // evento, una ventana corta para juntar el resto de la misma ráfaga (por ejemplo
        // el mensaje del equipo + el session.waiting que lo cierra) antes de cortar.
        const longWait = setTimeout(() => controller.abort(), 20_000);
        let burstWait: ReturnType<typeof setTimeout> | undefined;

        try {
          const client = new Client({ host: process.env.NEXT_PUBLIC_EVE_BACKEND_URL ?? "" });
          const peek = client.session({ sessionId: current.session.sessionId, streamIndex: 0 });
          for await (const event of peek.stream({ startIndex: knownIndex, signal: controller.signal })) {
            // Si mientras juntábamos eventos la propia pestaña volvió a estar activa
            // (el usuario mandó un mensaje nuevo desde acá mismo), lo que está llegando
            // por este canal son los eventos de ESE turno — no una reanudación externa.
            // `useEveAgent` ya los está reflejando por su cuenta en tiempo real; si
            // igual los juntamos acá y forzamos un remount más abajo, el turno recién
            // terminado se "historiza" de golpe (se relee desde localStorage como si ya
            // hubiera estado ahí desde el montaje), y entonces cosas como el reveal
            // progresivo del texto (ver isNew en agent-message.tsx/agent-chat.tsx) lo ven
            // como mensaje viejo y lo muestran completo de una en vez de ir de a poco.
            // Cortamos apenas se detecta esto, sin sumar el evento a `collected`.
            if (!idleRef.current) {
              controller.abort();
              break;
            }
            collected.push(event);
            clearTimeout(longWait);
            if (burstWait) clearTimeout(burstWait);
            burstWait = setTimeout(() => controller.abort(), 800);
          }
        } catch {
          // Abort esperado (timeout sin novedades, o fin de ráfaga) — no es un error real.
        } finally {
          clearTimeout(longWait);
          if (burstWait) clearTimeout(burstWait);
        }

        if (cancelled) return;

        // Chequeo final: si para cuando terminamos de juntar la ráfaga la pestaña ya
        // no está idle, descartamos igual aunque `collected` no esté vacío — puede
        // haberse llenado con eventos propios en el instante justo antes de que el
        // `break` de arriba alcanzara a cortar. Se pierde nada: el próximo ciclo del
        // loop (en ~1s) vuelve a intentar leer desde el mismo streamIndex.
        if (collected.length > 0 && idleRef.current) {
          const nextIndex = knownIndex + collected.length;

          if (nextIndex === lastBumpedIndex) {
            // Mismo resultado que la vuelta anterior: no es una reanudación externa
            // nueva, es el mismo rango reapareciendo (streamIndex que no avanzó de
            // verdad). No volvemos a remontar — dormimos más largo y reintentamos
            // más adelante, por si la próxima vez sí hay algo genuinamente nuevo.
            await sleep(10_000);
            continue;
          }

          let continuationToken = current.session.continuationToken;
          let done: boolean = current.done ?? false;
          for (const event of collected) {
            if (event.type === "session.waiting") continuationToken = event.data.continuationToken;
            if (event.type === "session.completed" || event.type === "session.failed") done = true;
          }

          writePersistedChat(storageKey, {
            done,
            events: [...current.events, ...collected],
            session: {
              continuationToken,
              sessionId: current.session.sessionId,
              streamIndex: nextIndex,
            },
          });
          lastBumpedIndex = nextIndex;
          setGeneration((value) => value + 1);
        }

        await sleep(1_000);
      }
    }

    void watchLoop();
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  return { generation, reportIdle };
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
