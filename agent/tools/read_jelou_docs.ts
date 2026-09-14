import { defineTool } from "eve/tools";
import { z } from "zod";

import { queryJelouDocsFilesystem } from "../lib/jelou-mcp";

export default defineTool({
  description:
    "Lee o explora el filesystem virtual de docs Jelou (rg, head, cat, tree, ls). Úsala para leer páginas .mdx concretas después de search_jelou_docs.",
  inputSchema: z.object({
    command: z
      .string()
      .min(1)
      .describe("Comando read-only, p.ej. head -80 /quickstart.mdx"),
  }),
  async execute({ command }) {
    const text = await queryJelouDocsFilesystem(command);
    return { content: text.slice(0, 12_000) };
  },
});
