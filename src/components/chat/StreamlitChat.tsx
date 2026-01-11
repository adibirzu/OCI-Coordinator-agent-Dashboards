'use client';

import { useState, useRef, useEffect } from 'react';
import styles from './StreamlitChat.module.css';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
    agentsUsed?: string[];
}

interface AuthState {
    required: boolean;
    url: string | null;
}

export function StreamlitChat() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [authState, setAuthState] = useState<AuthState>({ required: false, url: null });
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const [threadId, setThreadId] = useState<string | null>(null);

    const handleSend = async () => {
        if (!input.trim()) return;

        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: input,
            timestamp: Date.now()
        };

        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);

        try {
            const payload: any = { message: userMsg.content };
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
                    timestamp: Date.now()
                };
                setMessages(prev => [...prev, authMsg]);
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
                agentsUsed: data.agent ? [data.agent] : []
            };

            setMessages(prev => [...prev, botMsg]);
        } catch (e: any) {
            const errorMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: `Error: ${e.message}`,
                timestamp: Date.now()
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setIsLoading(false);
        }
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
                        <p>👋 Hi! I'm your OCI Coordinator.</p>
                        <p>Ask me to manage resources, check costs, or analyze security.</p>
                    </div>
                )}

                {messages.map((msg) => (
                    <div key={msg.id} className={`${styles.messageRow} ${msg.role === 'user' ? styles.rowUser : styles.rowBot}`}>
                        <div className={styles.avatar}>
                            {msg.role === 'user' ? '👤' : '🤖'}
                        </div>
                        <div className={styles.bubble}>
                            <div className={styles.content}>{msg.content}</div>
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
