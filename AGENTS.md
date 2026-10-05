# jelou-eve-agent (frontend / widget)

Este proyecto es solo el FRONTEND del widget de chat (Next.js + shadcn). El agente
(framework eve: instructions, tools, skills, canales, y los endpoints
/analizador/status, /attachments/upload-image, /escalations/respond,
/internal/user-context) vive aparte, en el proyecto hermano `widget_back_end`, y se
consume acá por HTTP vía `NEXT_PUBLIC_EVE_BACKEND_URL` (ver components/chat-widget.tsx
y lib/backend-user-context.ts).

Este proyecto sigue dependiendo del paquete `eve` solo por su SDK de cliente
(`eve/client`, `eve/react`) — no corre `eve dev`/`eve build` acá ni tiene carpeta
`agent/`. Si necesitas tocar la lógica del agente en sí, hazlo en `widget_back_end`,
no en este repo.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.
<!-- END:nextjs-agent-rules -->
