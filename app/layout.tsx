import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Inter, Fira_Code } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/navbar/navbar";
import Footer from "@/components/footer/footer";
import SideLines from "@/components/side-lines/side-lines";
import Intro from "@/components/intro/intro";
import MobileTabBar from "@/components/mobile-tab-bar/mobile-tab-bar";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const firaCode = Fira_Code({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Watch",
  description: "Discover and manage your movie watching addiction, built by Flambeau Iriho.",
  applicationName: "Watch",
  appleWebApp: {
    capable: true,
    title: "Watch",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon.ico' },
    ],
    apple: [
      // ?v=2: the icon was replaced (opaque, full-bleed); iOS caches the old one by URL.
      { url: '/apple-touch-icon.png?v=2', sizes: '180x180', type: 'image/png' },
    ],
    other: [
      {
        rel: 'mask-icon',
        url: '/safari-pinned-tab.svg',
        color: '#64ffda',
      },
    ],
  },
  manifest: '/site.webmanifest',
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#000000",
  colorScheme: "dark",
};

import { AuthProvider } from "@/context/auth-context";
import { ProfileProvider } from "@/context/profile-context";
import { RecommendationsProvider } from "@/context/recommendations-context";
import { WatchlistProvider } from "@/context/watchlist-context";
import { ReminderProvider } from "@/context/reminder-context";
import { ModalProvider } from "@/context/modal-context";
import MovieModal from "@/components/movie-modal/movie-modal";
import InboxPopup from "@/components/inbox-popup/inbox-popup";
import ErrorBoundary from "@/components/error-boundary/error-boundary";
import { Toaster } from "sonner";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${firaCode.variable}`} suppressHydrationWarning>
        <AuthProvider>
          <ProfileProvider>
          <RecommendationsProvider>
          <WatchlistProvider>
            <ReminderProvider>
              <ModalProvider>
                <Intro />
                <Navbar />
                <SideLines />
                <ErrorBoundary>{children}</ErrorBoundary>
                <MovieModal />
                <InboxPopup />
                <Footer />
                <MobileTabBar />
                <Toaster
                  theme="dark"
                  position="bottom-center"
                  richColors
                  gap={10}
                  visibleToasts={3}
                  offset={{ bottom: 'calc(var(--tabbar-offset) + 24px)' }}
                  mobileOffset={{ bottom: 'calc(var(--tabbar-offset) + 12px)', left: 12, right: 12 }}
                  swipeDirections={['bottom', 'left', 'right']}
                />
              </ModalProvider>
            </ReminderProvider>
          </WatchlistProvider>
          </RecommendationsProvider>
          </ProfileProvider>
        </AuthProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
