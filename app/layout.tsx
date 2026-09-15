import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { AppShell } from "@/components/app-shell";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WorkspaceProvider } from "@/components/workspace-provider";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "notate",
  description: "Local research notes for literature and code review",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="h-full">
        <TooltipProvider delay={300}>
          <WorkspaceProvider>
            <AppShell>{children}</AppShell>
          </WorkspaceProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
