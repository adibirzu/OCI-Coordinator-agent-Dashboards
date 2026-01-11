import { useState, useEffect } from 'react';

export interface Settings {
    refreshRate: number;
    theme: 'light' | 'dark' | 'system';
    maxLogLines: number;
    showAnimations: boolean;
}

const DEFAULT_SETTINGS: Settings = {
    refreshRate: 5000,
    theme: 'dark',
    maxLogLines: 100,
    showAnimations: true,
};

const STORAGE_KEY = 'oci_coordinator_settings';

export function useSettings() {
    const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
    const [loaded, setLoaded] = useState(false);

    // Load from storage on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
            }
        } catch (e) {
            console.warn('Failed to load settings', e);
        } finally {
            setLoaded(true);
        }
    }, []);

    // Save setting
    const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
        const newSettings = { ...settings, [key]: value };
        setSettings(newSettings);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings));

        // Dispatch custom event for cross-component updates if needed
        window.dispatchEvent(new CustomEvent('settings-changed', { detail: newSettings }));
    };

    return {
        settings,
        updateSetting,
        loaded
    };
}
