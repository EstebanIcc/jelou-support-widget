#!/usr/bin/env node
import { existsSync, readFileSync, unlinkSync } from "node:fs";

/**
 * `next dev` (16.3 preview) escribe `.next/dev/lock` con el PID que lo levantó y se
 * niega a arrancar mientras ese archivo exista ("Another next dev server is already
 * running") — pero en Windows, cuando el proceso anterior se corta de golpe (cerrar la
 * terminal, VS Code que se cierra, un Ctrl+C que no llega a limpiar), el archivo queda
 * ahí apuntando a un PID que ya no existe, y el error se repite en cada `npm run dev`
 * aunque no haya nada corriendo de verdad.
 *
 * Este script corre antes de `next dev` (ver "predev" en package.json — npm lo ejecuta
 * solo, no hace falta llamarlo a mano) y borra el lock SOLO si el PID que contiene ya
 * no está vivo. Si hay un servidor real corriendo, lo deja intacto y `next dev` muestra
 * su mensaje normal (con el puerto/PID del que sí sigue corriendo).
 */
const LOCK_PATH = ".next/dev/lock";

function isAlive(pid) {
  try {
    // Señal 0: no manda nada, solo pregunta si el proceso existe. Funciona en Windows
    // también (Node lo traduce a OpenProcess por debajo).
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // Existe pero no tenemos permiso para verlo: mejor tratarlo como vivo que borrar
    // el lock de un servidor que sí está corriendo.
    return error?.code === "EPERM";
  }
}

if (existsSync(LOCK_PATH)) {
  try {
    const { pid } = JSON.parse(readFileSync(LOCK_PATH, "utf8"));
    if (typeof pid !== "number" || !isAlive(pid)) {
      unlinkSync(LOCK_PATH);
      console.log(`[predev] lock obsoleto (PID ${pid}) borrado — no había ningún servidor corriendo.`);
    }
  } catch {
    // Lock corrupto/ilegible: mejor borrarlo que bloquear el arranque para siempre.
    unlinkSync(LOCK_PATH);
    console.log("[predev] lock ilegible borrado.");
  }
}
