import type { CSSProperties, ReactNode } from "react";

// Each card starts in its slot (back to front) and the shared `account-deck` keyframes cycle it
// through the others; the negative delay offsets each card by one slot (3s of the 12s loop).
const SLOTS = [
  { y: "0px", scale: 0.84, z: 1, brightness: 0.62, delay: "0s" },
  { y: "58px", scale: 0.89, z: 2, brightness: 0.76, delay: "-3s" },
  { y: "120px", scale: 0.945, z: 3, brightness: 0.9, delay: "-6s" },
  { y: "186px", scale: 1, z: 4, brightness: 1, delay: "-9s" },
];

function DeckCard({ slot, className, style, children }: { slot: number; className: string; style?: CSSProperties; children: ReactNode }) {
  const { y, scale, z, brightness, delay } = SLOTS[slot];
  return (
    <div
      className={`account-deck-card absolute inset-x-0 top-0 h-[236px] overflow-hidden rounded-3xl px-6 py-[22px] ${className}`}
      style={{ "--deck-y": y, "--deck-scale": scale, "--deck-z": z, "--deck-brightness": brightness, "--deck-delay": delay, ...style } as CSSProperties}
    >
      {children}
    </div>
  );
}

function CardHeader({ name, tag, tagClassName, children }: { name: string; tag: string; tagClassName: string; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between text-[15px] font-semibold">
      <span className="flex items-center gap-2.5">
        {name}
        {children}
      </span>
      <span className={`rounded-full border px-2.5 py-[3px] text-[11.5px] ${tagClassName}`}>{tag}</span>
    </div>
  );
}

const AMOUNT = "mt-[30px] text-[44px] leading-none font-bold";
const CURRENCY = "ml-2 text-[17px] font-semibold tracking-normal";

export function AuthAccountDeck() {
  return (
    <div aria-hidden className="w-full max-w-[477px] self-center tabular-nums">
      <div className="relative h-[422px]">
        <DeckCard
          slot={0}
          className="border border-[#2e2e2a] text-[#f4f4ef]"
          style={{ background: "repeating-linear-gradient(135deg, #22221e 0 9px, #1c1c19 9px 18px)" }}
        >
          <CardHeader name="Cash" tag="Private" tagClassName="border-[#44463f] text-[#a2a59d]" />
          <p className={`${AMOUNT} tracking-[0.08em] text-[#6f726a]`}>•••••</p>
          <p className="absolute bottom-[22px] left-6 text-[13px] text-[#9a9d95]">Left out of All accounts</p>
        </DeckCard>

        <DeckCard slot={1} className="bg-[#efeee6] text-[#131313]">
          <svg viewBox="0 0 150 110" className="absolute -right-3.5 -bottom-[18px] w-[150px]" fill="none" strokeWidth="1.5">
            <circle cx="55" cy="60" r="48" stroke="#c5c8b4" />
            <circle cx="95" cy="60" r="48" stroke="#8fa300" />
          </svg>
          <CardHeader name="Home" tag="Shared" tagClassName="border-[#cfd1c4] text-[#3b4a00]" />
          <p className={`${AMOUNT} tracking-[-0.035em]`}>
            412.250<span className={`${CURRENCY} text-[#6a6d64]`}>TND</span>
          </p>
          <div className="absolute bottom-5 left-6 flex items-center gap-2.5 text-[13px] text-[#4b4e46]">
            <span className="flex">
              <i className="grid size-6 place-items-center rounded-full bg-[#131313] text-[10px] font-bold text-brand-lime not-italic">SA</i>
              <i className="-ml-1.5 grid size-6 place-items-center rounded-full border-2 border-[#efeee6] bg-[#8fa300] text-[10px] font-bold text-[#131313] not-italic">
                AM
              </i>
            </span>
            You and Amira
          </div>
        </DeckCard>

        <DeckCard
          slot={2}
          className="bg-[#1f2609] text-[#e6f57a]"
          style={{ backgroundImage: "repeating-linear-gradient(to bottom, transparent 0 27px, rgba(215,242,5,0.07) 27px 28px)" }}
        >
          <CardHeader name="Savings" tag="Masked" tagClassName="border-[#4a5a00] text-brand-lime" />
          <p className={`${AMOUNT} tracking-[0.04em]`}>••••.•••</p>
          <div className="absolute inset-x-6 bottom-[22px]">
            <div className="flex justify-between text-[13px] text-[#b9c95a]">
              <span>Emergency fund</span>
              <span>42%</span>
            </div>
            <div className="mt-2 h-1 rounded-sm bg-[#3a4612]">
              <div className="h-full w-[42%] rounded-sm bg-brand-lime" />
            </div>
          </div>
        </DeckCard>

        <DeckCard slot={3} className="border border-[#2e2e2b] bg-[#1a1a17] text-[#f4f4ef]">
          <div className="absolute right-6 bottom-[22px] flex items-end gap-1.5">
            <i className="h-[50px] w-[18px] rounded-[5px] bg-brand-lime" />
            <i className="h-[30px] w-[18px] rounded-[5px] bg-brand-lime" />
            <i className="h-[70px] w-[18px] rounded-[5px] bg-brand-lime" />
          </div>
          <CardHeader name="Main account" tag="Visible" tagClassName="border-[#3a3c36] text-brand-lime" />
          <p className={`${AMOUNT} tracking-[-0.035em]`}>
            2 357.500<span className={`${CURRENCY} text-[#9a9d95]`}>TND</span>
          </p>
          <p className="absolute bottom-[22px] left-6 text-[13px] text-[#9a9d95]">
            In <b className="text-brand-lime">+3 200.000</b> · Out <b className="text-[#f4f4ef]">−842.500</b>
          </p>
        </DeckCard>
      </div>
      <p className="mt-[26px] text-sm text-[#9a9d95]">Every account in one place. You decide what each one shows.</p>
    </div>
  );
}
