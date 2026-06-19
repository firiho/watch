import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Inter, Fira_Code } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/navbar/navbar";
import Footer from "@/components/footer/footer";
import SideLines from "@/components/side-lines/side-lines";
import Intro from "@/components/intro/intro";

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
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon.ico' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    other: [
      {
        rel: 'mask-icon',
        url: '/safari-pinned-tab.svg',
        color: '#5bbad5',
      },
    ],
  },
  manifest: '/site.webmanifest',
};

import { AuthProvider } from "@/context/auth-context";
import { ProfileProvider } from "@/context/profile-context";
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
      <body className={`${inter.variable} ${firaCode.variable}`} suppressHydrationWarning>        <AuthProvider>
          <ProfileProvider>
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
                <Toaster theme="dark" position="bottom-center" richColors />
              </ModalProvider>
            </ReminderProvider>
          </WatchlistProvider>
          </ProfileProvider>
        </AuthProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
