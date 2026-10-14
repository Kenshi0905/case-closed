import type { Metadata } from "next";
import "./globals.css";
import "./game-polish.css";
import "./opening-world.css";
import "./audience.css";
import "./workshop-startup.css";
import "./character-planning.css";

export const metadata: Metadata = {
  title: "Case Closed — A Pixel Murder Mystery",
  description: "One crime. Six suspects. Five clues. Play a solo pixel-art mystery by OpenAI Student Collective at KIIT. No login or local AI required.",
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
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
