import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Conversion Intelligence — thecentral.ai",
  description:
    "Daily AI reports connecting search, traffic, behavior, and conversion for thecentral.ai",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
