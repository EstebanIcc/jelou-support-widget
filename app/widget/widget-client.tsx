"use client";

import dynamic from "next/dynamic";

import type { ChatWidgetProps } from "@/components/chat-widget";

// Mismo motivo que en home-experience.tsx: ChatWidget lee localStorage al montar y
// eso rompe la hidratación si se intenta armar en el servidor. `ssr: false` de
// next/dynamic solo se puede usar desde un Client Component — por eso este archivo
// aparte, ya que app/widget/page.tsx es un Server Component (necesita resolver
// searchParams + el lookup de usuario antes de renderizar).
const ChatWidget = dynamic(
  () => import("@/components/chat-widget").then((mod) => mod.ChatWidget),
  { ssr: false },
);

export function WidgetClient(props: ChatWidgetProps) {
  return <ChatWidget {...props} />;
}
