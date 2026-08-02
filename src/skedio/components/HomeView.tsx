import React, { useState } from 'react';
import { Project, CollectionFolder } from '../types';
import { ImportDialog } from './ImportDialog';
import { getProjectCover } from '../lib/projectCover';
import skedioBanner from '../assets/images/skedio-banner.webp';
import {
  Play,
  ArrowRight,
  Plus,
  FolderGit2,
  Star,
  Settings,
  X,
  ImagePlus,
} from 'lucide-react';

interface HomeViewProps {
  recentProjects: Project[];
  folders: CollectionFolder[];
  onOpenProject: (project: Project) => void;
  onNavigateToProjects: () => void;
  onNavigateToSettings: () => void;
  onImageImported: (dataUrl: string, fileName: string, category?: string) => void;
  onToggleFavorite?: (project: Project) => void;
  categories?: string[];
  onAddCategory?: (name: string) => void;
}

const formatDate = (ts: number) =>
  new Date(ts).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

export const HomeView: React.FC<HomeViewProps> = ({
  recentProjects,
  onOpenProject,
  onNavigateToProjects,
  onNavigateToSettings,
  onImageImported,
  onToggleFavorite,
  categories = [],
  onAddCategory,
}) => {
  const [importOpen, setImportOpen] = useState(false);
  const lastProject = recentProjects.length > 0 ? recentProjects[0] : null;
  const favoriteCount = recentProjects.filter((p) => p.isFavorite).length;

  const quickActions = [
    {
      label: 'Projects',
      sub: `${recentProjects.length} saved`,
      icon: FolderGit2,
      onClick: onNavigateToProjects,
      accent: 'text-sky-400',
    },
    {
      label: 'Favorites',
      sub: `${favoriteCount} starred`,
      icon: Star,
      onClick: onNavigateToProjects,
      accent: 'text-amber-400',
    },
    {
      label: 'Settings',
      sub: 'Preferences',
      icon: Settings,
      onClick: onNavigateToSettings,
      accent: 'text-rose-400',
    },
  ];

  return (
    <div className="min-h-screen bg-[#121212] pb-[calc(7rem+env(safe-area-inset-bottom))] text-white select-none">
      <div className="max-w-3xl mx-auto px-5 pt-[calc(2.5rem+env(safe-area-inset-top))]">
        {/* HEADER — custom banner logo */}
        <header className="mb-9 flex justify-center">
          <img
            src={skedioBanner}
            alt="Skedio"
            className="h-auto w-full max-w-[420px] object-contain select-none"
            draggable={false}
          />
        </header>

        {/* CONTINUE PROJECT */}
        {lastProject && (
          <button
            onClick={() => onOpenProject(lastProject)}
            className="group w-full text-left mb-5 flex items-center gap-4 bg-[#1c1c1c] border border-white/10 rounded-[22px] p-3.5 shadow-lg shadow-black/40 transition-all hover:border-white/25 active:scale-[0.99]"
          >
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[16px] bg-[#121212]">
              <img
                src={getProjectCover(lastProject)}
                alt={lastProject.name}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400">
                Continue Project
              </span>
              <h3 className="truncate text-lg font-bold text-white">{lastProject.name}</h3>
              <p className="text-xs text-white/40">Last opened {formatDate(lastProject.lastOpenedAt)}</p>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-black transition-transform group-hover:scale-105">
              <Play size={18} className="fill-black translate-x-0.5" />
            </div>
          </button>
        )}

        {/* CREATE PROJECT */}
        <button
          onClick={() => setImportOpen(true)}
          className="group relative mb-6 w-full overflow-hidden rounded-[24px] border border-rose-500/30 bg-gradient-to-br from-rose-600/25 via-[#1c1c1c] to-[#1c1c1c] p-6 text-left shadow-xl shadow-rose-900/20 transition-all hover:border-rose-400/50 active:scale-[0.99]"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] bg-rose-600 text-white shadow-lg shadow-rose-900/40 transition-transform group-hover:scale-105">
              <Plus size={28} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-black text-white">Create Project</h2>
              <p className="text-sm text-white/50">Import an image and start tracing.</p>
            </div>
            <ArrowRight size={22} className="shrink-0 text-white/40 transition-transform group-hover:translate-x-1" />
          </div>
        </button>

        {/* EMPTY STATE — shown only when the user has no projects yet */}
        {recentProjects.length === 0 && (
          <div className="mb-8 rounded-[22px] border border-dashed border-white/15 bg-[#1c1c1c] p-8 text-center">
            <ImagePlus size={32} className="mx-auto mb-3 text-white/40" />
            <h3 className="text-base font-bold text-white">No projects yet</h3>
            <p className="mt-1 text-sm text-white/50">Create your first project.</p>
          </div>
        )}

        {/* QUICK ACTIONS */}
        <div className="mb-8 grid grid-cols-3 gap-3">
          {quickActions.map(({ label, sub, icon: Icon, onClick, accent }) => (
            <button
              key={label}
              onClick={onClick}
              className="flex flex-col items-center gap-2 rounded-[20px] border border-white/10 bg-[#1c1c1c] py-5 shadow-md shadow-black/30 transition-all hover:border-white/25 active:scale-[0.97]"
            >
              <Icon size={24} className={accent} />
              <span className="text-sm font-bold text-white">{label}</span>
              <span className="text-[10px] uppercase tracking-wider text-white/35">{sub}</span>
            </button>
          ))}
        </div>

        {/* RECENT PROJECTS — horizontal scroll */}
        {recentProjects.length > 0 && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold text-white">Recent Projects</h2>
              <button
                onClick={onNavigateToProjects}
                className="flex items-center gap-1 text-xs font-semibold text-white/50 hover:text-white"
              >
                View all <ArrowRight size={13} />
              </button>
            </div>

            <div className="no-scrollbar -mx-5 flex gap-4 overflow-x-auto px-5 pb-2">
              {recentProjects.map((p) => (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenProject(p)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onOpenProject(p);
                    }
                  }}
                  className="group relative w-40 shrink-0 overflow-hidden rounded-[20px] border border-white/10 bg-[#1c1c1c] text-left shadow-md shadow-black/30 transition-all hover:border-white/25 active:scale-[0.98] cursor-pointer"
                >
                  <div className="h-40 w-full overflow-hidden bg-[#121212]">
                    <img
                      src={getProjectCover(p)}
                      alt={p.name}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  </div>
                  {onToggleFavorite && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(p);
                      }}
                      aria-label={p.isFavorite ? `Remove ${p.name} from favorites` : `Add ${p.name} to favorites`}
                      className={`absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 backdrop-blur transition-colors ${
                        p.isFavorite ? 'text-amber-400' : 'text-white/50 hover:text-white'
                      }`}
                    >
                      <Star size={14} className={p.isFavorite ? 'fill-amber-400' : ''} />
                    </button>
                  )}
                  <div className="p-3">
                    <h4 className="truncate text-sm font-bold text-white">{p.name}</h4>
                    <span className="text-[10px] text-white/40">{formatDate(p.lastOpenedAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* IMPORT FLOW MODAL */}
      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center">
          <div className="animate-fade-in w-full max-w-lg rounded-t-[28px] border border-white/10 bg-[#161616] p-5 shadow-2xl sm:rounded-[28px]">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-black text-white">
                <ImagePlus size={20} className="text-rose-400" /> Create Project
              </h3>
              <button
                onClick={() => setImportOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            <ImportDialog
              onImageImported={onImageImported}
              categories={categories}
              onAddCategory={onAddCategory}
            />
          </div>
        </div>
      )}
    </div>
  );
};
