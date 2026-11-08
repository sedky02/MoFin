import { AuthAccountDeck } from "@/components/auth/auth-account-deck";
import { Logo } from "@/components/brand/logo";

// Always on the dark panel whatever the theme.
export function AuthBrandPanel() {
  return (
    <aside className="dark relative hidden flex-col items-start justify-between gap-10 overflow-hidden bg-[#0a0a09] px-14 pb-12 pt-11 lg:flex">
      <Logo />
      <AuthAccountDeck />
      <p className="text-[15px] tracking-[0.01em] text-[#a2a59d]">
        Every balance, <span className="text-brand-lime">exact.</span>
      </p>
    </aside>
  );
}
