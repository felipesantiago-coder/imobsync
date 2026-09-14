import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Suspense } from "react";
import "./globals.css";
import SubscriptionRefresher from "@/components/SubscriptionRefresher";
import PwaRegister from "@/components/PwaRegister";

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

// Splash screens do iOS (apple-touch-startup-image) — iPhone em portrait,
// variantes claro/escuro via prefers-color-scheme. Imagens geradas por
// scripts/generate-pwa-assets.py (fundo do tema, símbolo centralizado).
const IOS_SPLASH_DEVICES: Array<{ file: string; query: string }> = [
  { file: "1320x2868", query: "(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3)" },
  { file: "1290x2796", query: "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)" },
  { file: "1206x2622", query: "(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3)" },
  { file: "1179x2556", query: "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)" },
  { file: "1284x2778", query: "(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3)" },
  { file: "1170x2532", query: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)" },
  { file: "828x1792", query: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2)" },
  { file: "750x1334", query: "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)" },
];

const appleStartupImages = IOS_SPLASH_DEVICES.flatMap(({ file, query }) => [
  {
    url: `/splash/apple-splash-${file}-light.png`,
    media: `screen and ${query} and (orientation: portrait) and (prefers-color-scheme: light)`,
  },
  {
    url: `/splash/apple-splash-${file}-dark.png`,
    media: `screen and ${query} and (orientation: portrait) and (prefers-color-scheme: dark)`,
  },
]);

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
      { url: "/icons/pwa-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/pwa-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ImobSync",
    startupImage: appleStartupImages,
  },
  formatDetection: { telephone: false },
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

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f9fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0a121b" },
  ],
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
        {/* PWA: registra /sw.js em produção (no-op em dev) */}
        <PwaRegister />
      </body>
    </html>
  );
}
