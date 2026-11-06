import * as React from "react";
import { AnthropicLogo, GeminiLogo, OpenAILogo } from "@/components/common/ai-logos";
import { connectorKeyFor, type ConnectorKey } from "@/lib/connected-apps";
import { cn } from "@/lib/utils";

type KnownConnector = Exclude<ConnectorKey, "other">;

/** Each assistant's logo and the tile colours it is shown on. */
export const CONNECTOR_BRAND: Record<
  KnownConnector,
  { Logo: React.ComponentType<React.SVGProps<SVGSVGElement>>; swatch: string }
> = {
  claude: { Logo: AnthropicLogo, swatch: "bg-[#D97757] text-white" },
  // White tile: it needs the hairline to stand out on a light card.
  chatgpt: { Logo: OpenAILogo, swatch: "bg-white text-black ring-1 ring-border" },
  gemini: { Logo: GeminiLogo, swatch: "bg-gradient-to-br from-[#4285f4] via-[#9b72cb] to-[#d96570] text-white" },
};

/**
 * A connected app's logo on its brand tile: Claude, ChatGPT and Gemini have their own, others get
 * the name's first letter. Decorative; the app's name next to it is the label.
 */
export function ConnectorLogo({
  clientName,
  className,
}: {
  clientName: string | null;
  className?: string;
}) {
  const key = connectorKeyFor(clientName);
  const tile = "grid size-9 shrink-0 place-items-center rounded-lg";
  if (key === "other") {
    return (
      <span aria-hidden className={cn(tile, "rounded-full bg-primary/15 text-sm font-semibold text-primary-text", className)}>
        {(clientName ?? "?").charAt(0).toUpperCase()}
      </span>
    );
  }
  const { Logo, swatch } = CONNECTOR_BRAND[key];
  return (
    <span aria-hidden className={cn(tile, swatch, className)}>
      <Logo aria-hidden className="size-5" />
    </span>
  );
}
