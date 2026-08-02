export interface ImageAdjustments {
  opacity: number; // 0 to 100
  brightness: number; // -100 to +100
  contrast: number; // -100 to +100
  edgeDetection: number; // 0 to 100
}

export interface TransformState {
  zoom: number; // 0.1 to 5.0
  rotation: number; // In degrees, 0.1 degree precision
  panX: number;
  panY: number;
}

export interface RulerState {
  x: number;
  y: number;
  rotation: number;
  lengthCm: number;
  ppi: number; // Pixels per inch for calibration
}

export interface ProtractorState {
  x: number;
  y: number;
  rotation: number;
  radius: number;
}

export interface PerspectiveState {
  vpX: number; // Vanishing point X
  vpY: number; // Vanishing point Y
  horizonY: number; // Horizon line Y
  rayCount: number; // Number of radiating rays
}

export interface ToolOverlays {
  showRuler: boolean;
  rulerState: RulerState;
  showProtractor: boolean;
  protractorState: ProtractorState;
  showPerspective: boolean;
  perspectiveState: PerspectiveState;
}

// Categories are entirely user-created and persisted in IndexedDB. The app
// ships with none — the user builds their own list.
export type ProjectCategory = string;

export interface Project {
  id: string;
  name: string;
  folderId: string | null;
  category?: string;
  isFavorite?: boolean;
  tags?: string[];
  notes?: string;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
  imageDataUrl: string; // Original image or compressed Blob URL / Base64
  thumbnailDataUrl: string; // 200x200 thumbnail with adjustments
  coverDataUrl?: string; // Optional custom cover; falls back to thumbnail
  adjustments: ImageAdjustments;
  transform: TransformState;
  isLocked: boolean;
  overlays: ToolOverlays;
}

export interface CollectionFolder {
  id: string;
  name: string;
  coverImage: string | null;
  createdAt: number;
}

export type ActiveTab = 'home' | 'projects' | 'statistics' | 'settings';

/**
 * Cumulative usage counters persisted in IndexedDB. These survive project
 * deletions so lifetime stats (imports, app opens, tracing time) stay accurate.
 */
export interface AppStats {
  appOpens: number;
  imagesImported: number;
  totalTracingTimeMs: number;
}

export const defaultAppStats: AppStats = {
  appOpens: 0,
  imagesImported: 0,
  totalTracingTimeMs: 0,
};

export const defaultAdjustments: ImageAdjustments = {
  opacity: 100,
  brightness: 0,
  contrast: 0,
  edgeDetection: 0,
};

export const defaultTransform: TransformState = {
  zoom: 1.0,
  rotation: 0,
  panX: 0,
  panY: 0,
};

export const defaultOverlays: ToolOverlays = {
  showRuler: false,
  rulerState: { x: 150, y: 300, rotation: 0, lengthCm: 12, ppi: 160 },
  showProtractor: false,
  protractorState: { x: 250, y: 350, rotation: 0, radius: 120 },
  showPerspective: false,
  perspectiveState: { vpX: 400, vpY: 200, horizonY: 200, rayCount: 8 },
};

