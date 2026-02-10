import { useFactory } from '@/contexts/FactoryContext';
import styles from './FactoryFilter.module.css';
import { useState, useRef, useEffect } from 'react';
import { Building2, ChevronDown, Check, Factory } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function FactoryFilter({ value, onChange }) {
    const { factories, loading } = useFactory();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    const activeFactories = factories.filter(f => f.active);
    const selectedFactory = activeFactories.find(f => f.id === value);

    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (id) => {
        console.log('FactoryFilter: Selecting', id);
        onChange(id);
        setIsOpen(false);
    };

    if (loading) return null;

    return (
        <div className={styles.factoryFilter} ref={dropdownRef}>
            <button
                className={styles.trigger}
                onClick={() => setIsOpen(!isOpen)}
                aria-expanded={isOpen}
                aria-haspopup="listbox"
            >
                <div className={styles.triggerContent}>
                    <Factory size={16} className={styles.icon} />
                    <span>{selectedFactory ? selectedFactory.name : 'All Factories'}</span>
                </div>
                <ChevronDown size={14} className={styles.chevron} />
            </button>

            {isOpen && (
                <div className={styles.dropdown} role="listbox">
                    <button
                        className={cn(styles.item, !value && styles.active)}
                        onClick={() => {
                            console.log('FactoryFilter: Clicked All Factories');
                            handleSelect(null);
                        }}
                        role="option"
                        aria-selected={!value}
                    >
                        <div className={styles.itemInfo}>
                            <span>All Factories</span>
                        </div>
                        {!value && <Check size={16} className={styles.check} />}
                    </button>

                    {activeFactories.map((factory) => (
                        <button
                            key={factory.id}
                            className={cn(styles.item, value === factory.id && styles.active)}
                            onClick={() => handleSelect(factory.id)}
                            role="option"
                            aria-selected={value === factory.id}
                        >
                            <div className={styles.itemInfo}>
                                <span>{factory.name}</span>
                                <span className={styles.itemCode}>{factory.code}</span>
                            </div>
                            {value === factory.id && <Check size={16} className={styles.check} />}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
