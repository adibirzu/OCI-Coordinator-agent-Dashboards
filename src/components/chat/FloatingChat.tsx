"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { getQuickScenarios } from '@/data/scenarios';
import styles from './FloatingChat.module.css';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

// Markdown components for styling code blocks within the chat
const MarkdownComponents = {
    code: ({ className, children, ...props }: React.HTMLAttributes<HTMLElement> & { inline?: boolean }) => {
        const match = /language-(\w+)/.exec(className || '');
        const isInline = !match && (children?.toString()?.includes('\n') === false);

        if (isInline) {
            return <code className={styles.inlineCode} {...props}>{children}</code>;
        }

        return (
            <pre className={styles.codeBlock}>
                <code className={className} {...props}>{children}</code>
            </pre>
        );
    },
    p: ({ children }: { children?: React.ReactNode }) => (
        <p className={styles.markdownParagraph}>{children}</p>
    ),
    ul: ({ children }: { children?: React.ReactNode }) => (
        <ul className={styles.markdownList}>{children}</ul>
    ),
    ol: ({ children }: { children?: React.ReactNode }) => (
        <ol className={styles.markdownList}>{children}</ol>
    ),
    li: ({ children }: { children?: React.ReactNode }) => (
        <li className={styles.markdownListItem}>{children}</li>
    ),
    strong: ({ children }: { children?: React.ReactNode }) => (
        <strong className={styles.markdownStrong}>{children}</strong>
    ),
    table: ({ children }: { children?: React.ReactNode }) => (
        <div className={styles.tableWrapper}>
            <table className={styles.markdownTable}>{children}</table>
        </div>
    ),
};

export function FloatingChat() {
    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Check connection status
    useEffect(() => {
        const checkConnection = async () => {
            try {
                const res = await fetch('/api/health');
                setConnectionStatus(res.ok ? 'connected' : 'disconnected');
            } catch {
                setConnectionStatus('disconnected');
            }
        };
        checkConnection();
        const interval = setInterval(checkConnection, 30000);
        return () => clearInterval(interval);
    }, []);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const sendMessage = useCallback(async () => {
        if (!input.trim() || isLoading) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: input.trim(),
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: userMessage.content })
            });

            const data = await res.json();

            const assistantMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: data.response || data.message || 'No response received',
                timestamp: new Date()
            };

            setMessages(prev => [...prev, assistantMessage]);
        } catch (e) {
            const errorMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: 'Failed to connect to the coordinator. Please check if the backend is running.',
                timestamp: new Date()
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    }, [input, isLoading]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    if (!isOpen) {
        return (
            <button
                className={styles.floatingButton}
                onClick={() => setIsOpen(true)}
                aria-label="Open chat"
            >
                <span className={styles.chatIcon}>💬</span>
                <span className={`${styles.statusDot} ${styles[connectionStatus]}`} />
            </button>
        );
    }

    return (
        <div className={`${styles.container} ${isMinimized ? styles.minimized : ''}`}>
            <div className={styles.header}>
                <div className={styles.headerTitle}>
                    <span className={`${styles.statusDot} ${styles[connectionStatus]}`} />
                    <span>OCI Coordinator Chat</span>
                </div>
                <div className={styles.headerActions}>
                    <button
                        className={styles.headerButton}
                        onClick={() => setIsMinimized(!isMinimized)}
                        aria-label={isMinimized ? 'Expand' : 'Minimize'}
                    >
                        {isMinimized ? '⬆' : '⬇'}
                    </button>
                    <button
                        className={styles.headerButton}
                        onClick={() => setIsOpen(false)}
                        aria-label="Close chat"
                    >
                        ✕
                    </button>
                </div>
            </div>

            {!isMinimized && (
                <>
                    <div className={styles.messages}>
                        {messages.length === 0 ? (
                            <div className={styles.emptyState}>
                                <div className={styles.welcomeSection}>
                                    <span className={styles.welcomeIcon}>🤖</span>
                                    <h4 className={styles.welcomeTitle}>OCI Coordinator</h4>
                                    <p className={styles.welcomeText}>Your AI assistant for Oracle Cloud Infrastructure</p>
                                </div>
                                <div className={styles.scenariosSection}>
                                    <span className={styles.scenariosLabel}>Quick Actions</span>
                                    <div className={styles.scenariosList}>
                                        {getQuickScenarios().map((scenario, idx) => (
                                            <button
                                                key={idx}
                                                className={styles.scenarioButton}
                                                onClick={() => setInput(scenario.prompt)}
                                                title={scenario.prompt}
                                            >
                                                <span className={styles.scenarioIcon}>{scenario.icon || scenario.agentIcon}</span>
                                                <span className={styles.scenarioLabel}>{scenario.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            messages.map(msg => (
                                <div
                                    key={msg.id}
                                    className={`${styles.message} ${styles[msg.role]}`}
                                >
                                    <div className={styles.messageContent}>
                                        {msg.role === 'assistant' ? (
                                            <ReactMarkdown components={MarkdownComponents}>
                                                {msg.content}
                                            </ReactMarkdown>
                                        ) : (
                                            msg.content
                                        )}
                                    </div>
                                    <div className={styles.messageTime}>
                                        {msg.timestamp.toLocaleTimeString()}
                                    </div>
                                </div>
                            ))
                        )}
                        {isLoading && (
                            <div className={`${styles.message} ${styles.assistant}`}>
                                <div className={styles.typing}>
                                    <span></span><span></span><span></span>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <div className={styles.inputArea}>
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Ask about your OCI infrastructure..."
                            disabled={isLoading || connectionStatus === 'disconnected'}
                            rows={1}
                        />
                        <button
                            onClick={sendMessage}
                            disabled={!input.trim() || isLoading || connectionStatus === 'disconnected'}
                            aria-label="Send message"
                        >
                            ➤
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
