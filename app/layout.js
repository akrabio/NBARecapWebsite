import { Heebo } from "next/font/google";
import { Analytics } from "@vercel/analytics/next"
import Toaster from "@/components/ui/Toast";
import ServiceWorker from "@/components/ServiceWorker";
import ThemeSync from "@/components/ThemeSync";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
});

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: "סיכומי NBA בעברית",
  description: "סיכומי משחקי NBA בעברית עם ניתוח סטטיסטי מקצועי ומעמיק",
  openGraph: {
    title: "סיכומי NBA בעברית",
    description: "סיכומי משחקי NBA בעברית עם ניתוח סטטיסטי מקצועי ומעמיק",
    type: "website",
    locale: "he_IL",
    siteName: "סיכומי NBA בעברית",
  },
  icons: {
    icon: '/icon-192.png',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'NBA בעברית',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f6f8' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0d12' },
  ],
};

// Apply a saved light/dark choice before first paint to avoid a flash.
const themeScript = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${heebo.variable} font-sans antialiased`}>
        {children}
        <Toaster />
        <Analytics />
        <ServiceWorker />
        <ThemeSync />
      </body>
    </html>
  );
}
