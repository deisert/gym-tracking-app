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
          itself, plus the home-indicator inset that viewport-fit=cover exposes.
          pt does the same for the status bar / notch at the top. */}
      <body className="min-h-full flex flex-col pt-[env(safe-area-inset-top)] pb-[calc(5rem+env(safe-area-inset-bottom))]">
        {/* With the black-translucent status bar the page scrolls underneath
            the clock; this strip keeps that area solid instead of showing
            content smeared behind it. Zero height outside an installed PWA. */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-x-0 top-0 z-40 h-[env(safe-area-inset-top)] bg-background"
        />
        <OfflineBanner />
        <RegisterSW />
        {children}
        <BottomTabs />
      </body>
    </html>
  );
}
