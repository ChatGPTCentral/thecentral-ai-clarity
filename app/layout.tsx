import type { Metadata } from "next";
import "./globals.css";
import SideNav from "./SideNav";

export const metadata: Metadata = {
  title: "The Daily Brief — thecentral.ai",
  description:
    "What happened on thecentral.ai yesterday — visits, pages, countries, search keywords and on-site behavior",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <SideNav />
        <div className="app-body">{children}</div>
      </body>
    </html>
  );
}
