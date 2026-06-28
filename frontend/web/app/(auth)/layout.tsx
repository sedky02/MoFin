import { Fingerprint, ShieldCheck, Gauge, Zap } from "lucide-react";
import { Logo } from "@/components/brand/logo";

// Split "Terminal Access": a secure-node visual beside the auth form.
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative grid min-h-dvh overflow-hidden bg-background lg:grid-cols-2">
      {/* Atmospheric glows */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute left-1/4 top-1/4 size-96 rounded-full bg-chart-5/10 blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 size-96 rounded-full bg-primary/5 blur-[120px]" />
      </div>

      {/* Left: secure node visual (desktop only) */}
      <div className="relative z-10 hidden flex-col items-center justify-center gap-8 p-12 lg:flex">
        <div className="relative">
          <div className="glass-panel relative flex size-64 items-center justify-center overflow-hidden rounded-full">
            <div className="scanline z-20" aria-hidden />
            <Fingerprint
              className="relative z-10 size-20 text-primary"
              strokeWidth={1}
            />
            {/* rotating rings */}
            <div className="absolute inset-2 animate-[spin_10s_linear_infinite] rounded-full border-t border-primary/30" />
            <div className="absolute inset-6 animate-[spin_15s_linear_infinite_reverse] rounded-full border-b border-chart-5/20" />
          </div>
          <div className="glass-panel absolute -right-4 -top-4 rounded-full px-3 py-1">
            <span className="label-caps text-primary!">Level 4 Encrypted</span>
          </div>
          <div className="glass-panel absolute -bottom-2 -left-4 rounded-full px-3 py-1">
            <span className="label-caps">Ready for Sync</span>
          </div>
        </div>
        <div className="space-y-2 text-center">
          <p className="label-caps tracking-widest! text-chart-5!">
            Protocol: MoFin_Alpha_9
          </p>
          <p className="max-w-xs text-pretty text-sm leading-relaxed text-muted-foreground">
            Hardware-grade verification for terminal access. Talk to MoFin; it
            keeps a precise, ledger-first record — every balance exact.
          </p>
        </div>
      </div>

      {/* Right: auth form */}
      <div className="relative z-10 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3">
            <Logo showText={false} />
            <span className="font-heading text-3xl font-extrabold uppercase tracking-tighter">
              Terminal
            </span>
          </div>
          {children}
        </div>
      </div>

      {/* Footer security stats */}
      <footer className="absolute bottom-0 left-0 z-20 flex w-full flex-wrap items-center justify-center gap-6 p-6 lg:justify-start lg:px-12">
        <Stat icon={<span className="size-2 animate-pulse rounded-full bg-primary" />}>
          Network: Mainnet-Beta
        </Stat>
        <Stat icon={<ShieldCheck className="size-3.5 text-primary" />}>
          Encryption: AES-4096
        </Stat>
        <Stat icon={<Gauge className="size-3.5 text-primary" />}>Latency: 12ms</Stat>
        <Stat icon={<Zap className="size-3.5 text-primary" />}>Ledger: Synced</Stat>
      </footer>
    </div>
  );
}

function Stat({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        {children}
      </span>
    </div>
  );
}
