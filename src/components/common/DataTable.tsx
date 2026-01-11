'use client';

import styles from './DataTable.module.css';

export interface Column {
    key: string;
    header: string;
    align?: 'left' | 'center' | 'right';
    width?: string;
}

export interface DataTableProps {
    columns: Column[];
    data: Record<string, string | number | boolean | null>[];
    title?: string;
    maxRows?: number;
    emptyMessage?: string;
}

export function DataTable({
    columns,
    data,
    title,
    maxRows = 100,
    emptyMessage = 'No data available',
}: DataTableProps) {
    const displayData = data.slice(0, maxRows);
    const hasMore = data.length > maxRows;

    if (data.length === 0) {
        return (
            <div className={styles.container}>
                {title && <div className={styles.title}>{title}</div>}
                <div className={styles.empty}>{emptyMessage}</div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            {title && <div className={styles.title}>{title}</div>}
            <div className={styles.tableWrapper}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            {columns.map(col => (
                                <th
                                    key={col.key}
                                    className={styles.th}
                                    style={{
                                        textAlign: col.align || 'left',
                                        width: col.width,
                                    }}
                                >
                                    {col.header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {displayData.map((row, idx) => (
                            <tr key={idx} className={styles.tr}>
                                {columns.map(col => (
                                    <td
                                        key={col.key}
                                        className={styles.td}
                                        style={{ textAlign: col.align || 'left' }}
                                    >
                                        {formatValue(row[col.key])}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {hasMore && (
                <div className={styles.footer}>
                    Showing {maxRows} of {data.length} rows
                </div>
            )}
        </div>
    );
}

function formatValue(value: string | number | boolean | null): string {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return String(value);
}

// Helper to auto-detect columns from data
export function autoColumns(data: Record<string, unknown>[]): Column[] {
    if (data.length === 0) return [];

    const firstRow = data[0];
    return Object.keys(firstRow).map(key => ({
        key,
        header: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '),
        align: typeof firstRow[key] === 'number' ? 'right' as const : 'left' as const,
    }));
}
