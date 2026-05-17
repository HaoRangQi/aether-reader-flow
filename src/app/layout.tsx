/**
 * Root layout. Avoids `next/font` for now because the default scaffold
 * fonts (Geist) don't match the spec (Source Serif Pro + 思源宋体). P5
 * will swap in the real fonts via either `next/font/google` or local
 * woff2 files.
 *
 * `suppressHydrationWarning` is set because the ThemeProvider (P5) writes
 * to `document.documentElement.classList` and inline `style` before React
 * hydrates, intentionally causing a mismatch with server output.
 */
import type { Metadata } from "next";
import "./globals.css";
import { ConfigHydrator } from "@/components/shared/ConfigHydrator";
import { ThemeProvider } from "@/components/shared/ThemeProvider";
import { ToastContainer } from "@/components/shared/ToastContainer";

export const metadata: Metadata = {
  title: "Aether Reader Flow",
  description: "让你读懂一本书的 AI 辅助阅读",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning className="h-full">
      <body className="min-h-full flex flex-col">
        <ConfigHydrator />
        <ThemeProvider>{children}</ThemeProvider>
        <ToastContainer />
      </body>
    </html>
  );
}
