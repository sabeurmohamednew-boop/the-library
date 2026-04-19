import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { PostHogProvider } from "@/components/PostHogProvider";
import { RouteFreshness } from "@/components/RouteFreshness";
import { ThemeProvider } from "@/components/ThemeProvider";
import { SITE_CATEGORY, SITE_NAME, SITE_URL } from "@/lib/seo";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const globalTitle = "The Library – Self-Hosted EPUB & PDF Reading Platform";
const globalDescription =
  "A minimalist self-hosted reading platform to read, manage, organize, and track your books. Supports EPUB and PDF with a clean, distraction-free interface.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: {
    default: globalTitle,
    template: `%s | ${SITE_NAME}`,
  },
  description: globalDescription,
  category: SITE_CATEGORY,
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    title: globalTitle,
    description: globalDescription,
    url: "/",
    siteName: SITE_NAME,
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: globalTitle,
    description: globalDescription,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
};

const themeInitScript = `
(() => {
  try {
    const stored = window.localStorage.getItem("theme");
    const theme = stored === "light" || stored === "dark"
      ? stored
      : "light";
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch {
    document.documentElement.dataset.theme = "light";
    document.documentElement.style.colorScheme = "light";
  }
})();
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={inter.variable}>
        <ThemeProvider>
          <PostHogProvider>
            <a className="skip-link" href="#main">
              Skip to content
            </a>
            <RouteFreshness />
            {children}
            <Analytics />
            <SpeedInsights />
          </PostHogProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
