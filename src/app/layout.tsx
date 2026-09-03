import type { Metadata } from "next";
import localFont from "next/font/local";
import { Suspense } from "react";
import "./globals.css";
import SubscriptionRefresher from "@/components/SubscriptionRefresher";

// Versioned local fonts (audit P3.1): removes the build-time network
// dependency on Google Fonts while keeping next/font optimization.
const geistSans = localFont({
  src: "../fonts/Geist-Variable.woff2",
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = localFont({
  src: "../fonts/GeistMono-Variable.woff2",
  variable: "--font-geist-mono",
  display: "swap",
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
        width: 1200,
        height: 630,
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
        {/* Global Toaster removed (audit P2.5): no consumer of use-toast or
            sonner exists in the app — AdminSistemaClient renders its own
            inline toasts. The ui/toaster + use-toast modules remain in the
            repo but are no longer shipped to every page. */}
        <Suspense fallback={null}>
          <SubscriptionRefresher />
        </Suspense>
      </body>
    </html>
  );
}
