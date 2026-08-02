import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Project, CollectionFolder } from '../types';
import { getProjectCover, processCoverImage } from '../lib/projectCover';
import { DragScroll } from './DragScroll';
import { allTagsFromProjects, normalizeTag, tagsEqual } from '../lib/tags';
import {
  Search,
  FolderPlus,
  Folder,
  Image as ImageIcon,
  MoreVertical,
  Trash2,
  Edit2,
  Calendar,
  Lock,
  Plus,
  Check,
  X,
  AlertTriangle,
  FolderOpen,
  Star,
  Tag,
  ImagePlus,
  Pin,
  Copy,
  Upload,
  Tags,
  NotebookPen,
} from 'lucide-react';

// Module-level (not recreated per render) so it can be passed to the
// memoized ProjectCard without defeating React.memo's shallow prop check.
const formatProjectDate = (ts: number) => {
  const d = new Date(ts);
  const now = new Date();
  const diffHours = (now.getTime() - d.getTime()) / (3600 * 1000);
  if (diffHours < 24) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
};

interface ProjectsViewProps {
  projects: Project[];
  folders: CollectionFolder[];
  onOpenProject: (project: Project) => void;
  onDeleteProject: (id: string) => void;
  onRenameProject: (id: string, newName: string) => void;
  onMoveProjectToFolder: (projectId: string, folderId: string | null) => void;
  onCreateFolder: (name: string, cover: string | null) => void;
  onRenameFolder: (id: string, newName: string) => void;
  onDeleteFolder: (id: string) => void;
  onNewImport: () => void;
  onToggleFavorite?: (project: Project) => void;
  onChangeCategory?: (project: Project, category: string) => void;
  onChangeCover?: (project: Project, coverDataUrl: string | null) => void;
  onUpdateTags?: (project: Project, tags: string[]) => void;
  onUpdateNotes?: (project: Project, notes: string) => void;
  onDuplicateProject?: (project: Project) => void;
  onExportProject?: (project: Project) => void;
  categories?: string[];
  pinnedCategories?: string[];
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({
  projects,
  folders,
  onOpenProject,
  onDeleteProject,
  onRenameProject,
  onMoveProjectToFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onNewImport,
  onToggleFavorite,
  onChangeCategory,
  onChangeCover,
  onUpdateTags,
  onUpdateNotes,
  onDuplicateProject,
  onExportProject,
  categories = [],
  pinnedCategories = [],
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFolderId, setActiveFolderId] = useState<string | 'all' | 'favorites' | 'unorganized'>('all');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [selectedTagFilters, setSelectedTagFilters] = useState<string[]>([]);

  // Modals state
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [projectToRename, setProjectToRename] = useState<Project | null>(null);
  const [projectToChangeCategory, setProjectToChangeCategory] = useState<Project | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [activeMenuProjectId, setActiveMenuProjectId] = useState<string | null>(null);

  // Folder modals state
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderToRename, setFolderToRename] = useState<CollectionFolder | null>(null);
  const [folderRenameValue, setFolderRenameValue] = useState('');
  const [folderToDelete, setFolderToDelete] = useState<CollectionFolder | null>(null);

  // Cover editing state
  const [projectToChangeCover, setProjectToChangeCover] = useState<Project | null>(null);
  const coverFileInputRef = useRef<HTMLInputElement>(null);

  // Tag editor state
  const [projectToEditTags, setProjectToEditTags] = useState<Project | null>(null);
  const [projectToEditNotes, setProjectToEditNotes] = useState<Project | null>(null);

