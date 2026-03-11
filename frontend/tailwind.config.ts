import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                background: "var(--background)",
                surface: "var(--surface)",
                "surface-elevated": "var(--surface-elevated)",
                "surface-strong": "var(--surface-strong)",
                "text-primary": "var(--text-primary)",
                "text-secondary": "var(--text-secondary)",
                "text-tertiary": "var(--text-tertiary)",
                "text-on-dark": "var(--text-on-dark)",
                "accent-primary": "var(--accent-primary)",
                "accent-primary-hover": "var(--accent-primary-hover)",
                "accent-soft": "var(--accent-soft)",
                "accent-strong": "var(--accent-strong)",
                border: "var(--border)",
                "border-strong": "var(--border-strong)",
                ring: "var(--ring)",
                primary: "var(--accent-primary)",
                success: "var(--success)",
                warning: "var(--warning)",
                error: "var(--error)",
                info: "var(--info)",
            },
            fontFamily: {
                heading: ["var(--font-heading)"],
                body: ["var(--font-body)"],
                mono: ["var(--font-mono)"],
            },
            spacing: {
                1: "var(--space-1)",
                2: "var(--space-2)",
                3: "var(--space-3)",
                4: "var(--space-4)",
                5: "var(--space-5)",
                6: "var(--space-6)",
                8: "var(--space-8)",
            },
            borderRadius: {
                none: "var(--radius-none)",
                sm: "var(--radius-sm)",
                md: "var(--radius-md)",
                lg: "var(--radius-lg)",
                xl: "var(--radius-xl)",
                full: "var(--radius-full)",
            },
        },
    },
    plugins: [],
};

export default config;
