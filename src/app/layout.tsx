import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Financial Hub",
  description: "Internal financial dashboard — revenue, costs, profit, and clients at a glance.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
