import { useEffect, useRef, useState, useCallback } from "react";
import type { UiToPlugin } from "../shared/types";

function toPlugin(msg: UiToPlugin) {
  parent.postMessage({ pluginMessage: msg }, "*");
}

export function useExportConfig() {
  const [layoutMode, setLayoutMode] = useState<"floating" | "tiled" | "image">("floating");
  const layoutModeRef = useRef(layoutMode);
  layoutModeRef.current = layoutMode;

  const [includeBg, setIncludeBg] = useState(false);
  const includeBgRef = useRef(includeBg);
  includeBgRef.current = includeBg;

  return {
    layoutMode, setLayoutMode, layoutModeRef,
    includeBg, setIncludeBg, includeBgRef,
  };
}

export function useWindowSize(tab: string) {
  const resizingRef = useRef(false);
  const currentSizeRef = useRef<{ w: number; h: number }>({ w: 420, h: 580 });

  const saveUiState = useRef(createUiSaver());

  const resizeHandle = (
    <div
      className="resize-handle"
      title="Drag to resize the plugin window"
      onPointerDown={(e) => {
        e.preventDefault();
        resizingRef.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!resizingRef.current) return;
        const w = Math.round(e.clientX + 8);
        const h = Math.round(e.clientY + 8);
        currentSizeRef.current = { w, h };
        toPlugin({ type: "resize", width: w, height: h });
        saveUiState.current(w, h, tab);
      }}
      onPointerUp={(e) => {
        resizingRef.current = false;
        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ok */ }
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M7 7l10 10" />
        <path d="M7 13V7h6" />
        <path d="M17 11v6h-6" />
      </svg>
    </div>
  );

  return { resizingRef, currentSizeRef, saveUiState, resizeHandle };
}

export type Status = { kind: "ok" | "err" | "warn"; text: string } | null;

export function useToast() {
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!status || status.kind !== "ok") return;
    const timer = setTimeout(() => setStatus(null), 5000);
    return () => clearTimeout(timer);
  }, [status]);

  const toastEl = status ? (
    <div className={`toast ${status.kind}`} role="status">
      <span className="toast-icon">
        {status.kind === "ok" ? "✓" : status.kind === "err" ? "✕" : "!"}
      </span>
      <span className="toast-text">{status.text}</span>
      <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => setStatus(null)}>✕</button>
    </div>
  ) : null;

  return { status, setStatus, busy, setBusy, toastEl };
}

export function useImport() {
  const importedRef = useRef<any>(null);
  const [importedNames, setImportedNames] = useState<string[]>([]);
  const [checkedSheets, setCheckedSheets] = useState<Record<string, boolean>>({});

  const toggleSheet = useCallback((name: string) =>
    setCheckedSheets((c) => ({ ...c, [name]: !c[name] })), []);

  const allChecked = importedNames.length > 0 && importedNames.every((n) => checkedSheets[n]);

  const toggleAllSheets = useCallback(() =>
    setCheckedSheets(Object.fromEntries(importedNames.map((n) => [n, !allChecked]))),
    [importedNames, allChecked]);

  const checkedSheetNames = importedNames.filter((n) => checkedSheets[n]);

  const clearStoredImport = useCallback(() => {
    toPlugin({ type: "clear-import" });
    importedRef.current = null;
    setImportedNames([]);
    setCheckedSheets({});
  }, []);

  return {
    importedRef, importedNames, setImportedNames,
    checkedSheets, setCheckedSheets,
    toggleSheet, allChecked, toggleAllSheets,
    checkedSheetNames, clearStoredImport,
  };
}

function createUiSaver() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastW = 0, lastH = 0, lastTab = "";
  return (w: number, h: number, tab: string) => {
    lastW = w; lastH = h; lastTab = tab;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      toPlugin({
        type: "save-ui-state",
        data: { width: lastW, height: lastH, tab: lastTab as any },
      });
    }, 600);
  };
}
