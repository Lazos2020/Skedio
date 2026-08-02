import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Project, CollectionFolder, ActiveTab, AppStats, defaultAdjustments, defaultTransform, defaultOverlays, defaultAppStats } from './types';
import {
  getAllProjects,
  getAllFolders,
  getProjectById,
  saveProject,
  deleteProject,
  clearAllProjects,
  saveFolder,
  deleteFolder,
  getAppStats,
  bumpAppStats,
  clearDemoDataOnce,
  getCategories,
  addCategory as addCategoryDb,
  deleteCategory as deleteCategoryDb,
  getPinnedCategories,
  togglePinnedCategory as togglePinnedCategoryDb,
  getBackupMeta,
} from './lib/db';
import { generateThumbnail } from './lib/imageProcessor';
import { orderCategories } from './lib/categories';
import {
  createBackup,
  downloadBackup,
  SKEDIO_APP_VERSION,
  SKEDIO_DATA_VERSION,
} from './lib/backup';
import {
  getRecoverableSession,
  endSession,
  saveSession,
  discardSession,
  TraceSession,
} from './lib/session';
import { ThemeProvider } from './ThemeContext';
import { BottomNav } from './components/BottomNav';
import { HomeView } from './components/HomeView';
import { ProjectsView } from './components/ProjectsView';
import { StatisticsView } from './components/StatisticsView';
import { SettingsView } from './components/SettingsView';
import { TracingStudio } from './components/TracingStudio';
import { TraceMode } from './components/TraceMode';
import { SplashScreen } from './components/SplashScreen';
import { Loader2, RefreshCw, X } from 'lucide-react';
import { useSplashScreen } from './hooks/useSplashScreen';
import { registerServiceWorker, applyUpdate } from './lib/serviceWorker';

// Guards the "app opened" counter so it increments once per page load even if
// React StrictMode double-invokes effects in development.
let appOpenCounted = false;

