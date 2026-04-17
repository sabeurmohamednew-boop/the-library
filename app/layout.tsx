import type { Metadata, Viewport } from "next";
import { RouteFreshness } from "@/components/RouteFreshness";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "The Library",
    template: "%s · The Library",
  },
  description: "A minimalist self-hosted reading library.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <RouteFreshness />
        {children}
      </body>
    </html>
  );
}
