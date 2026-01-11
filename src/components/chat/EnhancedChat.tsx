'use client';

import { useState, useRef, useEffect } from 'react';
import { DataTable, Column } from '@/components/common/DataTable';
import { getQuickScenarios } from '@/data/scenarios';
import styles from './EnhancedChat.module.css';

interface StructuredData {
    title?: string;
    columns: Column[];
    rows: Record<string, string | number | boolean | null>[];
}

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
    agentsUsed?: string[];
    contentType?: 'text' | 'table' | 'code' | 'mixed';
    structuredData?: StructuredData;
}

interface AuthState {
    required: boolean;
    url: string | null;
}

export function EnhancedChat() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [authState, setAuthState] = useState<AuthState>({ required: false, url: null });
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [threadId, setThreadId] = useState<string | null>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim()) return;

        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: input,
            timestamp: Date.now(),
            contentType: 'text',
        };

        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);

        try {
            const payload: Record<string, string> = { message: userMsg.content };
            if (threadId) {
                payload.thread_id = threadId;
            }

            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            // Handle OCA authentication required
            if (res.status === 401 && data.error === 'authentication_required') {
                setAuthState({ required: true, url: data.auth_url });
                const authMsg: Message = {
                    id: (Date.now() + 1).toString(),
                    role: 'assistant',
                    content: data.message || 'Authentication required. Please login with Oracle SSO.',
                    timestamp: Date.now(),
                    contentType: 'text',
                };
                setMessages(prev => [...prev, authMsg]);
                setIsLoading(false);
                return;
            }

            // Handle coordinator unavailable (graceful degradation response)
            if (data.error === 'coordinator_unavailable') {
                const unavailableMsg: Message = {
                    id: (Date.now() + 1).toString(),
                    role: 'assistant',
                    content: `⚠️ **Coordinator Unavailable**\n\n${data.message}\n\nPlease ensure the backend coordinator services are running:\n- Status/Health service on port 8001\n- Logs/Chat service on port 3001`,
                    timestamp: Date.now(),
                    contentType: 'text',
                };
                setMessages(prev => [...prev, unavailableMsg]);
                setIsLoading(false);
                return;
            }

            if (!res.ok) throw new Error(data.message || 'Coordinator unavailable');

            // Clear auth state on successful response
            if (authState.required) {
                setAuthState({ required: false, url: null });
            }

            // Save thread_id if new
            if (data.thread_id && !threadId) {
                setThreadId(data.thread_id);
            }

            const botMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: data.response || "No response content.",
                timestamp: Date.now(),
                agentsUsed: data.agent ? [data.agent] : [],
                contentType: data.content_type || 'text',
                structuredData: data.structured_data,
            };

            setMessages(prev => [...prev, botMsg]);
        } catch (e: unknown) {
            const errorMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: `Error: ${e instanceof Error ? e.message : 'Unknown error'}`,
                timestamp: Date.now(),
                contentType: 'text',
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setIsLoading(false);
        }
    };

    const renderMessageContent = (msg: Message) => {
        // Render table if we have structured data
        if (msg.contentType === 'table' && msg.structuredData) {
            return (
                <div className={styles.tableContainer}>
                    {msg.content && (
                        <div className={styles.textContent}>{msg.content}</div>
                    )}
                    <DataTable
                        columns={msg.structuredData.columns}
                        data={msg.structuredData.rows}
                        title={msg.structuredData.title}
                        maxRows={20}
                    />
                </div>
            );
        }

        // Render code blocks with highlighting
        if (msg.contentType === 'code') {
            return (
                <div className={styles.codeContent}>
                    <pre className={styles.codeBlock}>{msg.content}</pre>
                </div>
            );
        }

        // Default text rendering
        return <div className={styles.textContent}>{msg.content}</div>;
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <span className={styles.headerIcon}>🤖</span>
                <span className={styles.headerTitle}>OCI Coordinator Chat</span>
            </div>

            <div className={styles.messageList}>
                {messages.length === 0 && (
                    <div className={styles.emptyState}>
                        <div className={styles.emptyWelcome}>
                            <span className={styles.emptyIcon}>🤖</span>
                            <h3>OCI Coordinator</h3>
                            <p>Your AI assistant for Oracle Cloud Infrastructure</p>
                        </div>
                        <div className={styles.scenariosSection}>
                            <span className={styles.scenariosLabel}>Quick Actions</span>
                            <div className={styles.scenariosList}>
                                {getQuickScenarios().map((scenario, idx) => (
                                    <button
                                        key={idx}
                                        className={styles.scenarioButton}
                                        onClick={() => {
                                            setInput(scenario.prompt);
                                        }}
                                        title={scenario.prompt}
                                    >
                                        <span className={styles.scenarioIcon}>{scenario.icon || scenario.agentIcon}</span>
                                        <span className={styles.scenarioLabel}>{scenario.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {messages.map((msg) => (
                    <div key={msg.id} className={`${styles.messageRow} ${msg.role === 'user' ? styles.rowUser : styles.rowBot}`}>
                        <div className={styles.avatar}>
                            {msg.role === 'user' ? '👤' : '🤖'}
                        </div>
                        <div className={`${styles.bubble} ${msg.contentType === 'table' ? styles.wideBubble : ''}`}>
                            {renderMessageContent(msg)}
                            {msg.agentsUsed && msg.agentsUsed.length > 0 && (
                                <div className={styles.agentTag}>Used: {msg.agentsUsed.join(', ')}</div>
                            )}
                            <div className={styles.timestamp}>
                                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                        </div>
                    </div>
                ))}

                {isLoading && (
                    <div className={`${styles.messageRow} ${styles.rowBot}`}>
                        <div className={styles.avatar}>🤖</div>
                        <div className={`${styles.bubble} ${styles.loadingBubble}`}>
                            <span className={styles.dot}></span>
                            <span className={styles.dot}></span>
                            <span className={styles.dot}></span>
                        </div>
                    </div>
                )}

                {authState.required && authState.url && (
                    <div className={styles.authBanner}>
                        <span className={styles.authIcon}>🔐</span>
                        <span>Oracle SSO authentication required</span>
                        <a
                            href={authState.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.authButton}
                        >
                            Login with Oracle SSO
                        </a>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className={styles.inputArea}>
                <input
                    className={styles.input}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="Type a message..."
                    disabled={isLoading}
                />
                <button
                    className={styles.sendButton}
                    onClick={handleSend}
                    disabled={isLoading || !input.trim()}
                >
                    ➤
                </button>
            </div>
        </div>
    );
}
