"use client";

import { motion } from "motion/react";

/**
 * Isotipo de Jelou (la "J" con el punto) — mismo componente que ya usa el chat de
 * Studio, ver la definición confirmada por diseño. Reemplaza al placeholder de texto
 * "J" en los avatares del widget (ver components/chat-widget.tsx). Decorativo por
 * defecto (`aria-hidden`): si en algún momento se usa dentro de un botón sin más
 * contexto visual, el texto accesible va en el botón, no acá.
 */
export function JelouIsotype({ size = 30 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 36 36"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        fill="#00B3C7"
        d="M14.07 20.536H10c.233 4.13 3.675 7.464 7.748 7.464 4.26 0 7.725-3.552 7.725-7.917v-7.388h-4.058v7.388a3.7 3.7 0 0 1-1.072 2.648c-.714.729-1.636 1.13-2.596 1.13-.968 0-1.927-.412-2.631-1.13a3.7 3.7 0 0 1-1.046-2.196"
      />
      <path
        fill="#00B3C7"
        d="M14.988 9.803C14.988 8.257 16.221 7 17.736 7s2.749 1.257 2.749 2.803-1.233 2.804-2.749 2.804c-1.515 0-2.748-1.258-2.748-2.804"
      />
    </svg>
  );
}


/**
 * Variante animada del isotipo para el indicador de "pensando" del widget (ver
 * components/chat-widget.tsx) — un pulso sutil de escala/opacidad, en el mismo
 * timing que el shimmer del texto (app/globals.css, @utility shimmer, 1.4s), para
 * que el logo también tenga movimiento propio y no solo el texto de al lado.
 */
export function AnimatedJelouIsotype({ size = 30 }: { size?: number }) {
  return (
    <motion.div
      animate={{ scale: [1, 1.08, 1], opacity: [0.75, 1, 0.75] }}
      style={{ display: "inline-flex" }}
      transition={{ duration: 1.4, ease: "easeInOut", repeat: Number.POSITIVE_INFINITY }}
    >
      <JelouIsotype size={size} />
    </motion.div>
  );
}
