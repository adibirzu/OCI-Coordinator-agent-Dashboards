"use client";

import React, { useState, useRef, ReactNode } from 'react';

interface VerticalResizableLayoutProps {
    top: ReactNode;
    bottom: ReactNode;
    initialTopHeight?: number; // percentage
    minTopHeight?: number; // percentage
    maxTopHeight?: number; // percentage
    className?: string;
}

export const VerticalResizableLayout: React.FC<VerticalResizableLayoutProps> = ({
    top,
    bottom,
    initialTopHeight = 50,
    minTopHeight = 20,
    maxTopHeight = 80,
    className
}) => {
    const [topHeight, setTopHeight] = useState(initialTopHeight);
    const containerRef = useRef<HTMLDivElement>(null);
    const isResizingRef = useRef(false);

    const startResizing = (e: React.MouseEvent) => {
        e.preventDefault();
        isResizingRef.current = true;
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', stopResizing);
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';

        const overlay = document.createElement('div');
        overlay.id = 'v-resize-overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.zIndex = '9999';
        overlay.style.cursor = 'row-resize';
        document.body.appendChild(overlay);
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isResizingRef.current || !containerRef.current) return;

        const containerRect = containerRef.current.getBoundingClientRect();
        const newTopHeight = ((e.clientY - containerRect.top) / containerRect.height) * 100;

        if (newTopHeight >= minTopHeight && newTopHeight <= maxTopHeight) {
            setTopHeight(newTopHeight);
        }
    };

    const stopResizing = () => {
        isResizingRef.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', stopResizing);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        const overlay = document.getElementById('v-resize-overlay');
        if (overlay) document.body.removeChild(overlay);
    };

    return (
        <div ref={containerRef} className={className} style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}>
            <div style={{ height: `${topHeight}%`, width: '100%', overflow: 'hidden' }}>
                {top}
            </div>

            <div
                className="v-resizer"
                onMouseDown={startResizing}
                style={{
                    height: '6px',
                    cursor: 'row-resize',
                    backgroundColor: 'var(--color-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10,
                    transition: 'background-color 0.2s',
                    flexShrink: 0,
                    width: '100%'
                }}
            >
                <div style={{
                    width: '24px',
                    height: '2px',
                    backgroundColor: 'var(--color-text-tertiary)',
                    borderRadius: '1px'
                }} />
            </div>

            <div style={{ flex: 1, minHeight: 0, width: '100%', overflow: 'hidden' }}>
                {bottom}
            </div>

            <style jsx>{`
                .v-resizer:hover, .v-resizer:active {
                    background-color: var(--color-primary-light) !important;
                }
                .v-resizer:hover > div, .v-resizer:active > div {
                    background-color: var(--color-primary);
                }
            `}</style>
        </div>
    );
};
