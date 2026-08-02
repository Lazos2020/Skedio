import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '../ThemeContext';
import { DragScroll } from './DragScroll';
import {
  createBackup,
  downloadBackup,
  parseBackupFile,
  restoreBackup,
  formatBytes,
  SkedioBackupFile,
} from '../lib/backup';
import { getBackupMeta, BackupMeta, getAllProjects } from '../lib/db';
import { getStorageInfo, StorageInfo } from '../lib/db';
import {
  loadSettings,
  saveSettings,
  resetSettings as resetSettingsStore,
  defaultSettings,
  SkedioSettings,
  TraceOrientation,
} from '../lib/settings';
import { SKEDIO_APP_VERSION, SKEDIO_APP_VERSION_LABEL } from '../lib/backup';
import {
  Smartphone,
  Shield,
  Zap,
  Ruler,
  Database,
  Trash2,
  CheckCircle2,
  Download,
  Info,
  RefreshCw,
  Sliders,
  Monitor,
  FolderOpen,
  HelpCircle,
  FileText,
  Award,
  History,
  Lock,
  Sun,
  Moon,
  Tag,
  Plus,
  X,
  Pin,
  PinOff,
  Upload,
  HardDriveDownload,
  AlertTriangle,
  Mail,
  Bug,
  RotateCcw,
  HardDrive,
  ShieldCheck,
  Copyright,
  RotateCw,
} from 'lucide-react';

interface SettingsViewProps {
  onClearAllProjects: () => void;
  categories: string[];
  pinnedCategories: string[];
  onAddCategory: (name: string) => void;
  onDeleteCategory: (name: string) => void;
  onTogglePinCategory: (name: string) => void;
  onDataRestored: () => void;
}

type SettingsSection =
  | 'general'
  | 'tracing'
  | 'display'
  | 'projects'
  | 'storage'
  | 'privacy'
  | 'about';

// App metadata surfaced on the About page.
const DEVELOPER_NAME = 'Skedio Studio';
const CONTACT_EMAIL = 'pyrrosathinaios@gmail.com';
const FEEDBACK_EMAIL = 'pyrrosathinaios@gmail.com';
const COPYRIGHT = `© ${new Date().getFullYear()} Skedio Studio. All rights reserved.`;

const ORIENTATION_OPTIONS: { id: TraceOrientation; label: string }[] = [
  { id: 'follow', label: 'Follow Device' },
  { id: 'portrait', label: 'Portrait Only' },
  { id: 'landscape', label: 'Landscape Only' },
];

// Changelog entries are intentionally empty. New versions are only added
// when the developer explicitly decides to publish one.
const CHANGELOG_HISTORY: { version: string; date: string; changes: string[] }[] = [];

const PRIVACY_ITEMS = [
  { emoji: '🔒', title: 'Local Storage', text: 'All projects, images, categories, and settings are stored locally on your device.' },
  { emoji: '🌐', title: 'Offline First', text: 'Skedio can be used completely offline and does not require an internet connection.' },
  { emoji: '👤', title: 'No Account Required', text: 'You do not need to create an account or sign in to use Skedio.' },
  { emoji: '🚫', title: 'No Ads', text: 'Skedio does not display advertisements.' },
  { emoji: '📊', title: 'No Analytics', text: 'Skedio does not collect usage analytics or track how you use the app.' },
  { emoji: '🖼️', title: 'Image Privacy', text: 'Imported images remain on your device and are only accessed when you explicitly choose to import them.' },
  { emoji: '📂', title: 'Permissions', text: 'Storage and photo permissions are used only for importing images and saving projects.' },
  { emoji: '🗑️', title: 'Delete Anytime', text: 'Users can delete projects at any time, permanently removing the data from their device.' },
  { emoji: '🤝', title: 'No Data Sharing', text: 'Skedio does not sell, share, or transmit user data to third parties.' },
  { emoji: '💾', title: 'Your Data Stays Yours', text: 'All artwork, projects, and settings belong entirely to you and remain on your device.' },
];

