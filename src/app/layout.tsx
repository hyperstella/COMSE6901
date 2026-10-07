import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import Header from "@/components/Header";
import { instrument, instrumentSerif } from "./fonts";

export const metadata: Metadata = {
  title: {
    default: "Treendr: Columbia's trees are looking for love",
    template: "%s · Treendr",
  },
  description:
    "A dating app for the trees of Columbia's campus. Snap a tree, let AI write its dating profile, and swipe on the best lines.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${instrumentSerif.variable} ${instrument.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <Header />
        <div className="flex flex-1 flex-col">{children}</div>
        <footer className="mt-20 border-t border-line px-4 py-8 text-center text-sm text-ink-2">
          <p className="font-display text-xl italic text-ink">Made with love (and photosynthesis) at Columbia</p>
          <p className="mt-1">
            <Link href="/restaurants" className="underline decoration-line underline-offset-4 hover:text-ink">
              Where to eat
            </Link>{" "}
            ·{" "}
            <Link href="/privacy" className="underline decoration-line underline-offset-4 hover:text-ink">
              Privacy
            </Link>
          </p>
        </footer>
      </body>
    </html>
  );
}
