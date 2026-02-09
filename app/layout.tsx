import type { ReactNode } from "react";
import { Outfit } from "next/font/google";
import { LayoutClient } from "@/components/LayoutClient";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  variable: "--font-outfit",
});

export const metadata = {
  title: "Journeys by Breadfast",
  description: "Find your next stay – curated hotels and experiences for the modern traveler"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={outfit.variable}>
      <body className="font-sans antialiased">
        <div className="min-h-screen max-w-md mx-auto flex flex-col">
          <LayoutClient>{children}</LayoutClient>
        </div>
      </body>
    </html>
  );
}