// Dedicated Privacy Policy page content — the exact statements shown to users.
const PRIVACY_POLICY_ITEMS = [
  { emoji: '🔒', title: 'Local Storage', text: 'All projects, images, categories, and settings are stored locally on your device.' },
  { emoji: '🌐', title: 'Offline First', text: 'Skedio works completely offline.' },
  { emoji: '👤', title: 'No Account Required', text: 'No registration or sign-in is necessary.' },
  { emoji: '🚫', title: 'No Ads', text: 'Skedio does not display advertisements.' },
  { emoji: '📊', title: 'No Analytics', text: 'No usage tracking or analytics are collected.' },
  { emoji: '🖼️', title: 'Image Privacy', text: 'Imported images remain on your device.' },
  { emoji: '🤝', title: 'No Data Sharing', text: 'Skedio does not sell or share user data.' },
  { emoji: '🗑️', title: 'Delete Anytime', text: 'Users can permanently delete their data at any time.' },
  { emoji: '💾', title: 'Your Data Stays Yours', text: 'All artwork belongs entirely to the user.' },
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  onClearAllProjects,
  categories,
  pinnedCategories,
  onAddCategory,
  onDeleteCategory,
  onTogglePinCategory,
  onDataRestored,
}) => {
  const { theme, setTheme } = useTheme();
  const [activeSection, setActiveSection] = useState<SettingsSection>('general');
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState('');

  // Persisted app preferences (keep-awake, orientation, PPI, contrast).
  const [settings, setSettings] = useState<SkedioSettings>(defaultSettings);
  useEffect(() => {
    setSettings(loadSettings());
  }, []);
  const updateSetting = <K extends keyof SkedioSettings>(key: K, value: SkedioSettings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      saveSettings(next);
      return next;
    });
  };

  // Storage information.
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [refreshingStorage, setRefreshingStorage] = useState(false);
  const refreshStorage = async () => {
    setRefreshingStorage(true);
    try {
      setStorageInfo(await getStorageInfo());
    } catch {
      /* ignore */
    } finally {
      setRefreshingStorage(false);
    }
  };
  useEffect(() => {
    refreshStorage();
  }, []);

  const handleResetSettings = () => {
    setSettings(resetSettingsStore());
    setShowConfirmReset(false);
    triggerNotification('Settings reset to defaults.');
  };

  // Detects the device model and Android version from the User-Agent so the
  // feedback / bug-report email prefill useful diagnostic context.
  const getDeviceInfo = () => {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const androidVersion = /Android\s([0-9.]+)/.exec(ua)?.[1] || 'Unknown';
    const modelMatch = /Android[^;]*;\s*([^;)]+)\)/.exec(ua);
    const device = modelMatch?.[1]?.trim() || 'Unknown';
    return { androidVersion, device };
  };

  // Opens the platform default mail handler. If the app never loses focus
  // (no handler registered), surfaces a friendly notification.
  const openMailto = (subject: string, body: string) => {
    const url = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;
    try {
      window.location.href = url;
    } catch {
      triggerNotification('No email application found on this device.');
      return;
    }
    // Heuristic fallback: if we're still fully visible + focused after ~1.4s,
    // no mail handler picked up the intent.
    window.setTimeout(() => {
      if (
        typeof document !== 'undefined' &&
        document.visibilityState === 'visible' &&
        document.hasFocus()
      ) {
        triggerNotification('No email application found on this device.');
      }
    }, 1400);
  };

  const handleSendFeedback = () => {
    const { androidVersion, device } = getDeviceInfo();
    const body =
      `App Version: ${SKEDIO_APP_VERSION_LABEL} (${SKEDIO_APP_VERSION})\n` +
      `Device: ${device}\n` +
      `Android Version: ${androidVersion}\n` +
      `Message:\n\n` +
      `--------------------------------\n` +
      `Please describe your suggestion, feedback, or idea here.\n`;
    openMailto('Skedio Feedback', body);
  };

  const handleReportBug = () => {
    const { androidVersion, device } = getDeviceInfo();
    const body =
      `App Version: ${SKEDIO_APP_VERSION_LABEL} (${SKEDIO_APP_VERSION})\n` +
      `Device: ${device}\n` +
      `Android Version: ${androidVersion}\n` +
      `Project Name (if applicable):\n` +
      `Steps to Reproduce:\n` +
      `Expected Result:\n` +
      `Actual Result:\n` +
      `Additional Information:\n\n` +
      `--------------------------------\n` +
      `Please describe the bug here.\n`;
    openMailto('Skedio Bug Report', body);
  };

  const formatStorageBytes = (bytes: number | null) => {
    if (bytes === null) return 'Unavailable';
    return formatBytes(bytes);
  };

  // Backup & Restore state
  const [backupMeta, setBackupMetaState] = useState<BackupMeta | null>(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<SkedioBackupFile | null>(null);
  const [restoreWouldLoseNewerData, setRestoreWouldLoseNewerData] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getBackupMeta().then(setBackupMetaState).catch(() => {});
  }, []);

  const handleCreateBackup = async () => {
    setIsBackingUp(true);
    try {
      const result = await createBackup();
      downloadBackup(result.json);
      setBackupMetaState({
        lastBackupAt: result.createdAt,
        sizeBytes: result.sizeBytes,
        projectCount: result.projectCount,
      });
      triggerNotification('Backup created and downloaded.');
    } catch {
      triggerNotification('Failed to create backup.');
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRestoreFileSelected = (file: File) => {
    setRestoreError(null);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = parseBackupFile(reader.result as string);
        setPendingRestore(parsed);

        // Warn (but don't block) if the backup looks older than what's
        // currently on this device — restoring would silently discard any
        // work newer than the backup.
        try {
          const currentProjects = await getAllProjects();
          const newestCurrent = currentProjects.reduce((max, p) => Math.max(max, p.updatedAt), 0);
          const newestInBackup = parsed.data.projects.reduce(
            (max, p) => Math.max(max, p.updatedAt),
            parsed.createdAt
          );
          setRestoreWouldLoseNewerData(currentProjects.length > 0 && newestCurrent > newestInBackup);
        } catch {
          setRestoreWouldLoseNewerData(false);
        }
      } catch (err) {
        setRestoreError(err instanceof Error ? err.message : 'Invalid backup file.');
      }
    };
    reader.onerror = () => setRestoreError('Could not read the selected file.');
    reader.readAsText(file);
  };

  const handleConfirmRestore = async () => {
    if (!pendingRestore) return;
    try {
      await restoreBackup(pendingRestore);
      setPendingRestore(null);
      setRestoreWouldLoseNewerData(false);
      onDataRestored();
    } catch {
      setRestoreError('Failed to restore backup.');
      setPendingRestore(null);
      setRestoreWouldLoseNewerData(false);
    }
  };

  const formatBackupDate = (ts: number) =>
    new Date(ts).toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const triggerNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const sections: { id: SettingsSection; label: string; icon: React.ReactNode }[] = [
    { id: 'general', label: 'General', icon: <Sliders size={16} /> },
    { id: 'tracing', label: 'Tracing', icon: <Zap size={16} /> },
    { id: 'display', label: 'Display', icon: <Monitor size={16} /> },
    { id: 'projects', label: 'Projects', icon: <FolderOpen size={16} /> },
    { id: 'storage', label: 'Storage', icon: <HardDrive size={16} /> },
    { id: 'privacy', label: 'Privacy Policy', icon: <ShieldCheck size={16} /> },
    { id: 'about', label: 'About', icon: <Info size={16} /> },
  ];

  return (
    <div className="min-h-screen bg-[#121212] pb-[calc(7rem+env(safe-area-inset-bottom))] text-white select-none">
      <div className="max-w-4xl mx-auto px-4 pt-[calc(1.5rem+env(safe-area-inset-top))] space-y-6">
        {/* HEADER */}
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white uppercase">App Settings & Info</h1>
          <p className="text-xs text-white/50 mt-0.5">
            Android-First Studio • Zero Ads • Zero Tracking • 100% Offline
          </p>
        </div>

        {notification && (
          <div className="bg-emerald-950/90 border border-emerald-500/50 p-3.5 text-emerald-300 text-sm font-bold flex items-center gap-2 animate-fade-in">
            <CheckCircle2 size={18} /> {notification}
          </div>
        )}

        {/* SECTION TABS */}
        <DragScroll fade="page" className="pb-2 border-b border-white/10">
          <div className="flex items-center gap-2 w-max">
            {sections.map((sec) => (
              <button
                key={sec.id}
                onClick={() => setActiveSection(sec.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider shrink-0 transition-all ${
                  activeSection === sec.id
                    ? 'bg-rose-600 text-white font-extrabold shadow-lg'
                    : 'bg-[#181818] border border-white/10 text-white/70 hover:text-white'
                }`}
              >
                {sec.icon}
                <span>{sec.label}</span>
              </button>
            ))}
          </div>
        </DragScroll>

        {/* SECTION CONTENT */}
        <div className="mt-4">
          {/* GENERAL SECTION */}
          {activeSection === 'general' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-[#181818] border border-white/10 p-6 shadow-xl">
                <div className="flex items-center gap-3 text-amber-400 mb-4">
                  <Smartphone size={22} />
                  <h2 className="text-base font-bold text-white uppercase tracking-wide">
                    Android PWA & APK Wrapper Ready
                  </h2>
                </div>
                <p className="text-sm text-white/70 leading-relaxed mb-4">
                  Skedio is architected as an <strong className="text-white">offline-first Progressive Web App (PWA)</strong> optimized for Android 10+. All image processing, edge detection algorithms, and project databases run natively in your device's browser engine without requiring server connectivity.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="bg-[#121212] border border-white/10 p-4">
                    <h3 className="font-bold text-white uppercase mb-1.5 flex items-center gap-1.5 text-rose-400">
                      <Download size={14} /> Add to Home Screen
                    </h3>
                    <p className="text-white/60">
                      In Chrome on Android, tap the three dots menu (<strong className="text-white">⋮</strong>) and choose <strong className="text-white">Add to Home screen / Install App</strong>. Skedio will launch fullscreen like a native Android APK!
                    </p>
                  </div>
                  <div className="bg-[#121212] border border-white/10 p-4">
                    <h3 className="font-bold text-white uppercase mb-1.5 flex items-center gap-1.5 text-cyan-400">
                      <Zap size={14} /> Wrapper into APK / TWA
                    </h3>
                    <p className="text-white/60">
                      Developers can wrap this bundle using tools like <strong className="text-white">Bubblewrap</strong> or <strong className="text-white">Capacitor</strong> into a native Android `.apk` or `.aab` for the Google Play Store.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-[#181818] border border-white/10 p-6 shadow-xl">
                <div className="flex items-center gap-3 text-emerald-400 mb-3">
                  <Shield size={22} />
                  <h2 className="text-base font-bold text-white uppercase tracking-wide">
                    Privacy & Zero-Ad Guarantee
                  </h2>
                </div>
                <p className="text-xs text-white/70 leading-relaxed">
                  Skedio strictly adheres to a zero-compromise developer manifesto: <strong className="text-white">No Ads, No Subscriptions, No User Logins, No Analytics Tracking, No Cloud Storage uploads, and No Watermarks.</strong> Your drawings and reference photos remain 100% private in local device storage.
                </p>
              </div>

              {/* FEEDBACK & RESET */}
              <div className="bg-[#181818] border border-white/10 p-6 shadow-xl space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Mail size={16} className="text-cyan-400" /> Send Feedback
                    </h3>
                    <p className="text-xs text-white/50 mt-0.5">
                      Share a suggestion or idea. Opens your email app with device info pre-filled.
                    </p>
                  </div>
                  <button
                    onClick={handleSendFeedback}
                    aria-label="Send Feedback"
                    className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white font-extrabold text-xs uppercase tracking-wider px-4 py-2.5 shrink-0"
                  >
                    💬 Send Feedback
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-white/10">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Bug size={16} className="text-rose-400" /> Report a Bug
                    </h3>
                    <p className="text-xs text-white/50 mt-0.5">
                      Something not working? Send a bug report with steps to reproduce.
                    </p>
                  </div>
                  <button
                    onClick={handleReportBug}
                    aria-label="Report a Bug"
                    className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs uppercase tracking-wider px-4 py-2.5 shrink-0"
                  >
                    🐞 Report a Bug
                  </button>
                </div>

                <div className="flex items-center justify-between gap-4 pt-4 border-t border-white/10">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <RotateCcw size={16} className="text-amber-400" /> Reset Settings
                    </h3>
                    <p className="text-xs text-white/50 mt-0.5">
                      Restore all preferences to their defaults. Does not delete your projects or artwork.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowConfirmReset(true)}
                    className="flex items-center gap-2 bg-[#262626] border border-white/20 hover:bg-[#333] text-white font-extrabold text-xs uppercase tracking-wider px-4 py-2.5 shrink-0"
                  >
                    <RotateCcw size={14} /> Reset
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TRACING SECTION */}
          {activeSection === 'tracing' && (
            <div className="bg-[#181818] border border-white/10 p-6 shadow-xl space-y-6 animate-fade-in">
              <div className="flex items-center gap-3 text-rose-400 border-b border-white/10 pb-3">
                <Zap size={22} />
                <h2 className="text-base font-bold text-white uppercase tracking-wide">
                  Tracing & Hardware Preferences
                </h2>
              </div>

              {/* WakeLock Toggle */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-white">Keep Screen Awake in Trace Mode</h3>
                  <p className="text-xs text-white/50 mt-0.5">
                    Prevents your phone or tablet screen from sleeping or dimming while tracing artwork under paper.
                  </p>
                </div>
                <button
                  onClick={() => {
                    updateSetting('keepScreenAwake', !settings.keepScreenAwake);
                    triggerNotification(`Keep Screen Awake turned ${!settings.keepScreenAwake ? 'ON' : 'OFF'}`);
                  }}
                  className={`px-4 py-2 text-xs font-extrabold uppercase tracking-wider border transition-all ${
                    settings.keepScreenAwake
                      ? 'bg-rose-600 border-rose-400 text-white'
                      : 'bg-[#262626] border-white/20 text-white/60'
                  }`}
                >
                  {settings.keepScreenAwake ? 'Enabled' : 'Disabled'}
                </button>
              </div>

              {/* TRACE MODE ORIENTATION */}
              <div className="pt-4 border-t border-white/10">
                <div className="flex items-center gap-2 mb-2">
                  <RotateCw size={16} className="text-cyan-400" />
                  <h3 className="text-sm font-bold text-white">Trace Mode Orientation</h3>
                </div>
                <p className="text-xs text-white/50 mb-3">
                  Choose how the screen is oriented while Trace Mode is active. Applied only during Trace Mode.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {ORIENTATION_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => {
                        updateSetting('traceOrientation', opt.id);
                        triggerNotification(`Trace orientation: ${opt.label}`);
                      }}
                      className={`px-3 py-2.5 text-xs font-extrabold uppercase tracking-wider border transition-all ${
                        settings.traceOrientation === opt.id
                          ? 'bg-cyan-600 border-cyan-400 text-white'
                          : 'bg-[#262626] border-white/20 text-white/60 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ruler Calibration */}
              <div className="pt-4 border-t border-white/10">
                <div className="flex justify-between items-center mb-2">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Ruler size={16} className="text-amber-400" /> Physical Ruler Calibration (PPI)
                    </h3>
                    <p className="text-xs text-white/50 mt-0.5">
                      Adjust screen Pixels Per Inch so physical centimeters on screen match your real paper ruler.
                    </p>
                  </div>
                  <span className="font-mono bg-white/10 px-3 py-1 border border-white/20 text-sm font-bold">
                    {settings.ppi} PPI
                  </span>
                </div>
                <input
                  type="range"
                  min="100"
                  max="400"
                  step="5"
                  value={settings.ppi}
                  onChange={(e) => updateSetting('ppi', Number(e.target.value))}
                  className="w-full accent-amber-400 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-white/40 mt-1">
                  <span>Standard Phone (~140 PPI)</span>
                  <span>High-Res Tablet (~260 PPI)</span>
                  <span>Retina (~400 PPI)</span>
                </div>
              </div>
            </div>
          )}

          {/* DISPLAY SECTION */}
          {activeSection === 'display' && (
            <div className="bg-[#181818] border border-white/10 p-6 shadow-xl space-y-6 animate-fade-in">
              <div className="flex items-center gap-3 text-cyan-400 border-b border-white/10 pb-3">
                <Monitor size={22} />
                <h2 className="text-base font-bold text-white uppercase tracking-wide">
                  Display & Rendering Settings
                </h2>
              </div>

              {/* THEME TOGGLE */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-white">App Theme</h3>
                  <p className="text-xs text-white/50 mt-0.5">
                    Switch between Dark and Light theme. Applies instantly.
                  </p>
                </div>
                <div className="flex items-center gap-1 bg-[#262626] border border-white/20 p-1 shrink-0">
                  <button
                    onClick={() => setTheme('dark')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-extrabold uppercase tracking-wider transition-all ${
                      theme === 'dark' ? 'bg-white text-black' : 'text-white/60 hover:text-white'
                    }`}
                  >
                    <Moon size={14} /> Dark
                  </button>
                  <button
                    onClick={() => setTheme('light')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-extrabold uppercase tracking-wider transition-all ${
                      theme === 'light' ? 'bg-white text-black' : 'text-white/60 hover:text-white'
                    }`}
                  >
                    <Sun size={14} /> Light
                  </button>
                </div>
              </div>

              <div className="border-t border-white/10" />

              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-white">High Contrast Studio UI</h3>
                  <p className="text-xs text-white/50 mt-0.5">
                    Optimizes UI borders and typography contrast for dark studio settings.
                  </p>
                </div>
                <button
                  onClick={() => {
                    updateSetting('highContrast', !settings.highContrast);
                    triggerNotification(`High Contrast UI turned ${!settings.highContrast ? 'ON' : 'OFF'}`);
                  }}
                  className={`px-4 py-2 text-xs font-extrabold uppercase tracking-wider border transition-all ${
                    settings.highContrast
                      ? 'bg-cyan-600 border-cyan-400 text-white'
                      : 'bg-[#262626] border-white/20 text-white/60'
                  }`}
                >
                  {settings.highContrast ? 'Enabled' : 'Disabled'}
                </button>
              </div>

              <div className="pt-4 border-t border-white/10 text-xs text-white/60 leading-relaxed">
                <p>
                  Skedio processes image adjustments and edge detection with the browser's Canvas 2D API, and
                  handles zoom, pan and rotation with hardware-accelerated CSS transforms, so gestures stay
                  smooth up to 500% zoom.
                </p>
              </div>
            </div>
          )}

          {/* PROJECTS SECTION */}
          {activeSection === 'projects' && (
            <div className="bg-[#181818] border border-white/10 p-6 shadow-xl space-y-6 animate-fade-in">
              <div className="flex items-center gap-3 text-amber-400 border-b border-white/10 pb-3">
                <Database size={22} />
                <h2 className="text-base font-bold text-white uppercase tracking-wide">
                  Storage & Data Management
                </h2>
              </div>

              {/* CATEGORY MANAGEMENT */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Tag size={16} className="text-amber-400" />
                  <h3 className="text-sm font-bold text-white">Manage Categories</h3>
                </div>
                <p className="text-xs text-white/50 mb-3">
                  Create your own categories to organize artwork. Pin favorites so they
                  always appear first. Swipe, drag, or scroll to browse them all.
                </p>

                <div className="flex items-center gap-2 mb-3">
                  <input
                    type="text"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newCategory.trim()) {
                        onAddCategory(newCategory.trim());
                        triggerNotification(`Category "${newCategory.trim()}" added`);
                        setNewCategory('');
                      }
                    }}
                    placeholder="New category name..."
                    className="flex-1 bg-[#121212] border border-white/25 px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-white"
                  />
                  <button
                    onClick={() => {
                      if (newCategory.trim()) {
                        onAddCategory(newCategory.trim());
                        triggerNotification(`Category "${newCategory.trim()}" added`);
                        setNewCategory('');
                      }
                    }}
                    className="flex items-center gap-1.5 bg-white text-black font-extrabold text-xs uppercase tracking-wider px-4 py-2.5 shrink-0 hover:bg-white/90"
                  >
                    <Plus size={14} /> Add
                  </button>
                </div>

                {categories.length === 0 ? (
                  <p className="text-xs text-white/40 italic">No categories yet.</p>
                ) : (
                  <DragScroll fade="card" className="pb-1">
                    <div className="flex items-center gap-2 w-max">
                      {categories.map((cat) => (
                        <span
                          key={cat}
                          className={`flex items-center gap-1.5 border px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white shrink-0 ${
                            pinnedCategories.includes(cat)
                              ? 'bg-[#2e2e2e] border-amber-400/50'
                              : 'bg-[#262626] border-white/15'
                          }`}
                        >
                          {pinnedCategories.includes(cat) && (
                            <Pin size={11} className="text-amber-400 fill-amber-400 shrink-0" />
                          )}
                          {cat}
                          <button
                            onClick={() => {
                              onTogglePinCategory(cat);
                              triggerNotification(
                                pinnedCategories.includes(cat)
                                  ? `Unpinned "${cat}"`
                                  : `Pinned "${cat}"`
                              );
                            }}
                            className="text-white/50 hover:text-amber-400"
                            aria-label={
                              pinnedCategories.includes(cat)
                                ? `Unpin category ${cat}`
                                : `Pin category ${cat}`
                            }
                          >
                            {pinnedCategories.includes(cat) ? <PinOff size={13} /> : <Pin size={13} />}
                          </button>
                          <button
                            onClick={() => {
                              onDeleteCategory(cat);
                              triggerNotification(`Category "${cat}" removed`);
                            }}
                            className="text-white/50 hover:text-rose-400"
                            aria-label={`Delete category ${cat}`}
                          >
                            <X size={13} />
                          </button>
                        </span>
                      ))}
                    </div>
                  </DragScroll>
                )}
              </div>

              {/* BACKUP & RESTORE */}
              <div className="pt-6 border-t border-white/10">
                <div className="flex items-center gap-2 mb-2">
                  <HardDriveDownload size={16} className="text-cyan-400" />
                  <h3 className="text-sm font-bold text-white uppercase tracking-wide">Backup &amp; Restore</h3>
                </div>
                <p className="text-xs text-white/50 mb-4">
                  Export everything — projects, categories, covers, favorites, pinned
                  categories, statistics, and preferences — into a single{' '}
                  <span className="font-mono text-white/70">.skedio</span> file. Works fully
                  offline; nothing is uploaded to any server.
                </p>

                <input
                  ref={restoreInputRef}
                  type="file"
                  accept=".skedio,application/json"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleRestoreFileSelected(e.target.files[0]);
                    }
                    e.target.value = '';
                  }}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    onClick={handleCreateBackup}
                    disabled={isBackingUp}
                    className="flex items-center justify-center gap-2 bg-white text-black font-extrabold text-xs uppercase tracking-wider py-3 px-4 hover:bg-white/90 disabled:opacity-60 transition-colors"
                  >
                    <Download size={16} /> {isBackingUp ? 'Creating…' : '📤 Create Backup'}
                  </button>
                  <button
                    onClick={() => restoreInputRef.current?.click()}
                    className="flex items-center justify-center gap-2 bg-[#262626] border border-white/20 text-white font-extrabold text-xs uppercase tracking-wider py-3 px-4 hover:bg-[#333] transition-colors"
                  >
                    <Upload size={16} /> 📥 Restore Backup
                  </button>
                </div>

                {restoreError && (
                  <div className="mt-3 flex items-center gap-2 bg-rose-950/80 border border-rose-500/40 p-3 text-rose-200 text-xs">
                    <AlertTriangle size={16} className="shrink-0 text-rose-400" />
                    <span>{restoreError}</span>
                  </div>
                )}

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="bg-[#121212] border border-white/10 p-3">
                    <span className="text-white/40 uppercase block text-[10px] mb-1 font-bold">Last Backup</span>
                    <span className="text-sm font-bold text-white">
                      {backupMeta ? formatBackupDate(backupMeta.lastBackupAt) : 'Never'}
                    </span>
                  </div>
                  <div className="bg-[#121212] border border-white/10 p-3">
                    <span className="text-white/40 uppercase block text-[10px] mb-1 font-bold">Backup Size</span>
                    <span className="text-sm font-bold text-white">
                      {backupMeta ? formatBytes(backupMeta.sizeBytes) : '—'}
                    </span>
                  </div>
                  <div className="bg-[#121212] border border-white/10 p-3">
                    <span className="text-white/40 uppercase block text-[10px] mb-1 font-bold">Projects In Backup</span>
                    <span className="text-sm font-bold text-white">
                      {backupMeta ? backupMeta.projectCount : '—'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-rose-400">Clear All Saved Projects</h3>
                  <p className="text-xs text-white/50 mt-0.5">
                    Permanently deletes all saved tracing projects and frees up IndexedDB storage.
                  </p>
                </div>
                <button
                  onClick={() => setShowConfirmClear(true)}
                  className="flex items-center gap-2 bg-rose-950/80 hover:bg-rose-900 border border-rose-500/40 text-rose-300 font-bold text-xs uppercase tracking-wider px-4 py-2.5 shrink-0"
                >
                  <Trash2 size={14} /> Clear Storage
                </button>
              </div>
            </div>
          )}

          {/* STORAGE SECTION */}
          {activeSection === 'storage' && (
            <div className="bg-[#181818] border border-white/10 p-6 shadow-xl space-y-6 animate-fade-in">
              <div className="flex items-center gap-3 text-cyan-400 border-b border-white/10 pb-3">
                <HardDrive size={22} />
                <h2 className="text-base font-bold text-white uppercase tracking-wide">
                  Storage Information
                </h2>
              </div>
              <p className="text-xs text-white/50">
                Everything is stored locally on your device. Nothing is uploaded to any server.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-[#121212] border border-white/10 p-4">
                  <span className="text-white/40 uppercase block text-[10px] mb-1 font-bold">Projects</span>
                  <span className="text-xl font-black text-white">
                    {storageInfo ? storageInfo.projectCount : '—'}
                  </span>
                </div>
                <div className="bg-[#121212] border border-white/10 p-4">
                  <span className="text-white/40 uppercase block text-[10px] mb-1 font-bold">Categories</span>
                  <span className="text-xl font-black text-white">
                    {storageInfo ? storageInfo.categoryCount : '—'}
                  </span>
                </div>
                <div className="bg-[#121212] border border-white/10 p-4">
                  <span className="text-white/40 uppercase block text-[10px] mb-1 font-bold">Images</span>
                  <span className="text-xl font-black text-white">
                    {storageInfo ? storageInfo.imageCount : '—'}
                  </span>
                </div>
                <div className="bg-[#121212] border border-white/10 p-4">
                  <span className="text-white/40 uppercase block text-[10px] mb-1 font-bold">Storage Used</span>
                  <span className="text-xl font-black text-white">
                    {storageInfo ? formatStorageBytes(storageInfo.usageBytes) : '—'}
                  </span>
                </div>
              </div>

              <button
                onClick={refreshStorage}
                disabled={refreshingStorage}
                className="flex items-center justify-center gap-2 bg-white text-black font-extrabold text-xs uppercase tracking-wider py-3 px-4 hover:bg-white/90 disabled:opacity-60 w-full sm:w-auto"
              >
                <RefreshCw size={16} className={refreshingStorage ? 'animate-spin' : ''} />
                {refreshingStorage ? 'Refreshing…' : 'Refresh Storage Information'}
              </button>
            </div>
          )}

          {/* PRIVACY POLICY SECTION */}
          {activeSection === 'privacy' && (
            <div className="bg-[#181818] border border-white/10 p-6 shadow-xl space-y-6 animate-fade-in">
              <div className="flex items-center gap-3 text-emerald-400 border-b border-white/10 pb-3">
                <ShieldCheck size={22} />
                <h2 className="text-base font-bold text-white uppercase tracking-wide">
                  Privacy Policy
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {PRIVACY_POLICY_ITEMS.map((item) => (
                  <div
                    key={item.title}
                    className="flex items-start gap-3 bg-[#121212] border border-white/10 p-4"
                  >
                    <span className="text-xl leading-none shrink-0" aria-hidden="true">{item.emoji}</span>
                    <div>
                      <h3 className="text-sm font-bold text-white">{item.title}</h3>
                      <p className="text-xs text-white/60 mt-0.5 leading-relaxed">{item.text}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-sm italic text-white/70 leading-relaxed border-t border-white/10 pt-4">
                "Skedio was built to provide a simple, private, and distraction-free tracing experience. Your artwork belongs to you and stays on your device."
              </p>
            </div>
          )}

          {/* ABOUT SECTION */}
          {activeSection === 'about' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-[#181818] border border-white/10 p-6 shadow-xl space-y-4">
                <div className="flex items-center gap-3 text-purple-400 border-b border-white/10 pb-3">
                  <Info size={22} />
                  <h2 className="text-base font-bold text-white uppercase tracking-wide">
                    About Skedio
                  </h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="bg-[#121212] border border-white/10 p-3.5">
                    <span className="text-white/40 uppercase block text-[10px] mb-1 font-bold">App Name</span>
                    <span className="text-sm font-extrabold text-white">Skedio</span>
                  </div>
                  <div className="bg-[#121212] border border-white/10 p-3.5">
                    <span className="text-white/40 uppercase block text-[10px] mb-1 font-bold">App Version</span>
                    <span className="text-sm font-extrabold text-white">{SKEDIO_APP_VERSION}</span>
                  </div>
                  <div className="bg-[#121212] border border-white/10 p-3.5">
                    <span className="text-white/40 uppercase block text-[10px] mb-1 font-bold">Developer</span>
                    <span className="text-sm font-extrabold text-white">{DEVELOPER_NAME}</span>
                  </div>
                  <div className="bg-[#121212] border border-white/10 p-3.5">
                    <span className="text-white/40 uppercase block text-[10px] mb-1 font-bold">Contact Email</span>
                    <a href={`mailto:${CONTACT_EMAIL}`} className="text-sm font-extrabold text-cyan-400 break-all hover:underline">
                      {CONTACT_EMAIL}
                    </a>
                  </div>
                  <div className="bg-[#121212] border border-white/10 p-3.5">
                    <span className="text-white/40 uppercase block text-[10px] mb-1 font-bold">Target Platform</span>
                    <span className="text-sm font-extrabold text-cyan-400">Android 10+ / Chrome PWA / Tablet</span>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/10 space-y-3 text-xs">
                  <div>
                    <h3 className="font-bold text-white uppercase flex items-center gap-1.5 mb-1 text-amber-400">
                      <Info size={14} /> Purpose of the App
                    </h3>
                    <p className="text-white/60 leading-relaxed">
                      Skedio turns any phone or tablet into a light box, letting artists import a reference
                      image, refine it with edge detection and opacity controls, and trace it directly onto
                      paper — with precision ruler, protractor, and perspective guides. Simple, private, and
                      completely offline.
                    </p>
                  </div>
                  <div>
                    <h3 className="font-bold text-white uppercase flex items-center gap-1.5 mb-1 text-white/70">
                      <Copyright size={14} /> Copyright
                    </h3>
                    <p className="text-white/60 leading-relaxed">{COPYRIGHT}</p>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/10 space-y-3 text-xs">
                  <div>
                    <h3 className="font-bold text-white uppercase flex items-center gap-1.5 mb-1 text-emerald-400">
                      <Lock size={14} /> Privacy Policy
                    </h3>
                    <p className="text-white/60 leading-relaxed">
                      Skedio operates completely offline on your device. We do not collect personal identifiers, device diagnostics, artwork images, or usage data. Your artwork resides locally within your browser's IndexedDB partition and is never shared or transmitted over network sockets.
                    </p>
                  </div>

                  <div>
                    <h3 className="font-bold text-white uppercase flex items-center gap-1.5 mb-1 text-purple-400">
                      <Award size={14} /> Open Source & Third-Party Licenses
                    </h3>
                    <p className="text-white/60 leading-relaxed">
                      Licensed under MIT. Built with React 19, Tailwind CSS, Lucide Icons, and the browser's
                      built-in HTML5 Canvas 2D API for image processing.
                    </p>
                  </div>
                </div>
              </div>

              {/* WHY I CREATED SKEDIO */}
              <div className="bg-[#181818] border border-white/10 p-6 shadow-xl space-y-4">
                <div className="flex items-center gap-3 text-rose-400 border-b border-white/10 pb-3">
                  <HelpCircle size={22} />
                  <h2 className="text-base font-bold text-white uppercase tracking-wide">
                    Why I Created Skedio
                  </h2>
                </div>
                <div className="bg-[#121212] border border-white/10 p-5 space-y-4 text-sm text-white/70 leading-relaxed">
                  <p>
                    I am a high school student and an amateur artist who created Skedio after becoming frustrated with other tracing apps.
                  </p>
                  <p>
                    When I first started drawing, I wanted a simple way to trace images on paper and improve my skills. Most tracing apps I tried were filled with advertisements, difficult to use, and sometimes even closed while I was tracing because I accidentally touched the screen for too long. That meant I often had to start over from the beginning.
                  </p>
                  <p>
                    I created Skedio to provide a clean, simple, and free tracing experience so that other artists and beginners would not have to deal with the same frustrations I experienced.
                  </p>
                  <p className="font-bold text-white">
                    This app was built by an artist, for artists.
                  </p>
                </div>
              </div>

              {/* PRIVACY & SECURITY */}
              <div className="bg-[#181818] border border-white/10 p-6 shadow-xl space-y-4">
                <div className="flex items-center gap-3 text-emerald-400 border-b border-white/10 pb-3">
                  <Shield size={22} />
                  <h2 className="text-base font-bold text-white uppercase tracking-wide">
                    Privacy & Security
                  </h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {PRIVACY_ITEMS.map((item) => (
                    <div
                      key={item.title}
                      className="flex items-start gap-3 bg-[#121212] border border-white/10 p-4"
                    >
                      <span className="text-xl leading-none shrink-0" aria-hidden="true">{item.emoji}</span>
                      <div>
                        <h3 className="text-sm font-bold text-white">{item.title}</h3>
                        <p className="text-xs text-white/60 mt-0.5 leading-relaxed">{item.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-sm italic text-white/70 leading-relaxed border-t border-white/10 pt-4">
                  "Skedio was built to provide a simple, private, and distraction-free tracing experience. Your artwork belongs to you and stays on your device."
                </p>
              </div>

              {/* AUTOMATIC CHANGELOG */}
              <div className="bg-[#181818] border border-white/10 p-6 shadow-xl space-y-4">
                <div className="flex items-center gap-3 text-amber-400 border-b border-white/10 pb-3">
                  <History size={22} />
                  <h2 className="text-base font-bold text-white uppercase tracking-wide">
                    Changelog & Version Updates
                  </h2>
                </div>

                {CHANGELOG_HISTORY.length === 0 ? (
                  <div className="bg-[#121212] border border-white/10 p-6 text-center text-xs text-white/50">
                    No version updates yet. New releases will appear here when published.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {CHANGELOG_HISTORY.map((log, idx) => (
                      <div key={idx} className="bg-[#121212] border border-white/10 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-black uppercase tracking-wider text-rose-400">
                            {log.version}
                          </span>
                          <span className="text-[10px] text-white/40">{log.date}</span>
                        </div>
                        <ul className="list-disc list-inside space-y-1 text-xs text-white/70">
                          {log.changes.map((item, itemIdx) => (
                            <li key={itemIdx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* CONFIRM RESTORE MODAL */}
        {pendingRestore && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-[#181818] border border-white/20 p-6 shadow-2xl animate-fade-in">
              <div className="flex items-center gap-3 text-amber-400 mb-3">
                <AlertTriangle size={24} />
                <h3 className="text-lg font-bold text-white">Restore This Backup?</h3>
              </div>
              <p className="text-sm text-white/70 mb-4">
                Restoring will <span className="font-bold text-white">replace your current data</span>{' '}
                with the contents of this backup. This cannot be undone.
              </p>
              <div className="bg-[#121212] border border-white/10 p-3 text-xs text-white/60 space-y-1 mb-4">
                <div className="flex justify-between">
                  <span>Created</span>
                  <span className="text-white font-bold">{formatBackupDate(pendingRestore.createdAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Projects</span>
                  <span className="text-white font-bold">{pendingRestore.data.projects.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>App Version</span>
                  <span className="text-white font-bold">{pendingRestore.appVersion}</span>
                </div>
              </div>
              {restoreWouldLoseNewerData && (
                <div className="flex items-start gap-2 bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs p-3 mb-6">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>
                    This backup looks <span className="font-bold">older</span> than what's currently on
                    this device. Restoring it will permanently discard any projects or edits made since
                    then.
                  </span>
                </div>
              )}
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setPendingRestore(null);
                    setRestoreWouldLoseNewerData(false);
                  }}
                  className="px-4 py-2 bg-[#262626] border border-white/20 text-white text-xs font-bold uppercase tracking-wider hover:bg-[#333]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmRestore}
                  className="px-4 py-2 bg-rose-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-rose-500 shadow"
                >
                  Replace &amp; Restore
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CONFIRM RESET SETTINGS MODAL */}
        {showConfirmReset && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-[#181818] border border-white/20 p-6 shadow-2xl animate-fade-in">
              <div className="flex items-center gap-3 text-amber-400 mb-3">
                <RotateCcw size={22} />
                <h3 className="text-lg font-bold text-white">Reset Settings?</h3>
              </div>
              <p className="text-sm text-white/70 mb-6">
                Reset all settings to their default values? This will not delete any projects, categories, or artwork.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowConfirmReset(false)}
                  className="px-4 py-2 bg-[#262626] border border-white/20 text-white text-xs font-bold uppercase tracking-wider hover:bg-[#333]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleResetSettings}
                  className="px-4 py-2 bg-amber-500 text-black text-xs font-bold uppercase tracking-wider hover:bg-amber-400 shadow"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CONFIRM CLEAR MODAL */}
        {showConfirmClear && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-[#181818] border border-white/20 p-6 shadow-2xl animate-fade-in">
              <h3 className="text-lg font-bold text-rose-400 mb-2">Delete All Projects?</h3>
              <p className="text-sm text-white/70 mb-6">
                Are you sure you want to delete every saved project in local storage? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowConfirmClear(false)}
                  className="px-4 py-2 bg-[#262626] border border-white/20 text-white text-xs font-bold uppercase tracking-wider hover:bg-[#333]"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onClearAllProjects();
                    setShowConfirmClear(false);
                    triggerNotification('All projects cleared.');
                  }}
                  className="px-4 py-2 bg-rose-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-rose-500 shadow"
                >
                  Clear All Data
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="text-center pt-6 text-xs text-white/30 uppercase tracking-widest font-mono">
          {SKEDIO_APP_VERSION_LABEL} • v{SKEDIO_APP_VERSION} • Made with Precision
        </div>
      </div>
    </div>
  );
};
