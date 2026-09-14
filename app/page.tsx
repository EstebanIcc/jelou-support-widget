import { lookupUserContext } from "@/agent/lib/jelou-gateway";
import { HomeExperience } from "@/components/home-experience";
import { firstName } from "@/lib/utils";

// Correo hardcodeado para probar el flujo de contexto de usuario end-to-end (ver
// agent/channels/eve.ts + agent/instructions/user-context.ts): el agente debería saber
// la compañía de Esteban sin que nadie se la pregunte, y el widget debería saludarlo
// por su nombre apenas se abre.
const DEMO_EMAIL = "esteban@jelou.ai";

export default async function Page() {
  const context = await lookupUserContext(DEMO_EMAIL);
  // En producción este sessionId lo genera Jelou apps (la página que embebe el
  // widget), no el agente — acá se genera uno nuevo en cada carga solo para poder
  // probar el flujo del api-key dinámico del CLI (ver agent/sandbox.ts +
  // agent/lib/support-widget-service.ts) desde esta demo.
  const sessionId = crypto.randomUUID();
  return (
    <HomeExperience
      email={DEMO_EMAIL}
      name={firstName(context?.user.names)}
      sessionId={sessionId}
    />
  );
}
