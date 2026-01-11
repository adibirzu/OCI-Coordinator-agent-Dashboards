import { IconWrapper, IconProps } from './IconWrapper';

export function DatabaseIcon({ color = '#F80000', ...props }: IconProps) {
    return (
        <IconWrapper color={color} {...props}>
            <path
                d="M20 7C20 8.65685 16.4183 10 12 10C7.58172 10 4 8.65685 4 7C4 5.34315 7.58172 4 12 4C16.4183 4 20 5.34315 20 7Z"
                stroke={color}
                strokeWidth="1.5"
            />
            <path
                d="M20 12C20 13.6569 16.4183 15 12 15C7.58172 15 4 13.6569 4 12"
                stroke={color}
                strokeWidth="1.5"
            />
            <path
                d="M20 17C20 18.6569 16.4183 20 12 20C7.58172 20 4 18.6569 4 17"
                stroke={color}
                strokeWidth="1.5"
            />
            <path d="M4 7V17" stroke={color} strokeWidth="1.5" />
            <path d="M20 7V17" stroke={color} strokeWidth="1.5" />
        </IconWrapper>
    );
}