  const handleCoverFileSelected = (file: File) => {
    if (!projectToChangeCover || !onChangeCover) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      const processed = await processCoverImage(dataUrl);
      onChangeCover(projectToChangeCover, processed);
      setProjectToChangeCover(null);
    };
    reader.readAsDataURL(file);
  };

  const allTags = useMemo(() => allTagsFromProjects(projects), [projects]);

  const toggleTagFilter = useCallback((tag: string) => {
    setSelectedTagFilters((prev) =>
      prev.some((t) => tagsEqual(t, tag)) ? prev.filter((t) => !tagsEqual(t, tag)) : [...prev, tag]
    );
  }, []);

  const closeMenu = useCallback(() => setActiveMenuProjectId(null), []);

  // Long-press support: pointerdown starts a timer; if the pointer moves
  // (scroll) or lifts before it fires, no menu is opened. Right-click uses
  // onContextMenu directly.
  const longPressTimer = useRef<number | null>(null);
  const longPressFired = useRef(false);
  const startLongPress = useCallback((projectId: string) => {
    longPressFired.current = false;
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = window.setTimeout(() => {
      longPressFired.current = true;
      setActiveMenuProjectId(projectId);
      // Haptic feedback where supported.
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try { navigator.vibrate?.(15); } catch { /* ignore */ }
      }
    }, 500);
  }, []);
  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);
  useEffect(() => () => cancelLongPress(), [cancelLongPress]);

  const toggleMenu = useCallback((id: string) => {
    setActiveMenuProjectId((prev) => (prev === id ? null : id));
  }, []);

  const consumeLongPressFlag = useCallback(() => {
    const fired = longPressFired.current;
    longPressFired.current = false;
    return fired;
  }, []);

  const requestEditTags = useCallback((p: Project) => {
    setActiveMenuProjectId(null);
    setProjectToEditTags(p);
  }, []);

  const requestEditNotes = useCallback((p: Project) => {
    setActiveMenuProjectId(null);
    setProjectToEditNotes(p);
  }, []);

  const requestRename = useCallback((p: Project) => {
    setActiveMenuProjectId(null);
    setProjectToRename(p);
    setRenameValue(p.name);
  }, []);

  const requestChangeCover = useCallback((p: Project) => {
    setActiveMenuProjectId(null);
    setProjectToChangeCover(p);
  }, []);

  const requestDelete = useCallback((p: Project) => {
    setActiveMenuProjectId(null);
    setProjectToDelete(p);
  }, []);

  // Filter projects by search query, active folder/favorites tab, category and tag filters.
  const filteredProjects = useMemo(() => {
    const query = searchQuery.trim().replace(/\s+/g, ' ').toLowerCase();
    const list = projects.filter((p) => {
      // Search matches on project name OR category, so typing a category
      // name (e.g. "Manga") surfaces matching projects even without using
      // the category filter pills below.
      const matchesSearch =
        query.length === 0 ||
        p.name.toLowerCase().includes(query) ||
        (p.category ?? '').toLowerCase().includes(query);
      if (!matchesSearch) return false;

      if (selectedCategoryFilter !== 'all' && p.category !== selectedCategoryFilter) {
        return false;
      }

      if (selectedTagFilters.length > 0) {
        const tags = p.tags ?? [];
        const allMatch = selectedTagFilters.every((sel) =>
          tags.some((t) => tagsEqual(t, sel))
        );
        if (!allMatch) return false;
      }

      if (activeFolderId === 'all') return true;
      if (activeFolderId === 'favorites') return p.isFavorite === true;
      if (activeFolderId === 'unorganized') return p.folderId === null;
      return p.folderId === activeFolderId;
    });

    // In favorites mode, favorites always sort first (they're the only ones
    // shown), but we still keep last-opened order stable.
    if (activeFolderId === 'favorites') {
      return [...list].sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0));
    }
    return list;
  }, [projects, searchQuery, activeFolderId, selectedCategoryFilter, selectedTagFilters]);

  const formatDate = formatProjectDate;

  return (
    <div className="min-h-screen bg-[#121212] pb-[calc(7rem+env(safe-area-inset-bottom))] text-white select-none">
      <div className="max-w-5xl mx-auto px-4 pt-[calc(1.5rem+env(safe-area-inset-top))]">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white uppercase">Saved Projects</h1>
            <p className="text-xs text-white/50 mt-0.5">
              Sorted by Last Opened • Unlimited offline storage
            </p>
          </div>
          <button
            onClick={onNewImport}
            className="flex items-center justify-center gap-2 bg-white text-black font-extrabold text-xs uppercase tracking-wider px-4 py-3 hover:bg-white/90 shadow-lg transition-all"
          >
            <Plus size={16} /> Import New Artwork
          </button>
        </div>

        {/* INSTANT SEARCH BAR */}
        <div className="relative mb-6">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            type="text"
            placeholder="Search by name or category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#181818] border border-white/15 pl-10 pr-4 py-3 text-sm text-white placeholder-white/40 focus:outline-none focus:border-white transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center text-white/50 hover:text-white"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* COLLECTIONS / FOLDERS TABS */}
        <DragScroll fade="page" className="pb-3 mb-4 border-b border-white/10">
          <div className="flex items-center gap-2 w-max">
          <button
            onClick={() => setActiveFolderId('all')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider shrink-0 transition-colors ${
              activeFolderId === 'all'
                ? 'bg-white text-black font-extrabold shadow'
                : 'bg-[#181818] border border-white/10 text-white/70 hover:text-white'
            }`}
          >
            <FolderOpen size={14} /> All Projects ({projects.length})
          </button>

          <button
            onClick={() => setActiveFolderId('favorites')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider shrink-0 transition-colors ${
              activeFolderId === 'favorites'
                ? 'bg-amber-500 text-black font-extrabold shadow'
                : 'bg-[#181818] border border-white/10 text-amber-400 hover:text-amber-300'
            }`}
          >
            <Star size={14} className="fill-current" /> Favorites ({projects.filter(p => p.isFavorite).length})
          </button>

          {folders.map((f) => {
            const count = projects.filter((p) => p.folderId === f.id).length;
            const isActive = activeFolderId === f.id;
            return (
              <div key={f.id} className="group relative shrink-0 flex items-center">
                <button
                  onClick={() => setActiveFolderId(f.id)}
                  className={`flex items-center gap-2 pl-3.5 pr-8 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                    isActive
                      ? 'bg-rose-600 text-white font-extrabold shadow'
                      : 'bg-[#181818] border border-white/10 text-white/70 hover:text-white'
                  }`}
                >
                  <Folder size={14} className={isActive ? 'text-white' : 'text-rose-400'} />
                  <span>{f.name}</span>
                  <span className="text-[10px] opacity-75">({count})</span>
                </button>

                {/* Folder edit / delete popover trigger */}
                <div className="absolute right-1 flex items-center opacity-40 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFolderToRename(f);
                      setFolderRenameValue(f.name);
                    }}
                    className="p-1 hover:text-amber-400"
                    title="Rename Folder"
                  >
                    <Edit2 size={11} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFolderToDelete(f);
                    }}
                    className="p-1 hover:text-rose-400"
                    title="Delete Folder"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            );
          })}

          <button
            onClick={() => setShowNewFolderModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-wider shrink-0 bg-white/5 border border-dashed border-white/20 text-white/70 hover:text-white hover:border-white/40 transition-all"
          >
            <FolderPlus size={14} /> + New Folder
          </button>
          </div>
        </DragScroll>

        {/* CATEGORY FILTER PILLS */}
        {categories.length > 0 && (
          <DragScroll fade="page" className="pb-4 mb-6">
            <div className="flex items-center gap-1.5 w-max">
              <span className="text-xs font-bold uppercase tracking-wider text-white/40 shrink-0 mr-1 flex items-center gap-1">
                <Tag size={12} /> Category:
              </span>
              <button
                onClick={() => setSelectedCategoryFilter('all')}
                className={`px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition-colors shrink-0 ${
                  selectedCategoryFilter === 'all'
                    ? 'bg-rose-600 text-white'
                    : 'bg-[#1e1e1e] text-white/60 hover:text-white'
                }`}
              >
                All Categories
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategoryFilter(cat)}
                  className={`px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition-colors shrink-0 ${
                    selectedCategoryFilter === cat
                      ? 'bg-rose-600 text-white'
                      : 'bg-[#1e1e1e] text-white/60 hover:text-white'
                  } flex items-center gap-1`}
                >
                  {pinnedCategories.includes(cat) && (
                    <Pin size={10} className="fill-current shrink-0" />
                  )}
                  {cat}
                </button>
              ))}
            </div>
          </DragScroll>
        )}

        {/* TAG FILTER PILLS */}
        {allTags.length > 0 && (
          <DragScroll fade="page" className="pb-4 mb-6">
            <div className="flex items-center gap-1.5 w-max">
              <span className="text-xs font-bold uppercase tracking-wider text-white/40 shrink-0 mr-1 flex items-center gap-1">
                <Tags size={12} /> Tags:
              </span>
              {allTags.map((tag) => {
                const active = selectedTagFilters.some((t) => tagsEqual(t, tag));
                return (
                  <button
                    key={tag}
                    onClick={() => toggleTagFilter(tag)}
                    aria-pressed={active}
                    className={`px-3 py-1 text-[11px] font-bold uppercase tracking-wider rounded-full transition-colors shrink-0 ${
                      active
                        ? 'bg-amber-500 text-black'
                        : 'bg-[#1e1e1e] text-white/60 hover:text-white'
                    }`}
                  >
                    #{tag}
                  </button>
                );
              })}
              {selectedTagFilters.length > 0 && (
                <button
                  onClick={() => setSelectedTagFilters([])}
                  className="ml-2 px-3 py-1 text-[11px] font-bold uppercase tracking-wider bg-white/5 border border-white/20 text-white/70 hover:text-white shrink-0 flex items-center gap-1"
                >
                  <X size={11} /> Clear Filters
                </button>
              )}
            </div>
          </DragScroll>
        )}

        {/* PROJECTS GRID */}
        {filteredProjects.length === 0 ? (
          <div className="bg-[#181818] border border-white/10 p-12 text-center my-8">
            <ImageIcon size={48} className="mx-auto text-white/20 mb-3" />
            <h3 className="text-base font-bold text-white">
              {activeFolderId === 'favorites'
                ? 'No favorite projects yet.'
                : searchQuery
                ? 'No projects found.'
                : 'No Projects Found'}
            </h3>
            <p className="text-xs text-white/50 mt-1 max-w-sm mx-auto">
              {activeFolderId === 'favorites'
                ? 'Mark a project as favorite from its context menu (long-press or right-click).'
                : searchQuery
                ? `No tracing projects match "${searchQuery}".`
                : 'Import an image or select a different collection folder above.'}
            </p>
            {activeFolderId !== 'favorites' && !searchQuery && (
              <button
                onClick={onNewImport}
                className="mt-5 bg-white text-black font-extrabold text-xs uppercase tracking-wider px-5 py-2.5 hover:bg-white/90 transition-all"
              >
                Import Artwork Now
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
            {filteredProjects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                folder={folders.find((f) => f.id === p.folderId)}
                categories={categories}
                folders={folders}
                isMenuOpen={activeMenuProjectId === p.id}
                onOpen={onOpenProject}
                onOpenMenu={toggleMenu}
                onCloseMenu={closeMenu}
                onStartLongPress={startLongPress}
                onCancelLongPress={cancelLongPress}
                onConsumeLongPress={consumeLongPressFlag}
                onToggleFavorite={onToggleFavorite}
                onUpdateTagsAvailable={!!onUpdateTags}
                onRequestEditTags={requestEditTags}
                onUpdateNotesAvailable={!!onUpdateNotes}
                onRequestEditNotes={requestEditNotes}
                onRequestRename={requestRename}
                onDuplicateProject={onDuplicateProject}
                onExportProject={onExportProject}
                onRequestChangeCover={onChangeCover ? requestChangeCover : undefined}
                onChangeCategory={onChangeCategory}
                onMoveProjectToFolder={onMoveProjectToFolder}
                onRequestDelete={requestDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* CONFIRMATION MODAL: DELETE PROJECT */}
      {projectToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[#181818] border border-white/20 p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400 mb-3">
              <AlertTriangle size={24} />
              <h3 className="text-lg font-bold text-white">Delete Project?</h3>
            </div>
            <p className="text-sm text-white/70">
              Are you sure you want to delete <span className="font-bold text-white">"{projectToDelete.name}"</span>?
              This action permanently removes the tracing artwork and cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setProjectToDelete(null)}
                className="px-4 py-2 bg-[#262626] border border-white/20 text-white text-xs font-bold uppercase tracking-wider hover:bg-[#333]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDeleteProject(projectToDelete.id);
                  setProjectToDelete(null);
                }}
                className="px-4 py-2 bg-rose-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-rose-500 shadow"
              >
                Permanently Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RENAME PROJECT MODAL */}
      {projectToRename && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[#181818] border border-white/20 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4">Rename Tracing Project</h3>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="w-full bg-[#121212] border border-white/30 p-3 text-sm text-white focus:outline-none focus:border-white"
              placeholder="Project name..."
              autoFocus
            />
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setProjectToRename(null)}
                className="px-4 py-2 bg-[#262626] border border-white/20 text-white text-xs font-bold uppercase tracking-wider hover:bg-[#333]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (renameValue.trim()) {
                    onRenameProject(projectToRename.id, renameValue.trim());
                  }
                  setProjectToRename(null);
                }}
                className="px-4 py-2 bg-white text-black text-xs font-extrabold uppercase tracking-wider hover:bg-white/90"
              >
                Save Name
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE NEW FOLDER MODAL */}
      {showNewFolderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[#181818] border border-white/20 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4">Create Collection Folder</h3>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              className="w-full bg-[#121212] border border-white/30 p-3 text-sm text-white focus:outline-none focus:border-white"
              placeholder="e.g. Manga Sketches, Calligraphy..."
              autoFocus
            />
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowNewFolderModal(false);
                  setNewFolderName('');
                }}
                className="px-4 py-2 bg-[#262626] border border-white/20 text-white text-xs font-bold uppercase tracking-wider hover:bg-[#333]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (newFolderName.trim()) {
                    onCreateFolder(newFolderName.trim(), null);
                    setNewFolderName('');
                    setShowNewFolderModal(false);
                  }
                }}
                className="px-4 py-2 bg-white text-black text-xs font-extrabold uppercase tracking-wider hover:bg-white/90"
              >
                Create Folder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RENAME FOLDER MODAL */}
      {folderToRename && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[#181818] border border-white/20 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4">Rename Folder</h3>
            <input
              type="text"
              value={folderRenameValue}
              onChange={(e) => setFolderRenameValue(e.target.value)}
              className="w-full bg-[#121212] border border-white/30 p-3 text-sm text-white focus:outline-none focus:border-white"
              autoFocus
            />
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setFolderToRename(null)}
                className="px-4 py-2 bg-[#262626] border border-white/20 text-white text-xs font-bold uppercase tracking-wider hover:bg-[#333]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (folderRenameValue.trim()) {
                    onRenameFolder(folderToRename.id, folderRenameValue.trim());
                  }
                  setFolderToRename(null);
                }}
                className="px-4 py-2 bg-white text-black text-xs font-extrabold uppercase tracking-wider hover:bg-white/90"
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE FOLDER MODAL */}
      {folderToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[#181818] border border-white/20 p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400 mb-3">
              <AlertTriangle size={24} />
              <h3 className="text-lg font-bold text-white">Delete Folder?</h3>
            </div>
            <p className="text-sm text-white/70">
              Delete folder <span className="font-bold text-white">"{folderToDelete.name}"</span>?
              Projects inside this folder will not be deleted; they will move to Unorganized.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setFolderToDelete(null)}
                className="px-4 py-2 bg-[#262626] border border-white/20 text-white text-xs font-bold uppercase tracking-wider hover:bg-[#333]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDeleteFolder(folderToDelete.id);
                  setFolderToDelete(null);
                }}
                className="px-4 py-2 bg-rose-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-rose-500 shadow"
              >
                Delete Folder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT TAGS MODAL */}
      {projectToEditTags && onUpdateTags && (
        <EditTagsModal
          project={projectToEditTags}
          suggestions={allTags}
          onClose={() => setProjectToEditTags(null)}
          onSave={(tags) => {
            onUpdateTags(projectToEditTags, tags);
            setProjectToEditTags(null);
          }}
        />
      )}

      {/* EDIT NOTES MODAL */}
      {projectToEditNotes && onUpdateNotes && (
        <EditNotesModal
          project={projectToEditNotes}
          onClose={() => setProjectToEditNotes(null)}
          onSave={(notes) => {
            onUpdateNotes(projectToEditNotes, notes);
            setProjectToEditNotes(null);
          }}
        />
      )}

      {/* CHANGE COVER MODAL */}
      {projectToChangeCover && onChangeCover && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[#181818] border border-white/20 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-1">Change Project Cover</h3>
            <p className="text-xs text-white/50 mb-4">Pick a cover shown on this project's card.</p>

            <div className="h-40 w-full overflow-hidden border border-white/10 bg-[#121212] flex items-center justify-center mb-4">
              <img
                src={getProjectCover(projectToChangeCover)}
                alt={projectToChangeCover.name}
                className="h-full w-full object-cover"
              />
            </div>

            <input
              ref={coverFileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleCoverFileSelected(e.target.files[0]);
                }
                e.target.value = '';
              }}
            />

            <div className="grid grid-cols-1 gap-3">
              <button
                onClick={() => coverFileInputRef.current?.click()}
                className="flex items-center justify-center gap-2 bg-white text-black font-bold py-3 px-4 hover:bg-white/90 transition-colors text-sm"
              >
                <ImagePlus size={16} /> Choose Image from Device
              </button>
              <button
                onClick={() => {
                  onChangeCover(projectToChangeCover, null);
                  setProjectToChangeCover(null);
                }}
                className="flex items-center justify-center gap-2 bg-[#262626] border border-white/20 text-white font-bold py-3 px-4 hover:bg-[#333] transition-colors text-sm"
              >
                <ImageIcon size={16} /> Use Current Thumbnail
              </button>
            </div>

            <button
              onClick={() => setProjectToChangeCover(null)}
              className="mt-4 w-full text-center text-xs text-white/40 hover:text-white uppercase tracking-wider py-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ------- Project card (memoized) -------
