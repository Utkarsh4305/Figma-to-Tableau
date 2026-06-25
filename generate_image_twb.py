# -*- coding: utf-8 -*-
"""
Converts image.png (a generic dashboard wireframe) into a Tableau .twb.

The wireframe in image.png is a single dashboard:
    Title  : "Dashboard"          (top-left)
    Filter : "Filter 4"           (full-width bar)
    KPI    : "KPI 4"              (full-width tall tile)
    Sheets : "Sheet 3 / S3 Graph" | "Sheet 4 / S4 Graph"  (two side-by-side panels)

This is a STANDALONE script (its own CSV + datasource) so it doesn't touch the
clinical-trial generator. It reuses the proven Tableau 2026.2 construction
recipe (the <windows> section, object-graph datasource, type codes, plain
rows/cols pills, pane-level color encoding) — the only parts that make a
hand-built .twb actually OPEN in Tableau 2026.2.

Output:
  - Dashboard_Wireframe.twb
  - dashboard_sample.csv
"""
import os, csv, uuid, xml.dom.minidom as minidom

def uid():
    return "{%s}" % str(uuid.uuid4()).upper()

MANIFEST = (
    "  <document-format-change-manifest>\n"
    "    <AnimationOnByDefault />\n"
    "    <MarkAnimation />\n"
    "    <ObjectModelEncapsulateLegacy />\n"
    "    <ObjectModelTableType />\n"
    "    <SchemaViewerObjectModel />\n"
    "    <SheetIdentifierTracking />\n"
    "    <WindowsPersistSimpleIdentifiers />\n"
    "  </document-format-change-manifest>\n"
)

BASE = r"D:\wireframe"
DS_DIR = BASE.replace("\\", "/")
TWB = os.path.join(BASE, "Dashboard_Wireframe.twb")
CSV_FACT = os.path.join(BASE, "dashboard_sample.csv")

DS = "federated.dash"

# ----------------------------------------------------------------------------
# 1. FIELDS  (datatype in {string,date,integer,real})
# ----------------------------------------------------------------------------
DIMS = [("Category", "string"), ("Segment", "string")]
MEAS = [("Value", "integer"), ("Amount", "integer")]
FTYPE = {n: t for n, t in DIMS + MEAS}

# Native Tableau 2026.2 type codes (verified against an exported reference.twb)
RT2026 = {"string": 129, "date": 133, "integer": 20, "real": 5}
AGG2026 = {"string": "Count", "date": "Year", "integer": "Sum", "real": "Sum"}

# ----------------------------------------------------------------------------
# 2. SAMPLE DATA
# ----------------------------------------------------------------------------
def make_csv():
    cats = ["Alpha", "Bravo", "Charlie", "Delta", "Echo"]
    segs = ["North", "South", "East", "West"]
    header = [d for d, _ in DIMS] + [m for m, _ in MEAS]
    rows = []
    v = 30
    for i, c in enumerate(cats):
        seg = segs[i % len(segs)]
        v = (v * 7 + 13) % 90 + 20
        rows.append({"Category": c, "Segment": seg,
                     "Value": v, "Amount": (v * 3) % 120 + 15})
    with open(CSV_FACT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=header)
        w.writeheader()
        w.writerows(rows)

# ----------------------------------------------------------------------------
# 3. XML HELPERS
# ----------------------------------------------------------------------------
def esc(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace("'", "&apos;").replace('"', "&quot;"))

def inst_name(field, datatype, role):
    if role == "measure":
        return f"[sum:{field}:qk]"
    return f"[none:{field}:nk]"

def dep_block(ds, fields):
    """ALL <column> first, THEN all <column-instance> (2026.2 order)."""
    out = [f"        <datasource-dependencies datasource='{ds}'>\n"]
    for name, datatype, role in fields:
        ttype = "quantitative" if role == "measure" else "nominal"
        out.append(f"          <column datatype='{datatype}' name='[{name}]' role='{role}' type='{ttype}' />\n")
    for name, datatype, role in fields:
        ttype = "quantitative" if role == "measure" else "nominal"
        der = "Sum" if role == "measure" else "None"
        iname = inst_name(name, datatype, role)
        out.append(f"          <column-instance column='[{name}]' derivation='{der}' "
                   f"name='{iname}' pivot='key' type='{ttype}' />\n")
    out.append("        </datasource-dependencies>\n")
    return "".join(out)

