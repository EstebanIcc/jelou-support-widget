import { defineTool } from "eve/tools";
import { z } from "zod";

import { resolveCliToken } from "../lib/cli-auth";

/**
 * "Analizador": consulta de solo lectura sobre el proyecto de Jelou (conversaciones,
 * errores, estado, proyectos, canales), ejecutada por debajo con @jelou/cli en el
 * sandbox ya autenticado. Nunca lo menciones como "CLI" frente al usuario.
 *
 * Diseño de seguridad: allowlist por defecto-denegar. Cada comando de nivel superior
 * necesita una regla explícita abajo para poder ejecutarse; cualquier cosa no listada
 * (incluyendo login/logout/auth/secret/profiles, y cualquier acción que cree, modifique,
 * publique o envíe algo) queda bloqueada automáticamente, no por una lista de excepciones.
 */
type Rule =
  | { kind: "any-subcommand" }
  | { kind: "subcommands"; allowed: string[] }
  | { kind: "requires-flag"; flag: string };

const READONLY_RULES: Record<string, Rule> = {
  whoami: { kind: "any-subcommand" },
  doctor: { kind: "any-subcommand" },
  status: { kind: "any-subcommand" },
  changelog: { kind: "any-subcommand" },
  update: { kind: "any-subcommand" },
  metrics: { kind: "any-subcommand" },
  models: { kind: "any-subcommand" },
  connect: { kind: "any-subcommand" },
  logs: { kind: "any-subcommand" },
  project: { kind: "subcommands", allowed: ["list", "show"] },
  channels: { kind: "subcommands", allowed: ["list"] },
  test: { kind: "subcommands", allowed: ["trace", "turn", "chats", "grep"] },
  link: { kind: "requires-flag", flag: "--status" },
};

export default defineTool({
  description:
    "Analizador de Jelou: consulta información real y actualizada del proyecto del usuario " +
    "(conversaciones, errores, estado, proyectos, canales). Es de solo lectura: no puede " +
    "crear, modificar, publicar, enviar ni borrar nada, aunque se le pida explícitamente. " +
    "Úsalo cuando el usuario pida revisar, ejecutar una revisión, ver, diagnosticar o " +
    "entender algo sobre su bot, proyecto o una conversación puntual.",
  inputSchema: z.object({
    args: z
      .array(z.string())
      .min(1)
      .describe(
        'Argumentos de consulta, ej. ["logs","chat","--bot-id","...","--failed-only"] o ["project","list"].',
      ),
  }),
  outputSchema: z.object({
    exitCode: z.number(),
    stdout: z.string(),
    stderr: z.string(),
  }),
  async execute({ args }, ctx) {
    const [command, subcommand] = args;
    const denialReason = explainDenial(command, subcommand, args);
    if (denialReason) {
      return { exitCode: 1, stdout: "", stderr: denialReason };
    }

    // Resuelve el api-key acá mismo, en el momento real en que arranca esta interacción
    // con el analizador — no antes (ver agent/lib/cli-auth.ts). Se pasa como JELOU_TOKEN
    // en el env de CADA comando (no hay `jelou login` previo: el CLI lo rechaza con
    // AUTH_ERROR para este tipo de token — ver el comentario en cli-auth.ts).
    const token = await resolveCliToken(ctx);
    if ("error" in token) {
      return { exitCode: 1, stdout: "", stderr: token.error };
    }

    const sandbox = await ctx.getSandbox();
    const quoted = args.map(shellQuote).join(" ");
    const fullCommand = `jelou ${quoted} --agent`;
    console.log(`[analizador] ejecutando: ${fullCommand}`);
    const result = await sandbox.run({
      command: fullCommand,
      env: { JELOU_TOKEN: token.apiKey },
      abortSignal: ctx.abortSignal,
    });
    console.log(
      `[analizador] exitCode=${result.exitCode} stdout=${result.stdout.slice(0, 500)} stderr=${result.stderr.slice(0, 500)}`,
    );

    return {
      exitCode: result.exitCode,
      stdout: result.stdout.slice(0, 8_000),
      stderr: result.stderr.slice(0, 4_000),
    };
  },
});

function explainDenial(
  command: string | undefined,
  subcommand: string | undefined,
  args: string[],
): string | undefined {
  if (!command) {
    return "Falta indicar qué se quiere consultar.";
  }

  const rule = READONLY_RULES[command];
  if (!rule) {
    return `No disponible: el analizador solo puede consultar/ver información, nunca crear, modificar, publicar, enviar ni autenticar ("${command}" queda fuera de eso).`;
  }

  switch (rule.kind) {
    case "any-subcommand":
      return undefined;
    case "subcommands": {
      if (subcommand !== undefined && rule.allowed.includes(subcommand)) {
        return undefined;
      }
      const label = `${command} ${subcommand ?? ""}`.trim();
      return `"${label}" no está permitido: desde aquí solo se puede consultar (${rule.allowed.join(", ")}).`;
    }
    case "requires-flag": {
      if (args.includes(rule.flag)) {
        return undefined;
      }
      return `"${command}" solo se puede usar en modo consulta, agregando ${rule.flag} a los args.`;
    }
  }
}

/** Quoting POSIX estándar: envuelve en comillas simples, escapa comillas simples internas. */
function shellQuote(arg: string): string {
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}
