import { IconWrapper, IconProps } from './IconWrapper';

export function ComputeIcon({ color = '#F80000', ...props }: IconProps) {
    return (
        <IconWrapper color={color} {...props}>
            <path
                d="M4 6C4 4.89543 4.89543 4 6 4H18C19.1046 4 20 4.89543 20 6V18C20 19.1046 19.1046 20 18 20H6C4.89543 20 4 19.1046 4 18V6Z"
                stroke={color}
                strokeWidth="1.5"
            />
            <rect x="7" y="8" width="10" height="2" rx="1" fill={color} fillOpacity="0.4" />
            <rect x="7" y="14" width="10" height="2" rx="1" fill={color} fillOpacity="0.4" />
            <circle cx="12" cy="12" r="1" fill={color} />
        </IconWrapper>
    );
}
