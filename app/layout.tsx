import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next"
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
  title: "Watch | Trending Movies & TV Shows",
  description: "Showcase of new and trending movies and tv shows, built by Flambeau Iriho.",
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
import { WatchlistProvider } from "@/context/watchlist-context";
import { ReminderProvider } from "@/context/reminder-context";
import { ModalProvider } from "@/context/modal-context";
import MovieModal from "@/components/movie-modal/movie-modal";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${firaCode.variable}`} suppressHydrationWarning>        <AuthProvider>
          <WatchlistProvider>
            <ReminderProvider>
              <ModalProvider>
                <Intro />
                <Navbar />
                <SideLines />
                {children}
                <MovieModal />
                <Footer />
              </ModalProvider>
            </ReminderProvider>
          </WatchlistProvider>
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
