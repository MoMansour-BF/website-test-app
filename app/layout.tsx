import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "LiteAPI Booking",
  description: "Mobile-first hotel booking powered by LiteAPI"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-50">
        <div className="min-h-screen max-w-md mx-auto flex flex-col">
          {children}
        </div>
      </body>
    </html>
  );
}

