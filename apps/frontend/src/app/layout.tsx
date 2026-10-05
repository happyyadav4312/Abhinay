import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/hooks/useAuth';
import { SiteHeader } from '@/components/common';
import { Inter, Source_Serif_4, JetBrains_Mono } from 'next/font/google';
import { cn } from '@/lib/utils';

const fontSans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

const fontSerif = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-serif',
});

const fontMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'Abhinay — Film Production Networking & Casting',
  description:
    'A professional networking platform connecting actors, directors, producers, and crew across the film industry.',
  keywords: ['film', 'casting', 'networking', 'production', 'actors', 'directors'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={cn('dark', fontSans.variable, fontSerif.variable, fontMono.variable)}
    >
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <AuthProvider>
          <SiteHeader />
          <main className="mx-auto w-full max-w-5xl px-4 py-8">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
