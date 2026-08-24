import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SwRegister } from "@/components/pwa/sw-register";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Wrangle",
    template: "%s · Wrangle",
  },
  description:
    "What to do, what you're thinking about, what you're learning, what you're spending.",
  applicationName: "Wrangle",
};

export const viewport: Viewport = {
  themeColor: "#0b0e14",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const appleWebApp = {
  capable: true,
  title: "Wrangle",
  statusBarStyle: "black-translucent" as const,
};

const themeInitScript = `try{var t=localStorage.getItem('wrangle-theme');if(t==='light')document.documentElement.classList.add('light');}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh flex flex-col">
        {children}
        <SwRegister />
        <InstallPrompt />
      </body>
    </html>
  );
}
