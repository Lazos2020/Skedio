import React from 'react';
import { Home, FolderGit2, BarChart3, Settings } from 'lucide-react';
import { ActiveTab } from '../types';

interface BottomNavProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  projectCount: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onTabChange, projectCount }) => {
  const navItems: { id: ActiveTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'home', label: 'Home', icon: <Home size={22} /> },
    { id: 'projects', label: 'Projects', icon: <FolderGit2 size={22} />, badge: projectCount },
    { id: 'statistics', label: 'Stats', icon: <BarChart3 size={22} /> },
    { id: 'settings', label: 'Settings', icon: <Settings size={22} /> },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-[#181818] border-t border-white/10 pt-2 select-none shadow-2xl"
      style={{
        paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))',
        paddingLeft: 'max(1rem, env(safe-area-inset-left))',
        paddingRight: 'max(1rem, env(safe-area-inset-right))',
      }}
    >
      <div className="max-w-md mx-auto flex items-center justify-around">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`relative flex flex-col items-center justify-center min-h-[50px] min-w-[60px] px-2 py-1 transition-colors duration-150 rounded-none focus:outline-none ${
                isActive ? 'text-white' : 'text-white/40 hover:text-white/70'
              }`}
            >
              {isActive && (
                <div className="absolute top-0 w-10 h-0.5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
              )}
              <div className="relative">
                {item.icon}
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 flex h-4 min-w-[16px] items-center justify-center bg-rose-600 px-1 text-[10px] font-bold text-white shadow">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className={`text-xs font-medium mt-1 ${isActive ? 'font-bold' : ''}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