# ----------------------------------------------------------------------------
# 4. WORKSHEET BUILDER
# ----------------------------------------------------------------------------
def worksheet(name, ds, ds_caption, kind, dim, dimtype, meas):
    """kind: bar | line.  Plain rows/cols pills + pane-level color encoding."""
    deps = [(dim, dimtype, "dimension"), (meas, FTYPE[meas], "measure")]
    cols = f"[{ds}].{inst_name(dim, dimtype, 'dimension')}"
    rows = f"[{ds}].{inst_name(meas, FTYPE[meas], 'measure')}"
    if kind == "bar":
        mark = "Bar"
        color_inst = cols
    else:  # line — single connected trend, no color (would segment it)
        mark = "Line"
        color_inst = None

    x = []
    x.append(f"    <worksheet name='{esc(name)}'>\n")
    x.append("      <table>\n")
    x.append("        <view>\n")
    x.append("          <datasources>\n")
    x.append(f"            <datasource caption='{esc(ds_caption)}' name='{ds}' />\n")
    x.append("          </datasources>\n")
    x.append(dep_block(ds, deps))
    x.append("          <aggregation value='true' />\n")
    x.append("        </view>\n")
    x.append("        <style />\n")
    x.append("        <panes>\n")
    x.append("          <pane selection-relaxation-option='selection-relaxation-allow'>\n")
    x.append("            <view>\n              <breakdown value='auto' />\n            </view>\n")
    x.append(f"            <mark class='{mark}' />\n")
    if color_inst:
        x.append("            <encodings>\n")
        x.append(f"              <color column='{color_inst}' />\n")
        x.append("            </encodings>\n")
    x.append("          </pane>\n")
    x.append("        </panes>\n")
    x.append(f"        <rows>{rows}</rows>\n")
    x.append(f"        <cols>{cols}</cols>\n")
    x.append("      </table>\n")
    x.append(f"      <simple-id uuid='{uid()}' />\n")
    x.append("    </worksheet>\n")
    return "".join(x)

# ----------------------------------------------------------------------------
# 5. STYLING — tokens matched to image.png (periwinkle bg, lavender cards)
# ----------------------------------------------------------------------------
PAGE_BG   = "#7B7FEB"   # periwinkle/purple canvas
PAGE_BC   = "#3A3F9E"   # dark blue outer border
CARD_BG   = "#FFFFFF"   # white filter / KPI cards (matches image (1).png)
CARD_BC   = "#D7DAEC"   # subtle light border
SHEET_BG  = "#FFFFFF"   # white sheet panels (matches image (1).png)
SHEET_BC  = "#D7DAEC"
INK       = "#101828"
MUTED     = "#3A3F6B"
FONT      = "Segoe UI"

def run(text, bold=False, size=12, color=None, font=None, align=None):
    a = ""
    if bold: a += " bold='true'"
    if size: a += f" fontsize='{size}'"
    if color: a += f" fontcolor='{color}'"
    if font: a += f" fontname='{font}'"
    if align: a += f" fontalignment='{align}'"
    return f"<run{a}>{text}</run>"

def zone_style(bg=None, bc="#000000", bs="none", bw="0", margin="4", padding=None):
    s = ["          <zone-style>\n"]
    s.append(f"            <format attr='border-color' value='{bc}' />\n")
    s.append(f"            <format attr='border-style' value='{bs}' />\n")
    s.append(f"            <format attr='border-width' value='{bw}' />\n")
    s.append(f"            <format attr='margin' value='{margin}' />\n")
    if padding: s.append(f"            <format attr='padding' value='{padding}' />\n")
    if bg: s.append(f"            <format attr='background-color' value='{bg}' />\n")
    s.append("          </zone-style>\n")
    return "".join(s)

def text_zone(zid, x, y, w, h, runs, bg=None, bc="#000000", bs="none", bw="0", padding="8"):
    s = [f"        <zone h='{h}' id='{zid}' type-v2='text' w='{w}' x='{x}' y='{y}'>\n"]
    s.append("          <formatted-text>\n")
    for r in runs:
        s.append("            " + r + "\n")
    s.append("          </formatted-text>\n")
    s.append(zone_style(bg, bc, bs, bw, "3", padding))
    s.append("        </zone>\n")
    return "".join(s)

