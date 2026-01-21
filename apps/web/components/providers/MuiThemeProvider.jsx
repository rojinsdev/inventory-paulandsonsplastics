'use client';

import { createTheme, ThemeProvider, CssBaseline } from '@mui/material';
import { useTheme } from '@/contexts/ThemeContext';
import { useMemo } from 'react';

export default function MuiThemeProvider({ children }) {
    const { theme } = useTheme();

    const muiTheme = useMemo(() => {
        const isDark = theme === 'dark';

        return createTheme({
            palette: {
                mode: isDark ? 'dark' : 'light',
                primary: {
                    main: isDark ? '#a855f7' : '#8b5cf6', // Matches --purple-500/600
                },
                secondary: {
                    main: '#f97316', // Matches --orange-500
                },
                background: {
                    default: isDark ? '#000000' : '#f8fafc',
                    paper: isDark ? '#0a0a0a' : '#ffffff',
                },
                text: {
                    primary: isDark ? '#ffffff' : '#0f172a',
                    secondary: isDark ? '#a3a3a3' : '#64748b',
                },
                divider: isDark ? '#1f1f1f' : '#e2e8f0',
            },
            typography: {
                fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
                fontSize: 14,
            },
            components: {
                MuiCssBaseline: {
                    styleOverrides: {
                        body: {
                            scrollbarColor: isDark ? '#262626 #000000' : '#cbd5e1 #f8fafc',
                            '&::-webkit-scrollbar': {
                                width: '8px',
                                height: '8px',
                            },
                            '&::-webkit-scrollbar-track': {
                                background: isDark ? '#000000' : '#f8fafc',
                            },
                            '&::-webkit-scrollbar-thumb': {
                                background: isDark ? '#262626' : '#cbd5e1',
                                borderRadius: '10px',
                            },
                            '&::-webkit-scrollbar-thumb:hover': {
                                background: isDark ? '#333333' : '#94a3b8',
                            },
                        },
                    },
                },
            },
        });
    }, [theme]);

    return (
        <ThemeProvider theme={muiTheme}>
            {/* We don't use CssBaseline here to avoid clashing with globals.css, 
                but MUI X Charts will respect the theme provider */}
            {children}
        </ThemeProvider>
    );
}
