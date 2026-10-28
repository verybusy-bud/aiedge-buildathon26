import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Fieldnote — Sioux Falls witness reports',
  description: 'A privacy-minded place to compare independent observations of local events.',
  referrer: 'strict-origin-when-cross-origin',
  manifest: '/manifest.webmanifest',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
