import './globals.css';
import { AuthProvider } from '@/lib/auth';
import { ThemeProvider } from '../contexts/ThemeContext';
import MuiThemeProvider from '../components/providers/MuiThemeProvider';
import { SettingsProvider } from '../contexts/SettingsContext';
import { GuideProvider } from '../contexts/GuideContext';
import { UIProvider } from '../contexts/UIContext';
import NextTopLoader from 'nextjs-toploader';
import QueryProvider from '../components/providers/QueryProvider';
import RealtimeHandler from '../components/providers/RealtimeHandler';
import { Toaster } from 'react-hot-toast';


export const metadata = {
  title: 'Paul & Sons Plastics - Admin Portal',
  description: 'Inventory & Production Management System',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>
        <NextTopLoader
          color="#3b82f6"
          initialPosition={0.08}
          crawlSpeed={200}
          height={3}
          crawl={true}
          showSpinner={false}
          easing="ease"
          speed={200}
          shadow="0 0 10px #3b82f6,0 0 5px #3b82f6"
        />
        <QueryProvider>
          <AuthProvider>
            <ThemeProvider>
              <MuiThemeProvider>
                <SettingsProvider>
                  <GuideProvider>
                    <UIProvider>
                      <RealtimeHandler />
                      <Toaster position="top-right" />
                      {children}
                    </UIProvider>
                  </GuideProvider>
                </SettingsProvider>
              </MuiThemeProvider>
            </ThemeProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}

