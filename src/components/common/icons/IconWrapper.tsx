import { SVGProps } from 'react';

export interface IconProps extends SVGProps<SVGSVGElement> {
    size?: number | string;
    color?: string;
    glow?: boolean;
}

export function IconWrapper({
    children,
    size = 24,
    color = 'currentColor',
    glow = false,
    style,
    ...props
}: IconProps) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{
                filter: glow ? `drop-shadow(0 0 8px ${color})` : 'none',
                transition: 'all 0.3s ease',
                ...style
            }}
            {...props}
        >
            {children}
        </svg>
    );
}
