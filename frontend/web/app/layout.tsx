import type { Metadata } from "next";
import { Geist, Inter } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider, themeInitScript } from "@/components/providers/theme-provider";
import { Toaster } from "@/components/ui/sonner";

// One family for everything, including figures (tabular numerals via `.tabular`). Inter's
// optical-size axis lets large headings tighten and small text open up on their own.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
});

// The logo's wordmark is set in Geist SemiBold (logo guidelines); nothing else uses it.
const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  weight: "600",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "MoFin — clarity for your money", template: "%s · MoFin" },
  description:
    "MoFin is an AI-native personal finance app. Talk to it; it keeps a precise, ledger-first record.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geist.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Apply theme before paint to avoid a flash of the wrong mode. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full bg-background text-foreground">
        <ThemeProvider>
          <QueryProvider>
            {children}
            <Toaster position="top-right" richColors closeButton />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
