import React, { useMemo } from 'react';
import { Project, AppStats } from '../types';
import { getProjectCover } from '../lib/projectCover';
import {
  BarChart3,
  FolderPlus,
  CheckCircle2,
  Clock,
  Tag,
  Star,
  Rocket,
  ImageDown,
} from 'lucide-react';

interface StatisticsViewProps {
  projects: Project[];
  stats: AppStats;
}

const formatDuration = (ms: number): string => {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  const seconds = Math.floor(ms / 1000);
  return `${seconds}s`;
};

const formatDate = (ts: number) =>
  new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export const StatisticsView: React.FC<StatisticsViewProps> = ({ projects, stats }) => {
  const derived = useMemo(() => {
    const completed = projects.filter((p) => p.isLocked).length;

    const categoryCounts = new Map<string, number>();
    for (const p of projects) {
      if (!p.category) continue;
      categoryCounts.set(p.category, (categoryCounts.get(p.category) ?? 0) + 1);
    }
    let favoriteCategory = '—';
    let topCount = 0;
    for (const [cat, count] of categoryCounts) {
      if (count > topCount) {
        topCount = count;
        favoriteCategory = cat;
      }
    }

    const mostRecent = projects.length
      ? [...projects].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)[0]
      : null;

    return { completed, favoriteCategory, topCount, mostRecent };
  }, [projects]);

  const cards = [
    {
      label: 'Projects Created',
      value: String(projects.length),
      icon: FolderPlus,
      accent: 'text-sky-400',
      ring: 'from-sky-500/20',
    },
    {
      label: 'Projects Completed',
      value: String(derived.completed),
      sub: 'Locked references',
      icon: CheckCircle2,
      accent: 'text-emerald-400',
      ring: 'from-emerald-500/20',
    },
    {
      label: 'Total Tracing Time',
      value: formatDuration(stats.totalTracingTimeMs),
      icon: Clock,
      accent: 'text-amber-400',
      ring: 'from-amber-500/20',
    },
    {
      label: 'Favorite Category',
      value: derived.favoriteCategory,
      sub: derived.topCount > 0 ? `${derived.topCount} projects` : 'No categories yet',
      icon: Tag,
      accent: 'text-rose-400',
      ring: 'from-rose-500/20',
    },
    {
      label: 'App Opened',
      value: `${stats.appOpens}×`,
      icon: Rocket,
      accent: 'text-violet-400',
      ring: 'from-violet-500/20',
    },
    {
      label: 'Images Imported',
      value: String(stats.imagesImported),
      icon: ImageDown,
      accent: 'text-cyan-400',
      ring: 'from-cyan-500/20',
    },
  ];

  return (
    <div className="min-h-screen bg-[#121212] pb-[calc(7rem+env(safe-area-inset-bottom))] text-white select-none">
      <div className="max-w-3xl mx-auto px-5 pt-[calc(2.5rem+env(safe-area-inset-top))]">
        {/* HEADER */}
        <header className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-[16px] bg-white/5 border border-white/10 text-rose-400">
            <BarChart3 size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white">Statistics</h1>
            <p className="text-xs text-white/40">Your lifetime tracing activity</p>
          </div>
        </header>

        {/* STAT CARDS GRID */}
        <div className="grid grid-cols-2 gap-4">
          {cards.map(({ label, value, sub, icon: Icon, accent, ring }) => (
            <div
              key={label}
              className={`relative overflow-hidden rounded-[22px] border border-white/10 bg-gradient-to-br ${ring} via-[#1c1c1c] to-[#1c1c1c] p-5 shadow-lg shadow-black/40`}
            >
              <Icon size={22} className={`${accent} mb-4`} />
              <div className="text-2xl font-black text-white leading-none">{value}</div>
              <div className="mt-1.5 text-xs font-semibold text-white/60">{label}</div>
              {sub && <div className="text-[10px] uppercase tracking-wider text-white/30 mt-0.5">{sub}</div>}
            </div>
          ))}
        </div>

        {/* MOST RECENT PROJECT */}
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-bold text-white">Most Recently Opened</h2>
          {derived.mostRecent ? (
            <div className="flex items-center gap-4 rounded-[22px] border border-white/10 bg-[#1c1c1c] p-4 shadow-lg shadow-black/40">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[16px] bg-[#121212]">
                <img
                  src={getProjectCover(derived.mostRecent)}
                  alt={derived.mostRecent.name}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base font-bold text-white">{derived.mostRecent.name}</h3>
                <p className="text-xs text-white/40">Opened {formatDate(derived.mostRecent.lastOpenedAt)}</p>
              </div>
              {derived.mostRecent.isFavorite && (
                <Star size={18} className="shrink-0 fill-amber-400 text-amber-400" />
              )}
            </div>
          ) : (
            <div className="rounded-[22px] border border-white/10 bg-[#1c1c1c] p-6 text-center text-sm text-white/40">
              No projects yet. Import an image to get started.
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
