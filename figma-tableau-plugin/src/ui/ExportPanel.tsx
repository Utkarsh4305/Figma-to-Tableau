import type { ExportSettings } from "../shared/types";

const SIZE_PRESETS: Record<string, [number, number]> = {
  "Desktop (1280×800)": [1280, 800],
  "Wide (1600×900)": [1600, 900],
  "Laptop (1366×768)": [1366, 768],
  "Tableau Default (946×670)": [946, 670],
};

export default function ExportPanel({
  settings,
  onChange,
}: {
  settings: ExportSettings;
  onChange: (s: ExportSettings) => void;
}) {
  const set = (patch: Partial<ExportSettings>) => onChange({ ...settings, ...patch });

  const presetKey =
    Object.keys(SIZE_PRESETS).find(
      (k) => SIZE_PRESETS[k][0] === settings.layoutWidth && SIZE_PRESETS[k][1] === settings.layoutHeight
    ) ?? "Custom";

  return (
    <div>
      <h2>Export settings</h2>

      <div className="field">
        <label>Workbook name</label>
        <input
          type="text"
          value={settings.workbookName}
          onChange={(e) => set({ workbookName: e.target.value })}
        />
      </div>

      <div className="field">
        <label>Dashboard name</label>
        <input
          type="text"
          value={settings.dashboardName}
          onChange={(e) => set({ dashboardName: e.target.value })}
        />
      </div>

      <div className="field">
        <label>Tableau version</label>
        <select value={settings.tableauVersion} onChange={(e) => set({ tableauVersion: e.target.value })}>
          <option value="2026.2">2026.2 (recommended)</option>
          <option value="2025.3">2025.3</option>
        </select>
      </div>

      <div className="field">
        <label>Layout size</label>
        <select
          value={presetKey}
          onChange={(e) => {
            const p = SIZE_PRESETS[e.target.value];
            if (p) set({ layoutWidth: p[0], layoutHeight: p[1] });
          }}
        >
          {Object.keys(SIZE_PRESETS).map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
          {presetKey === "Custom" && <option value="Custom">Custom (from frame)</option>}
        </select>
      </div>

      <div className="row">
        <div className="field half">
          <label>Width (px)</label>
          <input
            type="number"
            value={settings.layoutWidth}
            onChange={(e) => set({ layoutWidth: Number(e.target.value) || 0 })}
          />
        </div>
        <div className="field half">
          <label>Height (px)</label>
          <input
            type="number"
            value={settings.layoutHeight}
            onChange={(e) => set({ layoutHeight: Number(e.target.value) || 0 })}
          />
        </div>
      </div>

      <div className="row">
        <input
          id="embed"
          type="checkbox"
          style={{ width: "auto" }}
          checked={settings.embedData}
          onChange={(e) => set({ embedData: e.target.checked })}
        />
        <label htmlFor="embed" style={{ margin: 0 }}>
          Embed placeholder data in the .twbx
        </label>
      </div>
    </div>
  );
}
