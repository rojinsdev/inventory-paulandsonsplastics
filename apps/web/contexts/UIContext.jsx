'use client';

import React, { createContext, useContext, useState } from 'react';

const UIContext = createContext();

export function UIProvider({ children }) {
    const [pageTitle, setPageTitle] = useState('Dashboard');

    return (
        <UIContext.Provider value={{ pageTitle, setPageTitle }}>
            {children}
        </UIContext.Provider>
    );
}

export function useUI() {
    const context = useContext(UIContext);
    if (!context) {
        throw new Error('useUI must be used within a UIProvider');
    }
    return context;
}
