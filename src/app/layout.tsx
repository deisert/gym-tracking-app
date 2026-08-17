import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

import { BottomTabs } from "@/components/nav/bottom-tabs";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GymTrack",
  description: "Dein Trainings-Log",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" className={`${inter.variable} h-full antialiased`}>
      {/* pb-20 keeps the fixed tab bar from covering the last row of content. */}
      <body className="min-h-full flex flex-col pb-20">
        {children}
        <BottomTabs />
      </body>
    </html>
  );
}