def sheet_zone(zid, name, x, y, w, h):
    s = [f"        <zone h='{h}' id='{zid}' name='{esc(name)}' w='{w}' x='{x}' y='{y}'>\n"]
    s.append(zone_style(SHEET_BG, SHEET_BC, "solid", "1", "4", "6"))
    s.append("        </zone>\n")
    return "".join(s)

# ----------------------------------------------------------------------------
# 6. THE DASHBOARD — layout mirrors image.png proportions
# ----------------------------------------------------------------------------
# Worksheet names carry the panel labels from the image.
WS_S3 = "Sheet 3"   # "S3 Graph"
WS_S4 = "Sheet 4"   # "S4 Graph"
DASH_NAME = "Dashboard"

def dashboard_zones():
    zid = [2]
    def nid():
        zid[0] += 1
        return zid[0]

    MARGIN = 2000
    GAP = 1800
    CONTENT_W = 100000 - 2 * MARGIN

    TITLE_H  = 6000
    FILTER_H = 9000
    KPI_H    = 17000
    y_title  = MARGIN
    y_filter = y_title + TITLE_H + GAP
    y_kpi    = y_filter + FILTER_H + GAP
    y_sheets = y_kpi + KPI_H + GAP
    SHEETS_H = (100000 - MARGIN) - y_sheets

    z = ["        <zones>\n"]
    root = nid()
    z.append(f"          <zone h='100000' id='{root}' type-v2='layout-basic' w='100000' x='0' y='0'>\n")

    # --- title "Dashboard" (transparent, on the purple canvas) ---
    z.append(text_zone(nid(), MARGIN, y_title, CONTENT_W, TITLE_H, [
        run("Dashboard", bold=True, size=22, color=INK, font=FONT),
    ], bg=None, bc="#000000", bs="none", bw="0", padding="6"))

    # --- "Filter 4" bar (full width, centered text) ---
    z.append(text_zone(nid(), MARGIN, y_filter, CONTENT_W, FILTER_H, [
        run("Filter 4", size=15, color=INK, font=FONT, align=1),
    ], bg=CARD_BG, bc=CARD_BC, bs="solid", bw="1", padding="14"))

    # --- "KPI 4" tile (full width, tall, centered) ---
    z.append(text_zone(nid(), MARGIN, y_kpi, CONTENT_W, KPI_H, [
        run("KPI 4", size=16, color=INK, font=FONT, align=1),
    ], bg=CARD_BG, bc=CARD_BC, bs="solid", bw="1", padding="14"))

    # --- two sheet panels side by side: Sheet 3 | Sheet 4 ---
    sheet_w = (CONTENT_W - GAP) // 2
    sheet_w2 = (MARGIN + CONTENT_W) - (MARGIN + sheet_w + GAP)
    z.append(sheet_zone(nid(), WS_S3, MARGIN, y_sheets, sheet_w, SHEETS_H))
    z.append(sheet_zone(nid(), WS_S4, MARGIN + sheet_w + GAP, y_sheets, sheet_w2, SHEETS_H))

    # page background (the periwinkle canvas + dark outer border)
    z.append(zone_style(PAGE_BG, PAGE_BC, "solid", "2", "8"))
    z.append("        </zone>\n        </zones>\n")
    return "".join(z)

def dashboard():
    x = [f"    <dashboard name='{esc(DASH_NAME)}'>\n"]
    x.append("      <style />\n")
    x.append("      <size maxheight='670' maxwidth='946' minheight='670' minwidth='946' />\n")
    x.append(dashboard_zones())
    x.append(f"      <simple-id uuid='{uid()}' />\n")
    x.append("    </dashboard>\n")
    return "".join(x)

