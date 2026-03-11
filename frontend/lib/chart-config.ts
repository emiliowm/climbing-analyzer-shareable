/**
 * Recharts theme configuration for scientific data visualization
 * - Thin strokes (2px, precise)
 * - No dots (cleaner lines)
 * - Minimal grid (horizontal only)
 * - Monospace numbers (data clarity)
 */

export const lineChartConfig = {
    strokeWidth: 2,
    dot: false,
    activeDot: {
        r: 4,
        strokeWidth: 2,
    },
};

export const gridConfig = {
    stroke: 'rgba(24, 32, 42, 0.12)',
    strokeDasharray: '0',
    horizontal: true,
    vertical: false,
};

export const axisConfig = {
    axisLine: {
        stroke: 'rgba(24, 32, 42, 0.26)',
    },
    tick: {
        fill: '#6e7781',
        fontSize: 11,
        fontFamily: 'var(--font-mono)',
    },
};

export const metricColors = {
    flowScore: '#2f6f4f',
    stability: '#1f9d55',
    elbowFlexion: '#16232e',
    barnDoor: '#9f2f3f',
    hipDistance: '#5b656f',
};

export const barChartConfig = {
    radius: [4, 4, 0, 0],
    barGap: 4,
};
