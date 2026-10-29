import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bontora Poeng-Teller",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="no">
      <body>{children}</body>
    </html>
  );
}