# ----------------------------------------------------------------------------
# 7. DATASOURCE (2026.2 object-model format)
# ----------------------------------------------------------------------------
def native_datasource(caption, dsname, connname, filename, cols):
    base = filename[:-4] if filename.lower().endswith(".csv") else filename
    relname = filename
    parent = f"[{relname}]"
    table = f"[{base}#csv]"
    objid = f"{relname}_{uuid.uuid4().hex.upper()}"
    objid_b = f"[{objid}]"

    def relation_columns(indent):
        o = [f"{indent}<columns character-set='UTF-8' header='yes' locale='en_US' separator=','>\n"]
        for i, (n, dt) in enumerate(cols):
            o.append(f"{indent}  <column datatype='{dt}' name='{n}' ordinal='{i}' />\n")
        o.append(f"{indent}</columns>\n")
        return "".join(o)

    x = []
    x.append(f"    <datasource caption='{esc(caption)}' inline='true' name='{dsname}' version='18.1'>\n")
    x.append("      <connection class='federated'>\n")
    x.append("        <named-connections>\n")
    x.append(f"          <named-connection caption='{esc(base)}' name='{connname}'>\n")
    x.append(f"            <connection class='textscan' directory='{DS_DIR}' filename='{filename}' password='' server='' />\n")
    x.append("          </named-connection>\n")
    x.append("        </named-connections>\n")
    x.append(f"        <relation connection='{connname}' name='{relname}' table='{table}' type='table'>\n")
    x.append(relation_columns("          "))
    x.append("        </relation>\n")
    x.append("        <metadata-records>\n")
    x.append("          <metadata-record class='capability'>\n")
    x.append("            <remote-name />\n            <remote-type>0</remote-type>\n")
    x.append(f"            <parent-name>{parent}</parent-name>\n")
    x.append("            <remote-alias />\n            <aggregation>Count</aggregation>\n            <contains-null>true</contains-null>\n")
    x.append("            <attributes>\n")
    x.append("              <attribute datatype='string' name='character-set'>&quot;UTF-8&quot;</attribute>\n")
    x.append("              <attribute datatype='string' name='collation'>&quot;en_US&quot;</attribute>\n")
    x.append("              <attribute datatype='string' name='field-delimiter'>&quot;,&quot;</attribute>\n")
    x.append("              <attribute datatype='string' name='header-row'>&quot;true&quot;</attribute>\n")
    x.append("              <attribute datatype='string' name='locale'>&quot;en_US&quot;</attribute>\n")
    x.append("              <attribute datatype='string' name='single-char'>&quot;&quot;</attribute>\n")
    x.append("            </attributes>\n")
    x.append("          </metadata-record>\n")
    for i, (n, dt) in enumerate(cols):
        x.append("          <metadata-record class='column'>\n")
        x.append(f"            <remote-name>{n}</remote-name>\n")
        x.append(f"            <remote-type>{RT2026[dt]}</remote-type>\n")
        x.append(f"            <local-name>[{n}]</local-name>\n")
        x.append(f"            <parent-name>{parent}</parent-name>\n")
        x.append(f"            <remote-alias>{n}</remote-alias>\n")
        x.append(f"            <ordinal>{i}</ordinal>\n")
        x.append(f"            <local-type>{dt}</local-type>\n")
        x.append(f"            <aggregation>{AGG2026[dt]}</aggregation>\n")
        if dt == "string":
            x.append("            <scale>1</scale>\n            <width>1073741823</width>\n")
        x.append("            <contains-null>true</contains-null>\n")
        if dt == "string":
            x.append("            <collation flag='0' name='LEN_RGB' />\n")
        x.append(f"            <object-id>{objid_b}</object-id>\n")
        x.append("          </metadata-record>\n")
    x.append("        </metadata-records>\n")
    x.append("      </connection>\n")
    x.append("      <aliases enabled='yes' />\n")
    for n, dt in cols:
        if dt in ("integer", "real"):
            x.append(f"      <column caption='{esc(n)}' datatype='{dt}' name='[{n}]' role='measure' type='quantitative' />\n")
        elif dt == "date":
            x.append(f"      <column caption='{esc(n)}' datatype='date' name='[{n}]' role='dimension' type='ordinal' />\n")
        else:
            x.append(f"      <column caption='{esc(n)}' datatype='string' name='[{n}]' role='dimension' type='nominal' />\n")
    x.append(f"      <column caption='{esc(relname)}' datatype='table' "
             f"name='[__tableau_internal_object_id__].{objid_b}' role='measure' type='quantitative' />\n")
    x.append("      <layout dim-ordering='alphabetic' measure-ordering='alphabetic' show-structure='true' />\n")
    x.append("      <object-graph>\n        <objects>\n")
    x.append(f"          <object caption='{esc(relname)}' id='{objid}'>\n")
    x.append("            <properties context=''>\n")
    x.append(f"              <relation connection='{connname}' name='{relname}' table='{table}' type='table'>\n")
    x.append(relation_columns("                "))
    x.append("              </relation>\n")
    x.append("            </properties>\n          </object>\n")
    x.append("        </objects>\n      </object-graph>\n")
    x.append("    </datasource>\n")
    return "".join(x)

