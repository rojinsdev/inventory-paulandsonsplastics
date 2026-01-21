'use client';

import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { usePathname } from 'next/navigation';

const GuideContext = createContext();

export function GuideProvider({ children }) {
    const [guideContent, setGuideContent] = useState(null);
    const [isGuideOpen, setIsGuideOpen] = useState(false);
    const pathname = usePathname();

    // Reset guide content when navigating
    useEffect(() => {
        setGuideContent(null);
    }, [pathname]);

    const registerGuide = useCallback((content) => {
        setGuideContent(content);
    }, []);

    const openGuide = useCallback(() => {
        if (guideContent) setIsGuideOpen(true);
    }, [guideContent]);

    const closeGuide = useCallback(() => {
        setIsGuideOpen(false);
    }, []);

    return (
        <GuideContext.Provider
            value={{
                guideContent,
                registerGuide,
                isGuideOpen,
                openGuide,
                closeGuide
            }}
        >
            {children}
        </GuideContext.Provider>
    );
}

export function useGuide() {
    const context = useContext(GuideContext);
    if (!context) {
        throw new Error('useGuide must be used within a GuideProvider');
    }
    return context;
}
