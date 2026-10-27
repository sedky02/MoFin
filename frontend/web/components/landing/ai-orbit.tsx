"use client";

import { motion } from "motion/react";
import { LogoMark } from "@/components/brand/logo";
import { AnthropicLogo, GeminiLogo, OpenAILogo } from "@/components/common/ai-logos";

const APPS = [
  { name: "Claude", Logo: AnthropicLogo, angle: -90 },
  { name: "ChatGPT", Logo: OpenAILogo, angle: 30 },
  { name: "Gemini", Logo: GeminiLogo, angle: 150 },
];

// Logos sit on the dashed ring: 18rem box, ring inset 12% → radius 0.38 × 18rem.
const RADIUS = "6.84rem";

// One turn a minute: slow enough to read as calm, not as a pulse. Stops with reduced motion.
const TURN = { duration: 60, ease: "linear", repeat: Infinity } as const;

/** The AI apps MoFin works with, circling the MoFin mark. Decorative. */
export function AiOrbit() {
  return (
    <div aria-hidden className="relative mx-auto size-72">
      <div className="absolute inset-[12%] rounded-full border border-dashed border-border" />
      <div className="absolute inset-0 flex items-center justify-center">
        <LogoMark className="size-20 drop-shadow-[0_8px_24px_color-mix(in_oklab,var(--primary)_35%,transparent)]" />
      </div>
      <motion.div className="absolute inset-0" animate={{ rotate: 360 }} transition={TURN}>
        {APPS.map(({ name, Logo, angle }) => (
          <div
            key={name}
            // Turns about its top-left corner, which sits on the ring's centre.
            className="absolute top-1/2 left-1/2 origin-top-left"
            style={{ transform: `rotate(${angle}deg) translateX(${RADIUS})` }}
          >
            {/* Counter-turn so each logo stays upright. */}
            <motion.div
              // Sized like the chip, so it is centred on the ring and turns about its own middle.
              className="size-14 -translate-x-1/2 -translate-y-1/2"
              style={{ rotate: -angle }}
              animate={{ rotate: -angle - 360 }}
              transition={TURN}
            >
              <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-card shadow-surface">
                <Logo className="size-6" />
              </div>
            </motion.div>
          </div>
        ))}
      </motion.div>
    </div>
  );
}
