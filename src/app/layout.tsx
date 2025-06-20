import type { Metadata } from "next";
import { Crimson_Text } from "next/font/google";
import "./globals.css";

const crimsonText = Crimson_Text({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  title: "OSRS Grand Exchange Analyzer",
  description:
    "Real-time profit analysis for Old School RuneScape Grand Exchange trading",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${crimsonText.variable} font-serif antialiased bg-black text-white`}
      >
        <div className="min-h-screen">
          <header className="border-b-4 border-gray-600 bg-gray-900 p-2">
            <div className="max-w-7xl mx-auto">
              <h1 className="text-6xl md:text-8xl font-bold tracking-tight font-serif text-white mt-1 md:mt-3">
                OSRS GE
              </h1>
            </div>
          </header>
          <main className="max-w-7xl mx-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}
