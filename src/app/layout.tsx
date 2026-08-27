import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import SubscriptionRefresher from "@/components/SubscriptionRefresher";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

export const metadata: Metadata = {
  ...(siteUrl && { metadataBase: new URL(siteUrl) }),
  title: "ImobSync",
  description:
    "ImobSync: plataforma de gestão e sincronização de informações comerciais para empreendimentos na planta. Explore todas as unidades disponíveis por empreendimento, andar, área e valor.",
  keywords: [
    "ImobSync",
    "empreendimentos imobiliários",
    "espelho de vendas",
    "imóveis",
    "empreendimento",
    "unidades",
    "Quattre",
    "Villa Bianco",
    "sincronização comercial",
  ],
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/imobsync-icon-claro-64.png", sizes: "64x64", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  openGraph: {
    title: "ImobSync",
    description: "Plataforma de gestão e sincronização de informações comerciais para empreendimentos na planta.",
    type: "website",
    images: [
      {
        url: "/imobsync-preview.webp",
        width: 1424,
        height: 752,
        alt: "ImobSync",
        type: "image/webp",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ImobSync",
    description: "Plataforma de gestão e sincronização de informações comerciais para empreendimentos na planta.",
    images: ["/imobsync-preview.webp"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
        suppressHydrationWarning
      >
        {children}
        <Toaster />
        <Suspense fallback={null}>
          <SubscriptionRefresher />
        </Suspense>
      </body>
    </html>
  );
}
