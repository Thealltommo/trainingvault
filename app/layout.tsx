import type { Metadata, Viewport } from "next";
import AppShell from "@/components/AppShell";
import CompletedReviewRedirect from "@/components/CompletedReviewRedirect";
import "./globals.css";
import "./polish.css";
import "./editorial.css";
import "./agoge-v4.css";

export const metadata: Metadata = {
  title: "The Agoge · Athlete OS V4",
  description: "Private athlete intelligence for planning, recovery, Garmin, activity analysis and adaptive coaching.",
  applicationName: "The Agoge",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "The Agoge",
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#07101e",
  colorScheme: "dark light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body className="min-h-full antialiased">
        <CompletedReviewRedirect />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
