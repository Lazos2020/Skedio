import React, { useEffect, useState } from 'react';
import splashLogo from '../assets/images/skedio-splash.webp';

interface SplashScreenProps {
  /**
   * When true, the splash screen crossfades to transparent so the app
   * underneath (already mounted and preloaded) becomes visible.
   * The parent is responsible for unmounting this component once the
   * fade transition has finished.
   */
  fadingOut: boolean;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ fadingOut }) => {
  // Drives the initial fade-IN on mount. A brief delay ensures the browser
  // paints the 0-opacity state first, so the transition actually animates.
  const [hasEntered, setHasEntered] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setHasEntered(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const visible = hasEntered && !fadingOut;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#121212] transition-opacity duration-500 ease-in-out pointer-events-none"
      style={{ opacity: visible ? 1 : 0 }}
      aria-hidden="true"
    >
      {/* Official Skedio splash art. object-cover fills the entire screen on
          phones and tablets edge-to-edge. On very wide desktops we cap the
          width so the portrait art stays centered without extreme cropping. */}
      <img
        src={splashLogo}
        alt="Skedio"
        className="h-full w-full object-cover select-none"
        draggable={false}
      />
    </div>
  );
};
