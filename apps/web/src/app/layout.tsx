import type { Metadata } from "next";
import Script from "next/script";
import { Inter, JetBrains_Mono, Newsreader } from "next/font/google";

import "../index.css";
import Providers from "@/components/providers";
import SidebarWrapper from "@/components/sidebar-wrapper";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

const newsreader = Newsreader({
  variable: "--font-serif",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Cartwright | AI Autonomous Shopping Agent",
  description: "Autonomous AI shopping agent that finds verified deals and automates checkout.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} ${newsreader.variable} antialiased font-sans`}
      >
        <Providers>
          <SidebarWrapper>{children}</SidebarWrapper>
        </Providers>
        {process.env.NODE_ENV === "development" && (
          <Script
            src="//unpkg.com/react-grab/dist/index.global.js"
            crossOrigin="anonymous"
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}
