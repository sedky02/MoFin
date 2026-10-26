import type { Metadata } from "next";

// `absolute` skips the root "%s · MoFin" template, so the tab reads just "MoFin".
export const metadata: Metadata = { title: { absolute: "MoFin" } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
