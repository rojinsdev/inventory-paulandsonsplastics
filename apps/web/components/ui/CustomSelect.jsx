import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import styles from './CustomSelect.module.css';

export default function CustomSelect({
    value,
    onChange,
    options = [],
    placeholder = 'Select option',
    disabled = false,
    searchable = true,
    className
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const containerRef = useRef(null);
    const searchInputRef = useRef(null);

    const selectedOption = options.find(opt => opt.value === value);

    useEffect(() => {
        function handleClickOutside(event) {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (optionValue) => {
        if (disabled) return;
        onChange(optionValue);
        setIsOpen(false);
        setSearchQuery('');
    };

    const filteredOptions = options.filter(option => {
        const searchText = option.searchLabel || (typeof option.label === 'string' ? option.label : '');
        return searchText.toLowerCase().includes(searchQuery.toLowerCase());
    });

    useEffect(() => {
        if (isOpen && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [isOpen]);

    return (
        <div className={cn(styles.container, className)} ref={containerRef}>
            <button
                type="button"
                className={styles.trigger}
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
            >
                <span className={selectedOption ? styles.value : styles.placeholder}>
                    {selectedOption ? selectedOption.label : placeholder}
                </span>
                <ChevronDown size={16} className={styles.chevron} />
            </button>

            {isOpen && !disabled && (
                <div className={styles.dropdown} role="listbox">
                    {searchable && (
                        <div className={styles.searchContainer}>
                            <div className={styles.searchWrapper}>
                                <Search size={14} className={styles.searchIcon} />
                                <input
                                    ref={searchInputRef}
                                    type="text"
                                    className={styles.searchInput}
                                    placeholder="Search..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                />
                                {searchQuery && (
                                    <button
                                        type="button"
                                        className={styles.clearSearch}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSearchQuery('');
                                            searchInputRef.current?.focus();
                                        }}
                                    >
                                        <X size={12} />
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                    <div className={styles.optionsList}>
                        {filteredOptions.length === 0 ? (
                            <div className={styles.item} style={{ cursor: 'default', color: 'var(--text-muted)' }}>
                                {options.length === 0 ? 'No options' : 'No results found'}
                            </div>
                        ) : (
                            filteredOptions.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    className={cn(styles.item, value === option.value && styles.selected)}
                                    onClick={() => handleSelect(option.value)}
                                    role="option"
                                    aria-selected={value === option.value}
                                >
                                    <div style={{ flex: 1 }}>{option.label}</div>
                                    {value === option.value && <Check size={16} className={styles.check} />}
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
