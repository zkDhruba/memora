import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Memora",
  description: "AI digital twin — a disclosed simulation built from authorized records.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
