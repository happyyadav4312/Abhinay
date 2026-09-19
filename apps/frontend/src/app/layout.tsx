import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/hooks/useAuth';
import { SiteHeader } from '@/components/common';
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: 'Abhinay — Film Production Networking & Casting',
  description:
    'A professional networking platform connecting actors, directors, producers, and crew across the film industry.',
  keywords: ['film', 'casting', 'networking', 'production', 'actors', 'directors'],
};

/**
 * System font stack rather than a downloaded webfont: `next/font/google` fetches
 * the font at build time, which would make an offline or firewalled build fail
 * for no visual benefit here.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("dark", "font-sans", geist.variable)}>
      <body className="min-h-screen bg-zinc-950 font-sans text-zinc-100 antialiased">
        <AuthProvider>
          <SiteHeader />
          <main className="mx-auto w-full max-w-5xl px-4 py-8">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
