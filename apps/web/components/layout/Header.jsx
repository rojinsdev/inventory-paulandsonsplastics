'use client';

import { useAuth } from '@/lib/auth';
import { useSearch } from '@/contexts/SearchContext';
import { User, Bell, Search, Command, Plus, HelpCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import SettingsModal from '../ui/SettingsModal';
import ScreenGuide from '../ui/ScreenGuide';
import { useGuide } from '@/contexts/GuideContext';
import styles from './Header.module.css';

export default function Header({ title }) {
    const { user } = useAuth();
    const { query, setQuery, results, isSearching, isOpen, setIsOpen, navigateToResult } = useSearch();
    const [showResults, setShowResults] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const { guideContent, openGuide } = useGuide();
    const searchRef = useRef(null);
    const router = useRouter();
    const pathname = usePathname();

    // Close search results when clicking outside
    useEffect(() => {
        function handleClickOutside(event) {
            if (searchRef.current && !searchRef.current.contains(event.target)) {
                setShowResults(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Show results when query changes
    useEffect(() => {
        if (query && results.length > 0) {
            setShowResults(true);
        } else {
            setShowResults(false);
        }
    }, [query, results]);

    // Handle keyboard navigation
    useEffect(() => {
        if (isOpen) {
            searchRef.current?.querySelector('input')?.focus();
        }
    }, [isOpen]);

    // Get context-aware action button
    // Removed from sales screens and product config screens per user request
    const getNewAction = () => {
        // Sales screens - no button
        if (pathname.includes('/orders') ||
            pathname.includes('/customers') ||
            pathname.includes('/deliveries') ||
            pathname.includes('/inventory/live')) {
            return null;
        }

        // Product config screens - no button
        if (pathname.includes('/products') ||
            pathname.includes('/machines') ||
            pathname.includes('/die-mappings') ||
            pathname.includes('/packing-rules')) {
            return null;
        }

        return null;
    };

    const newAction = getNewAction();

    return (
        <header className={styles.header}>
            {/* Search Bar */}
            <div className={styles.searchContainer} ref={searchRef}>
                <div className={styles.searchInputWrapper}>
                    <Search size={20} className={styles.searchIcon} />
                    <input
                        type="text"
                        placeholder="Search or type a command"
                        className={styles.searchInput}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onFocus={() => query && setShowResults(true)}
                    />
                    <div className={styles.searchShortcut}>
                        <Command size={14} />
                        <span>F</span>
                    </div>
                </div>

                {/* Search Results Dropdown */}
                {showResults && (
                    <div className={styles.searchResults}>
                        {isSearching ? (
                            <div className={styles.searchLoading}>Searching...</div>
                        ) : results.length > 0 ? (
                            <>
                                {results.map((result, index) => (
                                    <button
                                        key={`${result.type}-${result.id}-${index}`}
                                        className={styles.searchResultItem}
                                        onClick={() => {
                                            navigateToResult(result);
                                            setShowResults(false);
                                        }}
                                    >
                                        <div className={styles.resultIcon}>{result.type[0]}</div>
                                        <div className={styles.resultContent}>
                                            <div className={styles.resultTitle}>{result.title}</div>
                                            <div className={styles.resultSubtitle}>{result.subtitle}</div>
                                        </div>
                                        <div className={styles.resultType}>{result.type}</div>
                                    </button>
                                ))}
                            </>
                        ) : (
                            <div className={styles.searchEmpty}>No results found</div>
                        )}
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className={styles.actions}>
                {newAction && (
                    <button className={styles.newBtn} onClick={() => router.push(newAction.href)}>
                        <Plus size={18} />
                        <span>New Project</span>
                    </button>
                )}
                {guideContent && (
                    <button
                        className={styles.iconBtn}
                        onClick={openGuide}
                        title="Screen Guide"
                    >
                        <HelpCircle size={20} />
                    </button>
                )}
                <div className={styles.userInfo}>
                    <button
                        className={styles.userAvatar}
                        onClick={() => setShowSettings(true)}
                        aria-label="Open settings"
                    >
                        <img
                            src="/assets/avatar.png"
                            alt="User Avatar"
                            className={styles.avatarImg}
                        />
                    </button>
                </div>
            </div>

            {/* Modals */}
            <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
            <ScreenGuide />
        </header>
    );
}
