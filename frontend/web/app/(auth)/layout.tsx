import { Logo } from "@/components/brand/logo";

// Split layout: an editorial brand panel (hidden on mobile) beside the form.
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[#0b1120] p-12 text-[#f8fafc] lg:flex">
        {/* atmospheric gradient mesh, no decorative clutter */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.55]"
          style={{
            background:
              "radial-gradient(60% 50% at 15% 10%, rgba(20,184,166,0.25), transparent 70%), radial-gradient(50% 50% at 90% 90%, rgba(14,165,233,0.18), transparent 70%)",
          }}
        />
        <div className="relative">
          <Logo className="[&_span]:text-[#f8fafc]" />
        </div>
        <div className="relative max-w-md">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-[#2dd4bf]">
            Personal finance, precisely
          </p>
          <h1 className="mt-4 text-balance text-4xl font-bold leading-tight tracking-tight">
            Money you can actually reason about.
          </h1>
          <p className="mt-4 text-pretty text-base leading-relaxed text-[#94a3b8]">
            Talk to MoFin in plain language. It drafts the entry, you approve it,
            and a double-entry ledger keeps every balance exact — down to the cent.
          </p>
        </div>
        <div className="relative font-mono text-xs tabular-nums text-[#475569]">
          {/* a quiet ledger flourish */}
          <span className="text-[#2dd4bf]">$</span> ledger.balance() →{" "}
          <span className="text-[#f8fafc]">always fetched, never guessed</span>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
