import { Logo } from "@/components/brand/logo";

// Three product cards in one palette (charcoal, lime, off-white), staggered with room between them,
// always on the dark panel whatever the theme. Each is its own element so it can be animated later.
export function AuthBrandPanel() {
  return (
    <aside className="dark relative hidden flex-col items-start justify-between gap-10 overflow-hidden bg-[#0a0a09] px-14 pb-12 pt-11 lg:flex">
      <Logo />
      <div aria-hidden className="relative mx-auto h-[528px] w-[440px] max-w-full tabular-nums">
        <div className="absolute top-0 left-0 z-10 w-[350px] rounded-3xl border border-[#2e2e2b] bg-[#1b1b19] px-6 pt-[22px] pb-5 text-[#f4f4ef] shadow-[0_22px_44px_rgba(0,0,0,0.5)]">
          <p className="text-[13px] font-semibold text-[#9a9d95]">Balance</p>
          <p className="mt-1.5 text-[40px] leading-[1.05] font-bold tracking-[-0.03em]">
            2 357.500<span className="ml-1.5 text-base font-semibold tracking-normal text-[#9a9d95]">TND</span>
          </p>
          <p className="mt-3.5 flex gap-6 text-[13px] text-[#9a9d95]">
            <span>
              In <b className="font-bold text-brand-lime">+3 200.000</b>
            </span>
            <span>
              Out <b className="font-bold text-[#f4f4ef]">−842.500</b>
            </span>
          </p>
          <div className="mt-[18px] flex h-10 items-end gap-1.5">
            {[30, 55, 22, 70, 40, 100, 18].map((h, i) => (
              <i
                key={i}
                style={{ height: `${h}%` }}
                className={`flex-1 rounded ${i === 5 ? "bg-brand-lime" : "bg-[#2f2f2c]"}`}
              />
            ))}
          </div>
        </div>

        <div className="absolute top-[240px] left-[176px] z-20 flex w-[264px] items-center gap-4 rounded-3xl bg-brand-lime px-5 py-[18px] text-[#131313] shadow-[0_22px_44px_rgba(0,0,0,0.5)]">
          <div
            className="relative grid size-[58px] shrink-0 place-items-center rounded-full text-[15px] font-bold"
            style={{ background: "conic-gradient(#131313 0 42%, #b9d000 0)" }}
          >
            <span className="absolute inset-[7px] rounded-full bg-brand-lime" />
            <span className="relative">42%</span>
          </div>
          <div>
            <p className="text-[15px] font-semibold">Emergency fund</p>
            <p className="mt-1 text-[12.5px] font-semibold text-[#3b4a00]">On track</p>
          </div>
        </div>

        <div className="absolute top-[372px] left-5 z-30 w-[336px] rounded-3xl bg-[#f4f4ef] px-5 py-[18px] text-[#131313] shadow-[0_22px_44px_rgba(0,0,0,0.5)]">
          <div className="flex items-center justify-between text-xs text-[#6a6d64]">
            <span>From Claude</span>
            <span className="rounded-full border border-[#cfd1c4] px-2.5 py-[3px] text-[11px] font-bold tracking-[0.06em] text-[#3b4a00] uppercase">
              Draft
            </span>
          </div>
          <p className="mt-3.5 flex items-baseline justify-between text-[15px]">
            <b className="font-semibold">Coffee, Café Central</b>
            <span>−4.500 TND</span>
          </p>
          <div className="mt-4 flex gap-2.5 text-[13px] font-semibold">
            <span className="grid h-9 flex-1 place-items-center rounded-xl bg-[#131313] text-brand-lime">Approve</span>
            <span className="grid h-9 flex-1 place-items-center rounded-xl border border-[#cfd1c4] text-[#3a3d36]">
              Reject
            </span>
          </div>
        </div>
      </div>
      <p className="text-[15px] tracking-[0.01em] text-[#a2a59d]">
        Every balance, <span className="text-brand-lime">exact.</span>
      </p>
    </aside>
  );
}