//
// Extracted so that toggling one card's menu — or typing in the search box,
// or toggling a category/tag filter — doesn't force every other card in a
// hundreds-of-projects grid to re-render. React.memo's shallow prop check is
// effective here because none of these interactions touch IndexedDB (no
// refreshData() round-trip), so `project`/`folder`/the callback props below
// all keep the same object identity across those renders.

interface ProjectCardProps {
  project: Project;
  folder: CollectionFolder | undefined;
  categories: string[];
  folders: CollectionFolder[];
  isMenuOpen: boolean;
  onOpen: (project: Project) => void;
  onOpenMenu: (id: string) => void;
  onCloseMenu: () => void;
  onStartLongPress: (id: string) => void;
  onCancelLongPress: () => void;
  onConsumeLongPress: () => boolean;
  onToggleFavorite?: (project: Project) => void;
  onUpdateTagsAvailable: boolean;
  onRequestEditTags: (project: Project) => void;
  onUpdateNotesAvailable: boolean;
  onRequestEditNotes: (project: Project) => void;
  onRequestRename: (project: Project) => void;
  onDuplicateProject?: (project: Project) => void;
  onExportProject?: (project: Project) => void;
  onRequestChangeCover?: (project: Project) => void;
  onChangeCategory?: (project: Project, category: string) => void;
  onMoveProjectToFolder: (projectId: string, folderId: string | null) => void;
  onRequestDelete: (project: Project) => void;
}

