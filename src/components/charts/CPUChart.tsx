'use client';

import { Line } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler,
    ChartOptions,
} from 'chart.js';
import { CPUDataPoint } from '@/hooks/useOracleTroubleshoot';
import styles from './Charts.module.css';

// Register Chart.js components
ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
);

interface CPUChartProps {
    data: CPUDataPoint[];
    height?: number;
}

export default function CPUChart({ data, height = 300 }: CPUChartProps) {
    // Format timestamps for x-axis labels
    const labels = data.map((point) => {
        const date = new Date(point.timestamp);
        return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        });
    });

    const chartData = {
        labels,
        datasets: [
            {
                label: 'CPU %',
                data: data.map((p) => p.cpu_percent),
                borderColor: '#ff6b6b',
                backgroundColor: 'rgba(255, 107, 107, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 2,
                pointHoverRadius: 5,
            },
            {
                label: 'DB Time %',
                data: data.map((p) => p.db_time_percent),
                borderColor: '#4ecdc4',
                backgroundColor: 'rgba(78, 205, 196, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 2,
                pointHoverRadius: 5,
            },
            {
                label: 'Wait %',
                data: data.map((p) => p.wait_percent),
                borderColor: '#ffe66d',
                backgroundColor: 'rgba(255, 230, 109, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 2,
                pointHoverRadius: 5,
            },
        ],
    };

    const options: ChartOptions<'line'> = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'index',
            intersect: false,
        },
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
                borderColor: '#444',
                borderWidth: 1,
                padding: 12,
                displayColors: true,
                callbacks: {
                    label: (context) => {
                        return `${context.dataset.label}: ${context.parsed.y}%`;
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
                    maxRotation: 45,
                    minRotation: 0,
                },
            },
            y: {
                min: 0,
                max: 100,
                grid: {
                    color: 'rgba(255, 255, 255, 0.1)',
                },
                ticks: {
                    color: '#888',
                    callback: (value) => `${value}%`,
                },
            },
        },
    };

    return (
        <div className={styles.chartContainer} style={{ height }}>
            <Line data={chartData} options={options} />
        </div>
    );
}
