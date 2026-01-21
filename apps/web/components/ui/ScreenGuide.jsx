'use client';

import { useState, useEffect } from 'react';
import { X, Info, BookOpen, Cpu, Layers } from 'lucide-react';
import { useGuide } from '@/contexts/GuideContext';
import styles from './ScreenGuide.module.css';

export default function ScreenGuide() {
    const { guideContent: guide, isGuideOpen: isOpen, closeGuide: onClose } = useGuide();

    // Close on ESC key
    useEffect(() => {
        const handleEscape = (e) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            return () => document.removeEventListener('keydown', handleEscape);
        }
    }, [isOpen, onClose]);

    if (!isOpen || !guide) return null;

    return (
        <div className={styles.backdrop} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className={styles.header}>
                    <div className={styles.titleGroup}>
                        <div className={styles.iconBox}>
                            <BookOpen size={20} />
                        </div>
                        <div>
                            <h2 className={styles.title}>{guide.title}</h2>
                            <p className={styles.subtitle}>Screeen Guide & Logic</p>
                        </div>
                    </div>
                    <button className={styles.closeBtn} onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                {/* Content - Two Column Landscape Layout */}
                <div className={styles.content}>
                    <div className={styles.infoColumn}>
                        <div className={styles.description}>
                            {guide.description}
                        </div>

                        <div className={styles.helpText}>
                            <Info size={16} />
                            <span>This guide explains the specific business logic and components used on this screen.</span>
                        </div>
                    </div>

                    <div className={styles.detailsColumn}>
                        <div className={styles.section}>
                            <h3 className={styles.sectionHeader}>
                                <Cpu size={18} />
                                <span>Core Logic</span>
                            </h3>
                            <div className={styles.logicList}>
                                {guide.logic.map((item, index) => (
                                    <div key={index} className={styles.logicItem}>
                                        <div className={styles.logicTitle}>{item.title}</div>
                                        <div className={styles.logicExplanation}>{item.explanation}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className={styles.section}>
                            <h3 className={styles.sectionHeader}>
                                <Layers size={18} />
                                <span>Key Components</span>
                            </h3>
                            <div className={styles.componentGrid}>
                                {guide.components.map((comp, index) => (
                                    <div key={index} className={styles.componentItem}>
                                        <div className={styles.componentName}>{comp.name}</div>
                                        <div className={styles.componentDesc}>{comp.description}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className={styles.footer}>
                    <div className={styles.footerInfo}>
                        <Info size={14} />
                        <span>Need more help? Contact systems administrator.</span>
                    </div>
                    <button className={styles.doneBtn} onClick={onClose}>
                        Got it, thanks!
                    </button>
                </div>
            </div>
        </div>
    );
}
