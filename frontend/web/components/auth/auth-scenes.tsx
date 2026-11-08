import { cn } from "@/lib/utils";

// Small scenes for the result screens, so an icon never sits alone. Every piece is its own element
// (rings, disc, confetti), ready to animate later.

type Piece = { kind: "rect" | "dot" | "tri"; x: number; y: number; w?: number; h?: number; r?: number; tone: "ink" | "lime" | "acc" };

const CONFETTI: Piece[] = [
  { kind: "rect", x: 38, y: 22, w: 9, h: 4, r: -30, tone: "ink" },
  { kind: "dot", x: 62, y: 10, r: 3.2, tone: "lime" },
  { kind: "rect", x: 146, y: 16, w: 9, h: 4, r: 35, tone: "acc" },
  { kind: "dot", x: 172, y: 42, r: 3.4, tone: "ink" },
  { kind: "rect", x: 178, y: 72, w: 4, h: 9, r: 20, tone: "lime" },
  { kind: "dot", x: 162, y: 112, r: 3, tone: "acc" },
  { kind: "rect", x: 138, y: 124, w: 9, h: 4, r: -25, tone: "ink" },
  { kind: "dot", x: 98, y: 134, r: 2.6, tone: "lime" },
  { kind: "rect", x: 52, y: 120, w: 9, h: 4, r: 40, tone: "acc" },
  { kind: "dot", x: 24, y: 100, r: 3.4, tone: "lime" },
  { kind: "rect", x: 14, y: 56, w: 4, h: 9, r: -15, tone: "ink" },
  { kind: "dot", x: 30, y: 36, r: 2.6, tone: "acc" },
  { kind: "tri", x: 70, y: 124, tone: "lime" },
];

const TONE = { ink: "fill-foreground", lime: "fill-brand-lime", acc: "fill-primary-text" } as const;

function Pieces({ pieces }: { pieces: Piece[] }) {
  return (
    <g data-confetti>
      {pieces.map((p, i) => {
        if (p.kind === "dot") return <circle key={i} cx={p.x} cy={p.y} r={p.r} className={TONE[p.tone]} />;
        if (p.kind === "tri") return <path key={i} d={`M${p.x} ${p.y}l5 9h-10z`} className={TONE[p.tone]} />;
        return (
          <rect
            key={i}
            x={p.x}
            y={p.y}
            width={p.w}
            height={p.h}
            rx={1}
            transform={`rotate(${p.r} ${p.x + (p.w ?? 0) / 2} ${p.y + (p.h ?? 0) / 2})`}
            className={TONE[p.tone]}
          />
        );
      })}
      <path
        d="M120 12q4-6 8 0t8 0"
        fill="none"
        strokeWidth={2.4}
        strokeLinecap="round"
        className="stroke-primary-text"
      />
    </g>
  );
}

const SIZE = "mx-auto block h-[140px] w-[200px] overflow-visible";

export function AuthSuccessScene({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 140" role="img" aria-label="Success" className={cn(SIZE, "h-[174px] w-[248px]", className)}>
      <circle cx={100} cy={70} r={58} fill="none" strokeOpacity={0.18} className="stroke-primary-text" />
      <circle cx={100} cy={70} r={46} fill="none" strokeOpacity={0.32} className="stroke-primary-text" />
      <circle cx={100} cy={70} r={34} className="fill-brand-lime" />
      <path
        d="M85 71l11 11 20-23"
        fill="none"
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-brand-ink"
      />
      <Pieces pieces={CONFETTI} />
    </svg>
  );
}

export function AuthMailScene({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 140" role="img" aria-label="A message on its way" className={cn(SIZE, className)}>
      <circle cx={100} cy={70} r={54} className="fill-primary/15" />
      <path
        d="M30 60h20M24 72h28M32 84h18"
        fill="none"
        strokeOpacity={0.22}
        strokeWidth={3}
        strokeLinecap="round"
        className="stroke-foreground"
      />
      <rect x={68} y={52} width={66} height={46} rx={9} strokeWidth={3} className="fill-card stroke-foreground" />
      <path
        d="M71 58l30 23 30-23"
        fill="none"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-foreground"
      />
      <circle cx={134} cy={52} r={14} className="fill-brand-lime" />
      <path
        d="M127.5 52l4.5 4.5 8-9.5"
        fill="none"
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-brand-ink"
      />
      <g data-confetti>
        <circle cx={160} cy={98} r={3.4} className="fill-brand-lime" />
        <circle cx={46} cy={38} r={2.8} className="fill-primary-text" />
        <rect x={150} y={30} width={8} height={4} rx={1} transform="rotate(35 154 32)" className="fill-foreground" />
        <path d="M156 112q3-5 6 0t6 0" fill="none" strokeWidth={2.2} strokeLinecap="round" className="stroke-primary-text" />
      </g>
    </svg>
  );
}

export function AuthBrokenLinkScene({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 140" role="img" aria-label="A broken link" className={cn(SIZE, className)}>
      <circle cx={100} cy={70} r={54} className="fill-destructive/10" />
      <rect
        x={44}
        y={62}
        width={50}
        height={26}
        rx={13}
        fill="none"
        strokeWidth={4}
        transform="rotate(-12 69 75)"
        className="stroke-destructive"
      />
      <rect
        x={110}
        y={54}
        width={50}
        height={26}
        rx={13}
        fill="none"
        strokeWidth={4}
        transform="rotate(12 135 67)"
        className="stroke-destructive"
      />
      <path
        d="M99 50l-4-9M104 46l1-10M109 50l5-8"
        fill="none"
        strokeWidth={3}
        strokeLinecap="round"
        className="stroke-destructive"
      />
      <g data-confetti className="fill-destructive">
        <circle cx={100} cy={100} r={3} />
        <circle cx={112} cy={108} r={2} fillOpacity={0.6} />
        <circle cx={88} cy={110} r={2.2} fillOpacity={0.6} />
      </g>
    </svg>
  );
}
