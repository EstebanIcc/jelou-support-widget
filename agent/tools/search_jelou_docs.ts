import { defineTool } from "eve/tools";
import { z } from "zod";

import { searchJelouDocs } from "../lib/jelou-mcp";

export default defineTool({
  description:
    "Busca en la documentación pública de Jelou AI (MCP docs.jelou.ai). Úsala antes de responder cualquier pregunta sobre Jelou.",
  inputSchema: z.object({
    query: z.string().min(1).describe("Consulta de búsqueda"),
    language: z
      .string()
      .optional()
      .describe("Código de idioma, por defecto es"),
  }),
  async execute({ query, language }) {
    const text = await searchJelouDocs(query, language ?? "es");
    return { results: text.slice(0, 12_000) };
  },
});
