import { IconWrapper, IconProps } from './IconWrapper';

export function MCPIcon({ color = '#00F0FF', ...props }: IconProps) {
    return (
        <IconWrapper color={color} {...props}>
            <path
                d="M12 2L20.6603 7V17L12 22L3.33975 17V7L12 2Z"
                stroke={color}
                strokeWidth="1.5"
                strokeLinejoin="round"
            />
            <circle cx="12" cy="12" r="3" stroke={color} strokeWidth="1.5" />
            <path d="M12 2V5" stroke={color} strokeWidth="1.5" />
            <path d="M12 19V22" stroke={color} strokeWidth="1.5" />
            <path d="M3.34 7L6 8.5" stroke={color} strokeWidth="1.5" />
            <path d="M18 15.5L20.66 17" stroke={color} strokeWidth="1.5" />
        </IconWrapper>
    );
}