WS_CARDS = (
    "      <cards>\n"
    "        <edge name='left'>\n"
    "          <strip size='160'>\n"
    "            <card type='pages' />\n"
    "            <card type='filters' />\n"
    "            <card type='marks' />\n"
    "          </strip>\n"
    "        </edge>\n"
    "        <edge name='top'>\n"
    "          <strip size='2147483647'>\n"
    "            <card type='columns' />\n"
    "          </strip>\n"
    "          <strip size='2147483647'>\n"
    "            <card type='rows' />\n"
    "          </strip>\n"
    "          <strip size='30'>\n"
    "            <card type='title' />\n"
    "          </strip>\n"
    "        </edge>\n"
    "      </cards>\n"
)

def windows_section(ws_names, dash_name, sheets):
    x = ["  <windows source-height='44'>\n"]
    for nm in ws_names:
        x.append(f"    <window class='worksheet' name='{esc(nm)}'>\n")
        x.append(WS_CARDS)
        x.append(f"      <simple-id uuid='{uid()}' />\n")
        x.append("    </window>\n")
    x.append(f"    <window class='dashboard' name='{esc(dash_name)}'>\n")
    x.append("      <viewpoints>\n")
    for s in sheets:
        x.append(f"        <viewpoint name='{esc(s)}' />\n")
    x.append("      </viewpoints>\n")
    x.append("      <active id='-1' />\n")
    x.append(f"      <simple-id uuid='{uid()}' />\n")
    x.append("    </window>\n")
    x.append("  </windows>\n")
    return "".join(x)

# ----------------------------------------------------------------------------
# 8. ASSEMBLE
# ----------------------------------------------------------------------------
def build():
    make_csv()

    ws = [
        worksheet(WS_S3, DS, "Dashboard Sample", "bar",
                  dim="Category", dimtype="string", meas="Value"),
        worksheet(WS_S4, DS, "Dashboard Sample", "bar",
                  dim="Segment", dimtype="string", meas="Amount"),
    ]
    ws_names = [WS_S3, WS_S4]

    out = []
    out.append("<?xml version='1.0' encoding='utf-8' ?>\n")
    out.append("<workbook original-version='18.1' source-build='2026.2.0 (20262.26.0603.1643)' "
               "source-platform='win' version='18.1' xmlns:user='http://www.tableausoftware.com/xml/user'>\n")
    out.append(MANIFEST)
    out.append("  <preferences>\n    <preference name='ui.encoding.shelf.height' value='24' />\n"
               "    <preference name='ui.shelf.height' value='26' />\n  </preferences>\n")
    out.append("  <datasources>\n")
    out.append(native_datasource("Dashboard Sample", DS, "textscan.dash",
                                 "dashboard_sample.csv", DIMS + MEAS))
    out.append("  </datasources>\n")
    out.append("  <worksheets>\n")
    out.extend(ws)
    out.append("  </worksheets>\n")
    out.append("  <dashboards>\n")
    out.append(dashboard())
    out.append("  </dashboards>\n")
    out.append(windows_section(ws_names, DASH_NAME, ws_names))
    out.append("</workbook>\n")

    xml = "".join(out)
    minidom.parseString(xml)   # well-formedness only (won't catch load errors)
    with open(TWB, "w", encoding="utf-8") as f:
        f.write(xml)
    print("OK wrote", TWB, "(%d bytes)" % len(xml))
    print("Worksheets:", len(ws), "Dashboards: 1")

if __name__ == "__main__":
    build()
