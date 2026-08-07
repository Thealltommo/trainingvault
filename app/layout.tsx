import type { Metadata, Viewport } from "next";
import AppShell from "@/components/AppShell";
import CompletedReviewRedirect from "@/components/CompletedReviewRedirect";
import "./globals.css";
import "./polish.css";
import "./editorial.css";

export const metadata: Metadata = {
  title: "TrainVault · V4 Athlete OS",
  description: "Private athlete intelligence for planning, recovery, Garmin, activity analysis and adaptive coaching.",
  applicationName: "TrainVault",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "TrainVault",
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
  themeColor: "#060806",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full antialiased">
        <CompletedReviewRedirect />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
