import React from 'react';
import logoImg from '../assets/images/skedio-logo.webp';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({ size = 'md', className = '' }) => {
  const dimensions = {
    sm: 'h-8 w-auto aspect-[3/4]',
    md: 'h-11 w-auto aspect-[3/4]',
    lg: 'h-16 w-auto aspect-[3/4]',
    xl: 'h-24 w-auto aspect-[3/4]',
  }[size];

  return (
    <div className={`flex items-center select-none ${className}`}>
      <img
        src={logoImg}
        alt="Skedio Logo"
        className={`${dimensions} object-contain rounded-lg shadow-lg border border-white/10`}
      />
    </div>
  );
};
