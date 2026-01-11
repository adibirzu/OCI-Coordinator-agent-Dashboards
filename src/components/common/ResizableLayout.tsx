"use client";

import React, { useState, useRef, useEffect, ReactNode } from 'react';

interface ResizableLayoutProps {
    left: ReactNode;
    right: ReactNode;
    initialLeftWidth?: number; // percentage, e.g., 40
    minLeftWidth?: number; // percentage
    maxLeftWidth?: number; // percentage
    className?: string;
}

export const ResizableLayout: React.FC<ResizableLayoutProps> = ({
    left,
    right,
    initialLeftWidth = 40,
    minLeftWidth = 20,
    maxLeftWidth = 80,
    className
}) => {
    const [leftWidth, setLeftWidth] = useState(initialLeftWidth);
    const containerRef = useRef<HTMLDivElement>(null);
    const isResizingRef = useRef(false);

    const startResizing = (e: React.MouseEvent) => {
        e.preventDefault();
        isResizingRef.current = true;
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', stopResizing);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        // Add overlay to prevent iframe interference if any
        const overlay = document.createElement('div');
        overlay.id = 'resize-overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.zIndex = '9999';
        overlay.style.cursor = 'col-resize';
        document.body.appendChild(overlay);
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isResizingRef.current || !containerRef.current) return;

        const containerRect = containerRef.current.getBoundingClientRect();
        const newLeftWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;

        if (newLeftWidth >= minLeftWidth && newLeftWidth <= maxLeftWidth) {
            setLeftWidth(newLeftWidth);
        }
    };

    const stopResizing = () => {
        isResizingRef.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', stopResizing);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        const overlay = document.getElementById('resize-overlay');
        if (overlay) document.body.removeChild(overlay);
    };

    return (
        <div ref={containerRef} className={className} style={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden' }}>
            <div style={{ width: `${leftWidth}%`, height: '100%', overflow: 'hidden' }}>
                {left}
            </div>

            <div
                className="resizer"
                onMouseDown={startResizing}
                style={{
                    width: '6px',
                    cursor: 'col-resize',
                    backgroundColor: 'var(--color-border)', // Updated to CSS variable
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10,
                    transition: 'background-color 0.2s',
                    flexShrink: 0
                }}
            >
                {/* Visual handle indicator */}
                <div style={{
                    width: '2px',
                    height: '24px',
                    backgroundColor: 'var(--color-text-tertiary)',
                    borderRadius: '1px'
                }} />
            </div>

            <div style={{ flex: 1, minWidth: 0, height: '100%', overflow: 'hidden' }}>
                {right}
            </div>

            <style jsx>{`
                .resizer:hover, .resizer:active {
                    background-color: var(--color-primary-light) !important;
                }
                .resizer:hover > div, .resizer:active > div {
                    background-color: var(--color-primary);
                }
            `}</style>
        </div>
    );
};
