import styles from './Loading.module.css';

export default function Loading({ fullPage = true }) {
    return (
        <div className={`${styles.loadingContainer} ${fullPage ? styles.fullPage : ''}`}>
            <div className={styles.pulseContainer}>
                <div className={styles.pulse}></div>
                <div className={styles.innerCircle}>
                    <div className={styles.spinner}></div>
                </div>
            </div>
            <p className={styles.text}>Loading data...</p>
        </div>
    );
}
