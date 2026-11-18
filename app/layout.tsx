import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Estado de delivery SDM",
  description: "Equipo, pilotos, SOWs y clientes del Master SDM Tracker",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