function AppInner() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [projects, setProjects] = useState<Project[]>([]);
  const [folders, setFolders] = useState<CollectionFolder[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [stats, setStats] = useState<AppStats>(defaultAppStats);
  const [categories, setCategories] = useState<string[]>([]);
  const [pinnedCategories, setPinnedCategories] = useState<string[]>([]);

  // Crash recovery + auto backup reminder.
  const [recoverySession, setRecoverySession] = useState<TraceSession | null>(null);
  const [sessionRestoreNotice, setSessionRestoreNotice] = useState<string | null>(null);
  const [showBackupReminder, setShowBackupReminder] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    registerServiceWorker(() => setUpdateAvailable(true));
  }, []);
  const [isCreatingReminderBackup, setIsCreatingReminderBackup] = useState(false);
  const recoveryCheckedRef = useRef(false);
  const backupReminderCheckedRef = useRef(false);
  const sessionWasActiveRef = useRef(false);

  // Categories with pinned favorites first — used by every category list.
  const orderedCategories = orderCategories(categories, pinnedCategories);

  // Splash screen stays up for a minimum of 5s AND until initial data has
  // loaded, then crossfades into whichever screen is underneath (Home,
  // by definition, since the studio/trace mode can't be entered before the
  // user has interacted with the app). See useSplashScreen for the state
  // machine details.
  const splashPhase = useSplashScreen(!isLoading);

  // Active studio or trace mode state
  const [activeStudioProject, setActiveStudioProject] = useState<Project | null>(null);
  const [traceModeState, setTraceModeState] = useState<{ project: Project; processedUrl: string } | null>(null);

  // State refs for Capacitor Back Button closure access
  const traceModeStateRef = useRef(traceModeState);
  const activeStudioProjectRef = useRef(activeStudioProject);
  const activeTabRef = useRef(activeTab);
  const traceStartRef = useRef<number | null>(null);

  useEffect(() => {
    traceModeStateRef.current = traceModeState;
  }, [traceModeState]);

  useEffect(() => {
    activeStudioProjectRef.current = activeStudioProject;
  }, [activeStudioProject]);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  // Load data from IndexedDB
  const [dbLoadError, setDbLoadError] = useState(false);
  const refreshData = useCallback(async () => {
    try {
      // One-time removal of any legacy seeded demo data (never touches user data).
      await clearDemoDataOnce();
      const [pList, fList, cList, pinList] = await Promise.all([
        getAllProjects(),
        getAllFolders(),
        getCategories(),
        getPinnedCategories(),
      ]);
      setProjects(pList);
      setFolders(fList);
      setCategories(cList);
      setPinnedCategories(pinList);
      setDbLoadError(false);
    } catch (err) {
      console.error('Failed to load database:', err);
      setDbLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Crash recovery: check ONCE on startup, before the session tracker below can
  // clear anything. A recoverable session only exists if the app was closed
  // unexpectedly (the previous session was never cleanly ended).
  useEffect(() => {
    if (recoveryCheckedRef.current) return;
    recoveryCheckedRef.current = true;
    const s = getRecoverableSession();
    if (s) setRecoverySession(s);
  }, []);

  // Persist a lightweight pointer to the active tracing session so it can be
  // recovered after an unexpected close. On a clean exit (both views closed
  // after having been open) the pointer is removed. Deliberately does NOT
  // carry image data — see lib/session.ts for why.
  useEffect(() => {
    const active = traceModeState?.project ?? activeStudioProject;
    if (active) {
      sessionWasActiveRef.current = true;
      saveSession(active.id, active.name);
    } else if (sessionWasActiveRef.current) {
      sessionWasActiveRef.current = false;
      endSession();
    }
  }, [activeStudioProject, traceModeState]);

  // Auto backup reminder: if there are projects and no backup in the last 30
  // days (respecting a snooze), prompt the user once per launch.
  useEffect(() => {
    if (isLoading || backupReminderCheckedRef.current) return;
    if (projects.length === 0) return;
    backupReminderCheckedRef.current = true;
    (async () => {
      try {
        const meta = await getBackupMeta();
        const snoozeUntil = Number(localStorage.getItem('skedio-backup-snooze') || 0);
        if (Date.now() < snoozeUntil) return;
        const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
        const last = meta?.lastBackupAt ?? 0;
        if (Date.now() - last > THIRTY_DAYS) setShowBackupReminder(true);
      } catch {
        /* ignore */
      }
    })();
  }, [isLoading, projects.length]);

  const handleRestoreSession = async () => {
    if (recoverySession) {
      // Re-fetch the current record from IndexedDB rather than trusting the
      // snapshot — the snapshot is only a pointer (id + name), and the real
      // project data (including any edits already autosaved) always lives
      // in IndexedDB.
      const fresh = await getProjectById(recoverySession.projectId);
      if (fresh) {
        setActiveStudioProject(fresh);
      } else {
        // Project was deleted (or never finished saving) since the crash —
        // nothing to restore. Surface a brief, non-blocking notice instead
        // of silently doing nothing.
        setSessionRestoreNotice('That project could no longer be found — it may have been deleted.');
      }
    }
    setRecoverySession(null);
  };

  const handleDiscardSession = () => {
    discardSession();
    setRecoverySession(null);
  };

  useEffect(() => {
    if (!sessionRestoreNotice) return;
    const t = window.setTimeout(() => setSessionRestoreNotice(null), 4000);
    return () => window.clearTimeout(t);
  }, [sessionRestoreNotice]);

  const handleReminderCreateBackup = async () => {
    setIsCreatingReminderBackup(true);
    try {
      const result = await createBackup();
      downloadBackup(result.json);
      // Just backed up — snooze the reminder well beyond the 30-day window.
      localStorage.setItem('skedio-backup-snooze', String(Date.now() + 30 * 24 * 60 * 60 * 1000));
    } catch {
      /* ignore */
    } finally {
      setIsCreatingReminderBackup(false);
      setShowBackupReminder(false);
    }
  };

  const handleReminderLater = () => {
    // Snooze for 3 days so we don't nag on every launch.
    localStorage.setItem('skedio-backup-snooze', String(Date.now() + 3 * 24 * 60 * 60 * 1000));
    setShowBackupReminder(false);
  };

  // Load persisted usage stats once and count this app open.
  useEffect(() => {
    getAppStats().then(setStats).catch(() => {});
    if (!appOpenCounted) {
      appOpenCounted = true;
      bumpAppStats({ appOpens: 1 }).then(setStats).catch(() => {});
    }
  }, []);

  // Accumulate total tracing time across every trace-mode session, regardless
  // of how the session ends (exit button, back navigation, or power/wake).
  useEffect(() => {
    if (traceModeState) {
      traceStartRef.current = Date.now();
    } else if (traceStartRef.current) {
      const elapsed = Date.now() - traceStartRef.current;
      traceStartRef.current = null;
      if (elapsed > 0) {
        bumpAppStats({ totalTracingTimeMs: elapsed }).then(setStats).catch(() => {});
      }
    }
  }, [traceModeState]);

  // Browser back navigation: intercept in-app views (trace mode, studio,
  // non-home tabs) using the History API so the hardware/browser Back
  // button steps back through the app instead of leaving it.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = () => {
      if (traceModeStateRef.current) {
        setTraceModeState(null);
        window.history.pushState(null, '', window.location.href);
      } else if (activeStudioProjectRef.current) {
        setActiveStudioProject(null);
        refreshData();
        window.history.pushState(null, '', window.location.href);
      } else if (activeTabRef.current !== 'home') {
        setActiveTab('home');
        window.history.pushState(null, '', window.location.href);
      }
    };
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [refreshData]);

  // Handle new image import
  const handleImageImported = async (dataUrl: string, fileName: string, category?: string) => {
    setIsLoading(true);
    const now = Date.now();
    const id = `proj-${now}-${Math.random().toString(36).substring(2, 7)}`;
    const thumbnail = await generateThumbnail(dataUrl, defaultAdjustments);

    const newProject: Project = {
      id,
      name: fileName || 'Untitled Artwork',
      folderId: null,
      category,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
      imageDataUrl: dataUrl,
      thumbnailDataUrl: thumbnail,
      adjustments: { ...defaultAdjustments },
      transform: { ...defaultTransform },
      isLocked: false,
      overlays: { ...defaultOverlays },
    };

    await saveProject(newProject);
    await refreshData();
    await bumpAppStats({ imagesImported: 1 }).then(setStats).catch(() => {});
    setIsLoading(false);

    // Open directly in Tracing Studio
    setActiveStudioProject(newProject);
  };

  const handleOpenProject = async (project: Project) => {
    const updated = { ...project, lastOpenedAt: Date.now() };
    await saveProject(updated);
    await refreshData();
    setActiveStudioProject(updated);
  };

  const handleDeleteProject = async (id: string) => {
    await deleteProject(id);
    await refreshData();
  };

  const handleRenameProject = async (id: string, newName: string) => {
    const target = projects.find((p) => p.id === id);
    if (target) {
      await saveProject({ ...target, name: newName });
      await refreshData();
    }
  };

  const handleToggleFavorite = async (project: Project) => {
    await saveProject({ ...project, isFavorite: !project.isFavorite });
    await refreshData();
  };

  // Replace all tags on a project. Empty array clears them.
  const handleUpdateTags = async (project: Project, tags: string[]) => {
    await saveProject({ ...project, tags });
    await refreshData();
  };

  const handleUpdateNotes = async (project: Project, notes: string) => {
    await saveProject({ ...project, notes });
    await refreshData();
  };

  // Deep-clone a project under a new id, preserving folder, category,
  // cover, tags, notes, adjustments, transform and overlay state.
  const handleDuplicateProject = async (project: Project) => {
    const now = Date.now();
    const copy: Project = {
      ...project,
      id: `proj-${now}-${Math.random().toString(36).substring(2, 7)}`,
      name: `${project.name} (Copy)`,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
    };
    await saveProject(copy);
    await refreshData();
  };

  // Export a single project as a .skedio file (a normal backup with only
  // this project in it) — round-trips cleanly through the restore flow.
  const handleExportProject = (project: Project) => {
    const file = {
      format: 'skedio-backup' as const,
      appVersion: SKEDIO_APP_VERSION,
      dataVersion: SKEDIO_DATA_VERSION,
      createdAt: Date.now(),
      data: {
        projects: [project],
        folders: [],
        categories: [],
        pinnedCategories: [],
        stats: { appOpens: 0, imagesImported: 0, totalTracingTimeMs: 0 },
        preferences: {},
      },
    };
    const json = JSON.stringify(file);
    const blob = new Blob([json], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safe = project.name.replace(/[^a-z0-9-_\s]/gi, '').trim().replace(/\s+/g, '-') || 'project';
    a.href = url;
    a.download = `skedio-${safe}.skedio`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Custom cover: pass a data URL to set it, or null to fall back to the
  // auto-generated thumbnail.
  const handleChangeCover = async (project: Project, coverDataUrl: string | null) => {
    await saveProject({ ...project, coverDataUrl: coverDataUrl ?? undefined });
    await refreshData();
  };

  const handleChangeCategory = async (project: Project, category: string) => {
    await saveProject({ ...project, category });
    await refreshData();
  };

  const handleAddCategory = async (name: string) => {
    const next = await addCategoryDb(name);
    setCategories(next);
  };

  const handleDeleteCategory = async (name: string) => {
    const next = await deleteCategoryDb(name);
    setCategories(next);
  };

  const handleTogglePinCategory = async (name: string) => {
    const next = await togglePinnedCategoryDb(name);
    setPinnedCategories(next);
  };

  // A restore replaces the whole database and may change the saved theme, so
  // a full reload is the simplest way to guarantee every view (and the theme)
  // reflects the imported data cleanly.
  const handleDataRestored = () => {
    if (typeof window !== 'undefined') window.location.reload();
  };

  const handleMoveProjectToFolder = async (projectId: string, folderId: string | null) => {
    const target = projects.find((p) => p.id === projectId);
    if (target) {
      await saveProject({ ...target, folderId });
      await refreshData();
    }
  };

  const handleCreateFolder = async (name: string, coverImage: string | null) => {
    const newFolder: CollectionFolder = {
      id: `folder-${Date.now()}`,
      name,
      coverImage,
      createdAt: Date.now(),
    };
    await saveFolder(newFolder);
    await refreshData();
  };

  const handleRenameFolder = async (id: string, newName: string) => {
    const target = folders.find((f) => f.id === id);
    if (target) {
      await saveFolder({ ...target, name: newName });
      await refreshData();
    }
  };

  const handleDeleteFolder = async (id: string) => {
    await deleteFolder(id);
    await refreshData();
  };

  const handleClearAllProjects = async () => {
    setIsLoading(true);
    await clearAllProjects();
    setProjects([]);
    setIsLoading(false);
  };

  // The main app tree is always mounted (even while the splash screen is
  // covering it) so that Home's data and images are fully preloaded and
  // ready the instant the splash fades out. The splash overlay itself is
  // rendered last, on top, and simply crossfades away — see useSplashScreen.
  return (
    <>
      {traceModeState ? (
        // FULLSCREEN TRACE MODE
        <TraceMode
          project={traceModeState.project}
          processedImageUrl={traceModeState.processedUrl}
          onExitTraceMode={() => setTraceModeState(null)}
        />
      ) : activeStudioProject ? (
        // TRACING STUDIO WORKSPACE
        <TracingStudio
          key={activeStudioProject.id}
          project={activeStudioProject}
          onClose={() => {
            setActiveStudioProject(null);
            refreshData();
          }}
          onEnterTraceMode={(project, processedUrl) => {
            setActiveStudioProject(project);
            setTraceModeState({ project, processedUrl });
          }}
        />
      ) : isLoading ? (
        // LOADING STATE (initial load, or a later in-app operation such as
        // import/reset that briefly sets isLoading again)
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#121212] text-white">
          <Loader2 size={40} className="animate-spin text-amber-400 mb-4" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-white/70">
            Loading Skedio Engine...
          </h2>
        </div>
      ) : (
        <div className="min-h-screen bg-[#121212] text-white font-sans selection:bg-rose-600 selection:text-white">
          {/* MAIN VIEW AREA */}
          <main className="w-full">
            {activeTab === 'home' && (
              <HomeView
                recentProjects={projects}
                folders={folders}
                onOpenProject={handleOpenProject}
                onNavigateToProjects={() => setActiveTab('projects')}
                onNavigateToSettings={() => setActiveTab('settings')}
                onImageImported={handleImageImported}
                onToggleFavorite={handleToggleFavorite}
                categories={orderedCategories}
                onAddCategory={handleAddCategory}
              />
            )}

            {activeTab === 'projects' && (
              <ProjectsView
                projects={projects}
                folders={folders}
                onOpenProject={handleOpenProject}
                onDeleteProject={handleDeleteProject}
                onRenameProject={handleRenameProject}
                onMoveProjectToFolder={handleMoveProjectToFolder}
                onCreateFolder={handleCreateFolder}
                onRenameFolder={handleRenameFolder}
                onDeleteFolder={handleDeleteFolder}
                onToggleFavorite={handleToggleFavorite}
                onChangeCategory={handleChangeCategory}
                onChangeCover={handleChangeCover}
                onUpdateTags={handleUpdateTags}
                onUpdateNotes={handleUpdateNotes}
                onDuplicateProject={handleDuplicateProject}
                onExportProject={handleExportProject}
                categories={orderedCategories}
                pinnedCategories={pinnedCategories}
                onNewImport={() => {
                  // Switch to home or trigger input
                  setActiveTab('home');
                }}
              />
            )}

            {activeTab === 'statistics' && (
              <StatisticsView projects={projects} stats={stats} />
            )}

            {activeTab === 'settings' && (
              <SettingsView
                onClearAllProjects={handleClearAllProjects}
                categories={orderedCategories}
                pinnedCategories={pinnedCategories}
                onAddCategory={handleAddCategory}
                onDeleteCategory={handleDeleteCategory}
                onTogglePinCategory={handleTogglePinCategory}
                onDataRestored={handleDataRestored}
              />
            )}
          </main>

          {/* ANDROID BOTTOM NAVIGATION BAR */}
          <BottomNav
            activeTab={activeTab}
            onTabChange={setActiveTab}
            projectCount={projects.length}
          />
        </div>
      )}

      {/* SPLASH OVERLAY — stays mounted on top (visible, then fading) until
          the app underneath is both minimum-duration-elapsed and data-ready,
          then unmounts entirely. */}
      {splashPhase !== 'done' && <SplashScreen fadingOut={splashPhase === 'fading'} />}

      {/* CRASH RECOVERY DIALOG */}
      {recoverySession && splashPhase === 'done' && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[#181818] border border-white/20 p-6 shadow-2xl animate-fade-in text-white">
            <h3 className="text-lg font-bold text-amber-400 mb-2">Restore Previous Session?</h3>
            <p className="text-sm text-white/70 mb-2">
              Skedio appears to have closed unexpectedly. Would you like to restore your previous tracing session?
            </p>
            <div className="bg-[#121212] border border-white/10 p-3 text-xs text-white/60 mb-6">
              <span className="text-white/40 uppercase block text-[10px] mb-1 font-bold">Project</span>
              <span className="text-sm font-bold text-white break-words">{recoverySession.projectName}</span>
              <p className="mt-2 text-[11px] text-white/40">
                Restores your current project, zoom, rotation, position, tracing settings, and notes.
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={handleDiscardSession}
                className="px-4 py-2 bg-[#262626] border border-white/20 text-white text-xs font-bold uppercase tracking-wider hover:bg-[#333]"
              >
                Discard
              </button>
              <button
                onClick={handleRestoreSession}
                className="px-4 py-2 bg-amber-500 text-black text-xs font-bold uppercase tracking-wider hover:bg-amber-400 shadow"
              >
                Restore
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DATABASE LOAD ERROR — distinguishable from "no projects yet" */}
      {dbLoadError && splashPhase === 'done' && (
        <div className="fixed inset-x-0 top-[calc(1rem+env(safe-area-inset-top))] z-[68] flex justify-center px-4">
          <div className="flex items-center gap-3 bg-[#181818] border border-rose-500/50 text-rose-200 text-xs font-semibold px-4 py-3 shadow-2xl max-w-md">
            <span>
              Your project library couldn't be loaded from device storage. Your projects are likely still
              safe — this may be temporary.
            </span>
            <button
              onClick={() => refreshData()}
              className="shrink-0 bg-white text-black px-3 py-1.5 font-bold uppercase tracking-wide text-[10px] hover:bg-white/90"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* SERVICE WORKER UPDATE AVAILABLE — never shown mid-session */}
      {updateAvailable && !activeStudioProject && !traceModeState && splashPhase === 'done' && (
        <div className="fixed inset-x-0 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-[68] flex justify-center px-4">
          <div className="flex items-center gap-3 bg-[#181818] border border-white/20 text-white text-xs font-semibold px-4 py-3 shadow-2xl animate-fade-in">
            <RefreshCw size={14} className="text-amber-400 shrink-0" />
            <span>A new version of Skedio is ready.</span>
            <button
              onClick={() => {
                setUpdateAvailable(false);
                applyUpdate();
              }}
              className="bg-white text-black px-3 py-1.5 font-bold uppercase tracking-wide text-[10px] hover:bg-white/90"
            >
              Update
            </button>
            <button
              onClick={() => setUpdateAvailable(false)}
              className="text-white/40 hover:text-white px-1"
              aria-label="Dismiss update notice"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* SESSION RESTORE NOTICE (e.g. project no longer exists) */}
      {sessionRestoreNotice && splashPhase === 'done' && (
        <div className="fixed inset-x-0 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-[68] flex justify-center px-4 pointer-events-none">
          <div className="bg-[#181818] border border-amber-500/40 text-amber-200 text-xs font-semibold px-4 py-2.5 shadow-2xl animate-fade-in">
            {sessionRestoreNotice}
          </div>
        </div>
      )}

      {/* AUTO BACKUP REMINDER */}
      {showBackupReminder && !recoverySession && splashPhase === 'done' && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[#181818] border border-white/20 p-6 shadow-2xl animate-fade-in text-white">
            <h3 className="text-lg font-bold text-cyan-400 mb-2">Backup Reminder</h3>
            <p className="text-sm text-white/70 mb-6">
              You haven't backed up your projects recently. Create a backup to keep your artwork safe.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={handleReminderLater}
                className="px-4 py-2 bg-[#262626] border border-white/20 text-white text-xs font-bold uppercase tracking-wider hover:bg-[#333]"
              >
                Later
              </button>
              <button
                onClick={handleReminderCreateBackup}
                disabled={isCreatingReminderBackup}
                className="px-4 py-2 bg-cyan-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-cyan-500 shadow disabled:opacity-60"
              >
                {isCreatingReminderBackup ? 'Creating…' : 'Create Backup'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}
