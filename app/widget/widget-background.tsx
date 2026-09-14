"use client";

import { useEffect } from "react";

/**
 * Pone el body/html transparentes mientras esta ruta está montada, para que dentro del
 * <iframe> del widget (ver public/widget-loader.js) solo se vea el widget, no un
 * rectángulo de color de fondo. Aislado en su propio client component porque
 * app/widget/page.tsx pasó a ser un Server Component (necesita resolver `searchParams` y
 * el lookup de usuario/compañía server-side antes de renderizar) y los efectos solo
 * pueden vivir en un componente cliente.
 */
export function WidgetBackground() {
  useEffect(() => {
    const previousBodyBg = document.body.style.background;
    const previousHtmlBg = document.documentElement.style.background;
    document.body.style.background = "transparent";
    document.documentElement.style.background = "transparent";
    return () => {
      document.body.style.background = previousBodyBg;
      document.documentElement.style.background = previousHtmlBg;
    };
  }, []);

  return null;
}
