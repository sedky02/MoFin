import { Logo } from "@/components/brand/logo";
import { AuthBrandPanel } from "@/components/auth/auth-brand-panel";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[46%_1fr]">
      <AuthBrandPanel />
      <div className="flex min-h-dvh flex-col px-6 py-8 sm:px-12 lg:px-16 lg:py-9">
        <div className="mb-8 lg:hidden">
          <Logo />
        </div>
        <div className="m-auto w-full max-w-[400px]">{children}</div>
      </div>
    </div>
  );
}
