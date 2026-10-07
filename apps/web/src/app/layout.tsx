import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

import { BottomTabs } from "@/components/nav/bottom-tabs";
import { OfflineBanner } from "@/components/pwa/offline-banner";
import { RegisterSW } from "@/components/pwa/register-sw";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#111317",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  // Lets the app paint into the notch and home-indicator areas; the
  // safe-area padding below keeps content out from under them.
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "GymTrack",
  description: "Dein Trainings-Log",
  applicationName: "GymTrack",
  appleWebApp: {
    capable: true,
    title: "GymTrack",
    // The status bar area becomes part of the page, which is what makes an
    // installed PWA look full-bleed rather than letterboxed.
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" className={`${inter.variable} h-full antialiased`}>
      {/* pb keeps the fixed tab bar from covering content: 5rem for the bar
          itself, plus the home-indicator inset that viewport-fit=cover exposes. */}
      <body className="min-h-full flex flex-col pb-[calc(5rem+env(safe-area-inset-bottom))]">
        <OfflineBanner />
        <RegisterSW />
        {children}
        <BottomTabs />
      </body>
    </html>
  );
}
