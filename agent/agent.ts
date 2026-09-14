import { openai } from "@ai-sdk/openai";
import { defineAgent } from "eve";

export default defineAgent({
  // Usa OPENAI_API_KEY en .env.local. GPT-5.6 Luna: el tier más rápido/económico de la
  // familia GPT-5.6 (~nano), pensado para chat/clasificación de alto volumen — la
  // api-key que la habilita tiene que tener acceso a ese modelo en tu cuenta/proyecto de
  // OpenAI (si la key nueva que agregaste es de otra cuenta/proyecto, actualizá
  // OPENAI_API_KEY en .env.local con esa).
  // Para Vercel AI Gateway: model: "anthropic/claude-sonnet-5" + AI_GATEWAY_API_KEY.
  model: openai("gpt-5.6-luna"),
});
