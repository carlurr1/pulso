import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pulso · Group COS para ETB Mayoristas",
  description: "Monitoreo de productividad del Help Desk Mayoristas.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Pulso" },
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#0098D6",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="pulso">
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function(){
  if('serviceWorker' in navigator){
    window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})});
  }
  // Captura el aviso de instalación apenas ocurre (antes de que monte React).
  window.addEventListener('beforeinstallprompt',function(e){
    e.preventDefault();
    window.__pwaPrompt=e;
    window.dispatchEvent(new Event('pwa-available'));
  });
  window.addEventListener('appinstalled',function(){window.__pwaPrompt=null;});
})();
`,
          }}
        />
      </body>
    </html>
  );
}
