import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chess Mentor",
  description: "A local chess study workspace.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
