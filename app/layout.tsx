import "./globals.css";
import type { Metadata } from "next";
import Sidebar from "./Sidebar";

export const metadata: Metadata = {
  title: "Software Service Delivery Dashboard",
  description: "Client and team health from the Master SDM Tracker",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600&display=swap"
        />
      </head>
      <body>
        <div className="app">
          <Sidebar />
          <div className="app-main">{children}</div>
        </div>
      </body>
    </html>
  );
}
