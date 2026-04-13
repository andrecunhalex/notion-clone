import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Notion Clone",
  description: "Um clone do Notion feito com Next.js",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      {/* suppressHydrationWarning: browser extensions (Grammarly, ColorZilla,
          LanguageTool, etc.) often inject attributes like `cz-shortcut-listen`
          on <body> before React hydrates, which would otherwise produce a
          spurious mismatch warning on every reload. The actual page content
          is unaffected — this just silences the noise. */}
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
