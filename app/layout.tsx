import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://catbox-web-games.sites.chatgpt.com"),
  title: "Catbox Games — Tiny games, big rematches",
  description: "Play homemade browser classics including Tic-Tac-Toe, Connect Four, and Pocket Fleet. Free, instant, and built for quick rematches.",
  openGraph: {
    title: "Catbox Games — Tiny games, big rematches",
    description: "Pick a game. Make your move. Play free homemade browser classics with no account or download.",
    images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "Catbox Games" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Catbox Games — Tiny games, big rematches",
    description: "Pick a game. Make your move. Free homemade browser classics.",
    images: ["/og.jpg"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="antialiased">{children}</body>
    </html>
  );
}
