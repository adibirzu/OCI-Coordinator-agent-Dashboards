import { IconWrapper, IconProps } from './IconWrapper';

export function LLMIcon({ color = '#AA00FF', ...props }: IconProps) {
    return (
        <IconWrapper color={color} {...props}>
            <path
                d="M9.5 9.5C9.5 9.5 10 7 12 7C14 7 14.5 9.5 14.5 9.5"
                stroke={color}
                strokeWidth="1.5"
                strokeLinecap="round"
            />
            <path
                d="M9 14.5C9 14.5 10 16.5 12 16.5C14 16.5 15 14.5 15 14.5"
                stroke={color}
                strokeWidth="1.5"
                strokeLinecap="round"
            />
            <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.5" />
            <circle cx="7.5" cy="11.5" r="1.5" fill={color} />
            <circle cx="16.5" cy="11.5" r="1.5" fill={color} />
            {/* Sparkles */}
            <path d="M19 5L20 2L21 5L24 6L21 7L20 10L19 7L16 6L19 5Z" fill={color} />
        </IconWrapper>
    );
}
