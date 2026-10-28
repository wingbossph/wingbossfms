import type { Metadata, Viewport } from "next";
import { Bebas_Neue, Inter } from "next/font/google";
import { Providers } from "@/components/shell/providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const bebas = Bebas_Neue({ subsets: ["latin"], weight: "400", variable: "--font-bebas" });

export const metadata: Metadata = {
  title: { default: "Wingboss FMS", template: "%s · Wingboss FMS" },
  description: "Wingboss restaurant management and financial system",
  applicationName: "Wingboss FMS",
  appleWebApp: { capable: true, title: "Wingboss", statusBarStyle: "black" },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-PH" suppressHydrationWarning>
      <body className={`${inter.variable} ${bebas.variable} font-sans`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