const ProjectCard: React.FC<ProjectCardProps> = React.memo(function ProjectCard({
  project: p,
  folder,
  categories,
  folders,
  isMenuOpen,
  onOpen,
  onOpenMenu,
  onCloseMenu,
  onStartLongPress,
  onCancelLongPress,
  onConsumeLongPress,
  onToggleFavorite,
  onUpdateTagsAvailable,
  onRequestEditTags,
  onUpdateNotesAvailable,
  onRequestEditNotes,
  onRequestRename,
  onDuplicateProject,
  onExportProject,
  onRequestChangeCover,
  onChangeCategory,
  onMoveProjectToFolder,
  onRequestDelete,
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  // Close on outside click/tap or Escape. Scoped to this card only (rather
  // than a single document-level listener shared across every card) so
  // there's no interaction between the card that owns an open menu and the
  // trigger button that opened it.
  useEffect(() => {
    if (!isMenuOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        onCloseMenu();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseMenu();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMenuOpen, onCloseMenu]);

  return (
    <div
      ref={cardRef}
      onClick={() => {
        // Swallow the click if it was the tail end of a long-press.
        if (onConsumeLongPress()) return;
        onOpen(p);
      }}
      onPointerDown={() => onStartLongPress(p.id)}
      onPointerUp={onCancelLongPress}
      onPointerLeave={onCancelLongPress}
      onPointerCancel={onCancelLongPress}
      onPointerMove={onCancelLongPress}
      onContextMenu={(e) => {
        e.preventDefault();
        onOpenMenu(p.id);
      }}
      className="group relative bg-[#181818] border border-white/10 hover:border-white/40 transition-all overflow-hidden flex flex-col cursor-pointer shadow-lg"
    >
      {/* Thumbnail Preview Area */}
      <div className="relative h-48 w-full bg-[#121212] overflow-hidden flex items-center justify-center border-b border-white/5">
        <img
          src={getProjectCover(p)}
          alt={p.name}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
        />

        {/* Favorite badge (read-only indicator; toggle is in the menu) */}
        {p.isFavorite && (
          <div className="absolute top-2.5 left-2.5 h-7 w-7 bg-black/80 backdrop-blur-sm border border-amber-400/60 flex items-center justify-center text-amber-400 shadow">
            <Star size={13} className="fill-amber-400" />
          </div>
        )}

        {/* Lock Indicator */}
        {p.isLocked && (
          <div className="absolute top-2.5 left-2.5 bg-black/80 backdrop-blur-sm border border-rose-500/40 px-2 py-1 text-[10px] font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1 shadow">
            <Lock size={11} /> Locked
          </div>
        )}

        {/* Category Tag */}
        {p.category && (
          <div className="absolute bottom-2.5 left-2.5 bg-black/80 backdrop-blur-sm border border-white/20 px-2 py-0.5 text-[10px] font-semibold text-amber-300 flex items-center gap-1">
            <Tag size={11} /> {p.category}
          </div>
        )}

        {/* Folder Tag */}
        {folder && (
          <div className="absolute bottom-2.5 right-2.5 bg-black/80 backdrop-blur-sm border border-white/20 px-2 py-0.5 text-[10px] font-semibold text-white/80 flex items-center gap-1">
            <Folder size={11} className="text-rose-400" /> {folder.name}
          </div>
        )}

        {/* Favorite Star Button */}
        {onToggleFavorite && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(p);
            }}
            aria-label={p.isFavorite ? `Remove ${p.name} from favorites` : `Add ${p.name} to favorites`}
            className={`absolute top-2.5 right-12 h-8 w-8 bg-black/80 hover:bg-black flex items-center justify-center border border-white/20 shadow transition-colors ${
              p.isFavorite ? 'text-amber-400' : 'text-white/40 hover:text-white'
            }`}
          >
            <Star size={15} className={p.isFavorite ? 'fill-amber-400' : ''} />
          </button>
        )}

        {/* Action Menu Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenMenu(p.id);
          }}
          aria-label={`More actions for ${p.name}`}
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
          className="absolute top-2.5 right-2.5 h-8 w-8 bg-black/80 hover:bg-black text-white flex items-center justify-center border border-white/20 shadow"
        >
          <MoreVertical size={16} />
        </button>
      </div>

      {/* Project Info Footer */}
      <div className="p-4 flex flex-col justify-between flex-1">
        <div>
          <h3 className="text-sm font-bold text-white truncate group-hover:text-amber-400 transition-colors flex items-center gap-1.5">
            {p.isFavorite && (
              <Star size={12} className="fill-amber-400 text-amber-400 shrink-0" aria-label="Favorite" />
            )}
            <span className="truncate">{p.name}</span>
          </h3>
          {p.tags && p.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {p.tags.slice(0, 3).map((t) => (
                <span
                  key={t}
                  className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/5 text-white/70 border border-white/10"
                >
                  #{t}
                </span>
              ))}
              {p.tags.length > 3 && (
                <span className="text-[10px] font-bold text-white/40 self-center">
                  +{p.tags.length - 3}
                </span>
              )}
            </div>
          )}
          <div className="flex items-center justify-between text-[11px] text-white/50 mt-1.5">
            <span className="flex items-center gap-1">
              <Calendar size={12} /> {formatProjectDate(p.lastOpenedAt)}
            </span>
            <span className="font-mono bg-white/5 px-1.5 py-0.5">
              Edge: {p.adjustments.edgeDetection}%
            </span>
          </div>
          {p.notes && (
            <div className="flex items-start gap-1.5 mt-1.5 text-[11px] text-white/40">
              <NotebookPen size={11} className="mt-0.5 shrink-0" />
              <span className="line-clamp-1">{p.notes}</span>
            </div>
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-rose-400 group-hover:text-white transition-colors">
          <span>Open Tracing Canvas</span>
          <span>→</span>
        </div>
      </div>

      {/* Action Menu Dropdown */}
      {isMenuOpen && (
        <div
          role="menu"
          aria-label={`Actions for ${p.name}`}
          onClick={(e) => e.stopPropagation()}
          className="absolute top-12 right-3 z-30 w-52 bg-[#202020] border border-white/30 shadow-2xl divide-y divide-white/10 text-xs text-white"
        >
          <button
            role="menuitem"
            onClick={() => {
              onCloseMenu();
              onOpen(p);
            }}
            className="w-full text-left px-4 py-2.5 hover:bg-white/10 font-bold flex items-center gap-2"
          >
            <FolderOpen size={14} /> Open Studio
          </button>

          {onToggleFavorite && (
            <button
              role="menuitem"
              onClick={() => {
                onCloseMenu();
                onToggleFavorite(p);
              }}
              className="w-full text-left px-4 py-2.5 hover:bg-white/10 flex items-center gap-2"
            >
              <Star size={14} className={p.isFavorite ? 'fill-amber-400 text-amber-400' : ''} />
              {p.isFavorite ? '⭐ Remove from Favorites' : '⭐ Add to Favorites'}
            </button>
          )}

          {onUpdateTagsAvailable && (
            <button
              role="menuitem"
              onClick={() => onRequestEditTags(p)}
              className="w-full text-left px-4 py-2.5 hover:bg-white/10 flex items-center gap-2"
            >
              <Tags size={14} /> 🏷 Edit Tags
            </button>
          )}

          {onUpdateNotesAvailable && (
            <button
              role="menuitem"
              onClick={() => onRequestEditNotes(p)}
              className="w-full text-left px-4 py-2.5 hover:bg-white/10 flex items-center gap-2"
            >
              <NotebookPen size={14} /> {p.notes ? 'Edit Notes' : 'Add Notes'}
            </button>
          )}

          <button
            role="menuitem"
            onClick={() => onRequestRename(p)}
            className="w-full text-left px-4 py-2.5 hover:bg-white/10 flex items-center gap-2"
          >
            <Edit2 size={14} /> ✏ Rename Project
          </button>

          {onDuplicateProject && (
            <button
              role="menuitem"
              onClick={() => {
                onCloseMenu();
                onDuplicateProject(p);
              }}
              className="w-full text-left px-4 py-2.5 hover:bg-white/10 flex items-center gap-2"
            >
              <Copy size={14} /> 📋 Duplicate Project
            </button>
          )}

          {onExportProject && (
            <button
              role="menuitem"
              onClick={() => {
                onCloseMenu();
                onExportProject(p);
              }}
              className="w-full text-left px-4 py-2.5 hover:bg-white/10 flex items-center gap-2"
            >
              <Upload size={14} /> 📤 Export Project
            </button>
          )}

          {onRequestChangeCover && (
            <button
              role="menuitem"
              onClick={() => onRequestChangeCover(p)}
              className="w-full text-left px-4 py-2.5 hover:bg-white/10 flex items-center gap-2"
            >
              <ImagePlus size={14} /> Change Cover
            </button>
          )}

          {/* Change category selector */}
          {onChangeCategory && categories.length > 0 && (
            <div className="p-2 bg-[#181818]">
              <span className="text-[10px] font-bold text-white/50 uppercase px-2 mb-1 block">
                Category:
              </span>
              <select
                value={p.category || ''}
                onChange={(e) => {
                  onChangeCategory(p, e.target.value);
                  onCloseMenu();
                }}
                className="w-full bg-[#262626] border border-white/20 text-xs text-white p-1"
              >
                <option value="">No category</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Move to folder selector */}
          <div className="p-2 bg-[#181818]">
            <span className="text-[10px] font-bold text-white/50 uppercase px-2 mb-1 block">
              Move to Folder:
            </span>
            <select
              value={p.folderId || ''}
              onChange={(e) => {
                onMoveProjectToFolder(p.id, e.target.value || null);
                onCloseMenu();
              }}
              className="w-full bg-[#262626] border border-white/20 text-xs text-white p-1"
            >
              <option value="">No Folder (Unorganized)</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          <button
            role="menuitem"
            onClick={() => onRequestDelete(p)}
            className="w-full text-left px-4 py-2.5 hover:bg-rose-900/40 text-rose-400 font-bold flex items-center gap-2"
          >
            <Trash2 size={14} /> Delete Project
          </button>
        </div>
      )}
    </div>
  );
});

// ------- Edit Tags modal -------

interface EditTagsModalProps {
  project: Project;
  suggestions: string[];
  onClose: () => void;
  onSave: (tags: string[]) => void;
}

const EditTagsModal: React.FC<EditTagsModalProps> = ({
  project,
  suggestions,
  onClose,
  onSave,
}) => {
  const [tags, setTags] = useState<string[]>(project.tags ?? []);
  const [input, setInput] = useState('');

  const addTag = (raw: string) => {
    const norm = normalizeTag(raw);
    if (!norm) return;
    if (tags.some((t) => tagsEqual(t, norm))) return;
    setTags((prev) => [...prev, norm]);
    setInput('');
  };

  const removeTag = (tag: string) => {
    setTags((prev) => prev.filter((t) => !tagsEqual(t, tag)));
  };

  const unusedSuggestions = suggestions.filter(
    (s) => !tags.some((t) => tagsEqual(t, s))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-[#181818] border border-white/20 p-6 shadow-2xl animate-fade-in">
        <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
          <Tags size={18} className="text-amber-400" /> Edit Tags
        </h3>
        <p className="text-xs text-white/50 mb-4 truncate">{project.name}</p>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-amber-500 text-black"
              >
                #{t}
                <button
                  onClick={() => removeTag(t)}
                  aria-label={`Remove tag ${t}`}
                  className="hover:text-rose-800"
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addTag(input);
              } else if (e.key === 'Backspace' && !input && tags.length > 0) {
                setTags((prev) => prev.slice(0, -1));
              }
            }}
            placeholder="Add a tag and press Enter"
            className="flex-1 bg-[#121212] border border-white/30 p-2.5 text-sm text-white focus:outline-none focus:border-white"
            autoFocus
          />
          <button
            onClick={() => addTag(input)}
            className="px-3 bg-white text-black text-xs font-extrabold uppercase tracking-wider hover:bg-white/90"
          >
            Add
          </button>
        </div>

        {unusedSuggestions.length > 0 && (
          <div className="mt-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/40 mb-1.5">
              Reuse existing:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {unusedSuggestions.slice(0, 20).map((s) => (
                <button
                  key={s}
                  onClick={() => addTag(s)}
                  className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white/70 hover:text-white hover:border-white/30"
                >
                  + #{s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#262626] border border-white/20 text-white text-xs font-bold uppercase tracking-wider hover:bg-[#333]"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(tags)}
            className="px-4 py-2 bg-white text-black text-xs font-extrabold uppercase tracking-wider hover:bg-white/90"
          >
            Save Tags
          </button>
        </div>
      </div>
    </div>
  );
};

// ------- Edit Notes modal -------

const NOTES_MAX_LENGTH = 2000;

interface EditNotesModalProps {
  project: Project;
  onClose: () => void;
  onSave: (notes: string) => void;
}

const EditNotesModal: React.FC<EditNotesModalProps> = ({ project, onClose, onSave }) => {
  const [notes, setNotes] = useState(project.notes ?? '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-[#181818] border border-white/20 p-6 shadow-2xl animate-fade-in">
        <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
          <NotebookPen size={18} className="text-amber-400" /> Project Notes
        </h3>
        <p className="text-xs text-white/50 mb-4 truncate">{project.name}</p>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, NOTES_MAX_LENGTH))}
          placeholder="Reference links, palette notes, session reminders…"
          rows={6}
          className="w-full resize-none bg-[#121212] border border-white/30 p-2.5 text-sm text-white focus:outline-none focus:border-white"
          autoFocus
        />
        <p className="mt-1 text-right text-[10px] text-white/30">
          {notes.length}/{NOTES_MAX_LENGTH}
        </p>

        <div className="mt-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#262626] border border-white/20 text-white text-xs font-bold uppercase tracking-wider hover:bg-[#333]"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(notes.trim())}
            className="px-4 py-2 bg-white text-black text-xs font-extrabold uppercase tracking-wider hover:bg-white/90"
          >
            Save Notes
          </button>
        </div>
      </div>
    </div>
  );
};
