import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { baseURL } from "@/lib/auth-config";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const description = "New research papers, summarised into short, factual threads at your level. Read on your phone.";

export const metadata: Metadata = {
  metadataBase: new URL(baseURL()),
  title: "reresearch",
  description,
  // Not black-translucent, whose white status text vanishes against the light theme.
  appleWebApp: { capable: true, title: "reresearch", statusBarStyle: "default" },
  openGraph: { title: "reresearch", description, siteName: "reresearch", type: "website" },
  twitter: { card: "summary_large_image", title: "reresearch", description },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body className="min-h-dvh">
        <div className="mx-auto min-h-dvh max-w-xl border-line sm:border-x">{children}</div>
      </body>
    </html>
  );
}
