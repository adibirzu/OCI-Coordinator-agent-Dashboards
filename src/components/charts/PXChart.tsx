'use client';

import { Bar, Doughnut } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    ArcElement,
    Title,
    Tooltip,
    Legend,
    ChartOptions,
} from 'chart.js';
import { PXSession, DOPDowngrade } from '@/hooks/useOracleTroubleshoot';
import styles from './Charts.module.css';

// Register Chart.js components
ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    ArcElement,
    Title,
    Tooltip,
    Legend
);

interface PXServerChartProps {
    maxServers: number;
    inUse: number;
    available: number;
    height?: number;
}

export function PXServerChart({ maxServers, inUse, available, height = 200 }: PXServerChartProps) {
    const chartData = {
        labels: ['In Use', 'Available'],
        datasets: [
            {
                data: [inUse, available],
                backgroundColor: ['#4ecdc4', '#2d3748'],
                borderColor: ['#4ecdc4', '#4a5568'],
                borderWidth: 2,
            },
        ],
    };

    const options: ChartOptions<'doughnut'> = {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
            legend: {
                position: 'bottom',
                labels: {
                    color: '#e0e0e0',
                    usePointStyle: true,
                    padding: 15,
                },
            },
            tooltip: {
                backgroundColor: 'rgba(30, 30, 30, 0.9)',
                titleColor: '#fff',
                bodyColor: '#e0e0e0',
                callbacks: {
                    label: (context) => {
                        const pct = ((context.parsed / maxServers) * 100).toFixed(1);
                        return `${context.label}: ${context.parsed} (${pct}%)`;
                    },
                },
            },
        },
    };

    return (
        <div className={styles.chartContainer} style={{ height }}>
            <div className={styles.doughnutCenter}>
                <span className={styles.centerValue}>{inUse}</span>
                <span className={styles.centerLabel}>/ {maxServers}</span>
            </div>
            <Doughnut data={chartData} options={options} />
        </div>
    );
}

interface DOPEfficiencyChartProps {
    sessions: PXSession[];
    height?: number;
}

export function DOPEfficiencyChart({ sessions, height = 250 }: DOPEfficiencyChartProps) {
    const labels = sessions.map((s) => `SID ${s.qc_sid}`);

    const chartData = {
        labels,
        datasets: [
            {
                label: 'Requested DOP',
                data: sessions.map((s) => s.requested_dop),
                backgroundColor: 'rgba(255, 107, 107, 0.7)',
                borderColor: '#ff6b6b',
                borderWidth: 1,
            },
            {
                label: 'Actual DOP',
                data: sessions.map((s) => s.actual_dop),
                backgroundColor: 'rgba(78, 205, 196, 0.7)',
                borderColor: '#4ecdc4',
                borderWidth: 1,
            },
        ],
    };

    const options: ChartOptions<'bar'> = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top',
                labels: {
                    color: '#e0e0e0',
                    usePointStyle: true,
                    padding: 20,
                },
            },
            tooltip: {
                backgroundColor: 'rgba(30, 30, 30, 0.9)',
                titleColor: '#fff',
                bodyColor: '#e0e0e0',
                callbacks: {
                    afterBody: (context) => {
                        const idx = context[0].dataIndex;
                        const session = sessions[idx];
                        const efficiency = ((session.actual_dop / session.requested_dop) * 100).toFixed(0);
                        return `\nEfficiency: ${efficiency}%\nUser: ${session.username}`;
                    },
                },
            },
        },
        scales: {
            x: {
                grid: {
                    color: 'rgba(255, 255, 255, 0.1)',
                },
                ticks: {
                    color: '#888',
                },
            },
            y: {
                beginAtZero: true,
                grid: {
                    color: 'rgba(255, 255, 255, 0.1)',
                },
                ticks: {
                    color: '#888',
                    stepSize: 4,
                },
                title: {
                    display: true,
                    text: 'Degree of Parallelism',
                    color: '#888',
                },
            },
        },
    };

    return (
        <div className={styles.chartContainer} style={{ height }}>
            <Bar data={chartData} options={options} />
        </div>
    );
}

interface DowngradeTimelineProps {
    downgrades: DOPDowngrade[];
    height?: number;
}

export function DowngradeTimeline({ downgrades, height = 200 }: DowngradeTimelineProps) {
    // Group by reason
    const reasonCounts = downgrades.reduce((acc, d) => {
        const reason = d.reason.split(':')[0].trim();
        acc[reason] = (acc[reason] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    const labels = Object.keys(reasonCounts);
    const values = Object.values(reasonCounts);

    const chartData = {
        labels,
        datasets: [
            {
                data: values,
                backgroundColor: [
                    'rgba(255, 107, 107, 0.7)',
                    'rgba(255, 230, 109, 0.7)',
                    'rgba(78, 205, 196, 0.7)',
                    'rgba(149, 165, 166, 0.7)',
                ],
                borderColor: [
                    '#ff6b6b',
                    '#ffe66d',
                    '#4ecdc4',
                    '#95a5a6',
                ],
                borderWidth: 2,
            },
        ],
    };

    const options: ChartOptions<'doughnut'> = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'right',
                labels: {
                    color: '#e0e0e0',
                    usePointStyle: true,
                    padding: 10,
                    font: {
                        size: 11,
                    },
                },
            },
            tooltip: {
                backgroundColor: 'rgba(30, 30, 30, 0.9)',
                titleColor: '#fff',
                bodyColor: '#e0e0e0',
            },
        },
    };

    return (
        <div className={styles.chartContainer} style={{ height }}>
            <Doughnut data={chartData} options={options} />
        </div>
    );
}
