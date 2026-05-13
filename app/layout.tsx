import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Design Build — LL Cockpit",
  description: "AI-powered design generation",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
