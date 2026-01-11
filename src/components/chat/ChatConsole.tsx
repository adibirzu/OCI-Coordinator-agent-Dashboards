'use client';

import { useState, useRef, useEffect } from 'react';
import styles from './ChatConsole.module.css';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
    agentsUsed?: string[]; // Optional agent metadata
}

export function ChatConsole() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Initial check for Coordinator Health
    useEffect(() => {
        checkHealth();
        const interval = setInterval(checkHealth, 10000);
        return () => clearInterval(interval);
    }, []);

    const checkHealth = async () => {
        try {
            // Simple ping to our own API which checks coordinator status
            const res = await fetch('/api/coordinator/status');
            const data = await res.json();
            setIsConnected(data.isRunning);
        } catch (e) {
            setIsConnected(false);
        }
    };

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
            timestamp: Date.now()
        };

        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: userMsg.content })
            });

            if (!res.ok) {
                throw new Error('Coordinator unavailable');
            }

            const data = await res.json();

            const botMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: data.response || "I received your message but returned no content.",
                timestamp: Date.now(),
                agentsUsed: data.agent ? [data.agent] : []
            };

            setMessages(prev => [...prev, botMsg]);
        } catch (e: any) {
            const errorMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: `Error: ${e.message}. Please ensure the OCI Coordinator is running on port 3001.`,
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
                <div className={styles.title}>
                    <span>◆</span> OCI Agent Coordinator
                </div>
                <div
                    className={`${styles.status} ${isConnected ? styles.statusConnected : ''}`}
                    title={isConnected ? "Coordinator Online" : "Coordinator Offline"}
                />
            </div>

            <div className={styles.messages}>
                {messages.length === 0 && (
                    <div style={{ textAlign: 'center', opacity: 0.4, marginTop: '40px' }}>
                        <p>Waiting for instructions...</p>
                    </div>
                )}

                {messages.map(msg => (
                    <div key={msg.id} className={`${styles.message} ${msg.role === 'user' ? styles.userMessage : styles.botMessage}`}>
                        <div>{msg.content}</div>
                        {msg.agentsUsed && msg.agentsUsed.length > 0 && (
                            <div style={{ fontSize: '10px', marginTop: '6px', opacity: 0.8, background: 'rgba(0,0,0,0.2)', padding: '2px 6px', borderRadius: '4px', width: 'fit-content' }}>
                                Agent: {msg.agentsUsed[0]}
                            </div>
                        )}
                        <span className={styles.timestamp}>
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    </div>
                ))}

                {isLoading && (
                    <div className={styles.typingIndicator}>
                        <div className={styles.dot} />
                        <div className={styles.dot} />
                        <div className={styles.dot} />
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
                    placeholder="Ask OCI Coordinator..."
                    disabled={isLoading}
                />
                <button
                    className={styles.button}
                    onClick={handleSend}
                    disabled={isLoading || !input.trim()}
                >
                    SEND
                </button>
            </div>
        </div>
    );
}
