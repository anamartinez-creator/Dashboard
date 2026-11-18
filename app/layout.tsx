import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SDM Delivery Health",
  description: "Client and team health from the Master SDM Tracker",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
