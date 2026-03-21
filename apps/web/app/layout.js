import { Inter } from 'next/font/google';
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
import { ErrorBoundary } from '../components/ui/ErrorBoundary';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata = {
  title: 'Paul & Sons Plastics - Admin Portal',
  description: 'Inventory & Production Management System',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
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
                      <ErrorBoundary>
                        {children}
                      </ErrorBoundary>
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

