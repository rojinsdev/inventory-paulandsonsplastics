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
                    main: isDark ? '#6366f1' : '#4f46e5', // Matches --indigo-500/600
                },
                secondary: {
                    main: '#f97316', // Matches --orange-500
                },
                background: {
                    default: isDark ? '#0b0e14' : '#f8fafc',
                    paper: isDark ? '#11141b' : '#ffffff',
                },
                text: {
                    primary: isDark ? '#f8fafc' : '#0f172a',
                    secondary: isDark ? '#94a3b8' : '#64748b',
                },
                divider: isDark ? '#1e222c' : '#e2e8f0',
            },
            typography: {
                fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
                fontSize: 14,
            },
            components: {
                MuiCssBaseline: {
                    styleOverrides: {
                        body: {
                            scrollbarColor: isDark ? '#1a1d26 #0b0e14' : '#cbd5e1 #f8fafc',
                            '&::-webkit-scrollbar': {
                                width: '8px',
                                height: '8px',
                            },
                            '&::-webkit-scrollbar-track': {
                                background: isDark ? '#0b0e14' : '#f8fafc',
                            },
                            '&::-webkit-scrollbar-thumb': {
                                background: isDark ? '#1a1d26' : '#cbd5e1',
                                borderRadius: '10px',
                            },
                            '&::-webkit-scrollbar-thumb:hover': {
                                background: isDark ? '#1e222c' : '#94a3b8',
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
