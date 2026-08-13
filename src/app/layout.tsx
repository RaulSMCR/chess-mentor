import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chess Mentor",
  description: "A local chess study workspace.",
  applicationName: "Chess Mentor",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#2B7073",
  width: "device-width",
  initialScale: 1,
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
