import type { Metadata, Viewport } from "next";
import { SwRegister } from "@/components/pwa/sw-register";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Wrangle",
    template: "%s · Wrangle",
  },
  description:
    "Wrangle it all. Tasks, ideas, learning and money in one free, installable app that works offline.",
  openGraph: {
    title: "Wrangle it all.",
    description:
      "Tasks, ideas, learning and money in one free, installable app that works offline.",
    siteName: "Wrangle",
    type: "website",
  },
  applicationName: "Wrangle",
  appleWebApp: {
    capable: true,
    title: "Wrangle",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0e14",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const themeInitScript = `try{var d=document.documentElement,m=window.matchMedia('(prefers-color-scheme: light)'),t=null;try{t=localStorage.getItem('wrangle-theme')}catch(e){}d.classList.toggle('light',t==='light'||(t!=='dark'&&m.matches));if(m.addEventListener)m.addEventListener('change',function(e){var s=null;try{s=localStorage.getItem('wrangle-theme')}catch(err){}if(s!=='light'&&s!=='dark')d.classList.toggle('light',e.matches)})}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className="h-full antialiased"
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
