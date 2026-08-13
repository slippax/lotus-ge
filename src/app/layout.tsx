import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

/*
 * One superfamily, two roles.
 *
 * Plex Mono carries every number — it has true tabular figures, which is the
 * whole reason a price column lines up. Plex Sans carries the words. They were
 * drawn together, so the pairing is coherent by construction rather than by
 * luck, and it reads as a designed system instead of the OS default.
 */
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Lotus GE — Grand Exchange signals",
  description:
    "Live Old School RuneScape Grand Exchange analysis: dips, breakouts, alchemy floors and crafting margins.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${plexSans.variable} ${plexMono.variable} antialiased`}>
        {/* The page owns the band, because its contents are data-dependent. */}
        <div className="min-h-screen">{children}</div>
      </body>
    </html>
  );
}
