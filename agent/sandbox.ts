import { defineSandbox } from "eve/sandbox";

/**
 * Preinstala @jelou/cli en la plantilla del sandbox (una sola vez, cacheado por
 * revalidationKey). La autenticación del CLI (api-key dinámico por company) ya NO pasa
 * por acá — antes vivía en `onSession`, pero ese hook resultó no ser confiable: en una
 * sesión reanudada (el navegador ya tenía una sesión de eve guardada) simplemente no
 * se vuelve a ejecutar, así que un visitante que retomaba una conversación vieja se
 * quedaba con el analizador sin autenticar para siempre.
 *
 * Ahora la autenticación vive en agent/lib/cli-auth.ts y se dispara desde
 * agent/tools/analizador.ts, en el momento real en que arranca la interacción con el
 * analizador — código determinístico, no un hook de ciclo de vida ni una regla que el
 * modelo tenga que decidir seguir.
 */
const JELOU_CLI_PACKAGE = "@jelou/cli@latest";

export default defineSandbox({
  // Sube esta clave si cambias el paquete/versión instalada para forzar
  // rebuild de la plantilla del sandbox.
  revalidationKey: () => "jelou-cli-v1",

  async bootstrap({ use }) {
    const sandbox = await use();
    await sandbox.run({ command: `npm install -g ${JELOU_CLI_PACKAGE}` });
  },
});
