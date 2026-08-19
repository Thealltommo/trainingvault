import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import "./globals.css";
import "./agoge-legacy.css";

export const metadata: Metadata = {
  title: {
    default: "The Agoge",
    template: "%s · The Agoge",
  },
  description: "Adaptive hybrid training, running and race-readiness dashboard.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body className="min-h-full antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
