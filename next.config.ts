import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import { withEve } from "eve/next";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

// Dominios autorizados a embeber /widget en un <iframe>, resuelto en build time
// (Vercel: cambiar esta env var requiere redeploy para tomar efecto). Vacío = abierto
// a cualquier origen. No usamos middleware.ts para esto porque eve empaqueta la app
// como "service" en Vercel y ese runtime no soporta Edge Functions (_middleware) ahí.
const allowedEmbedOrigins = (process.env.ALLOWED_EMBED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const frameAncestors = allowedEmbedOrigins.length > 0 ? allowedEmbedOrigins.join(" ") : "*";

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  async headers() {
    return [
      {
        source: "/widget",
        headers: [
          { key: "Content-Security-Policy", value: `frame-ancestors ${frameAncestors}` },
        ],
      },
    ];
  },
};

export default withEve(nextConfig);
