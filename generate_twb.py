# -*- coding: utf-8 -*-
"""
Generates a Tableau wireframe workbook (.twb) + backing CSV data for the
Clinical Trial Analytics Platform, per the implementation plan.

v2 — sidebar removed, top-bar / card layout, refined "prod-grade" styling.
The data-source / worksheet / window construction patterns are unchanged
from the original script; only the dashboard layout + visual styling layer
(section 5/6/7) and dead nav-rail code were touched.

Output:
  - Clinical_Trial_Analytics_Wireframe.twb
  - clinical_sample.csv   (fact/dim sample data)
"""
import os, csv, random, datetime, uuid, xml.dom.minidom as minidom

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
TWB = os.path.join(BASE, "Clinical_Trial_Analytics_Wireframe.twb")
CSV_FACT = os.path.join(BASE, "clinical_sample.csv")

CLIN = "federated.clin"

# Feature toggles -- start minimal so the workbook loads, then layer back on.
INCLUDE_CALCS = True         # calculated-field columns in the data source
INCLUDE_PARAMS = False       # OFF: isolating the internal error (re-add after base loads)

# ----------------------------------------------------------------------------
# 1. FIELD DEFINITIONS
# ----------------------------------------------------------------------------
# (name, datatype, role, type)  datatype in {string,date,integer,real}
DIMS = [
    ("Study", "string"), ("Protocol", "string"), ("Region", "string"),
    ("Country", "string"), ("Site", "string"), ("Investigator", "string"),
    ("Arm", "string"), ("Subject", "string"), ("SubjectStatus", "string"),
    ("Visit", "string"), ("VisitDate", "date"),
]
MEAS = [
    ("Screened", "integer"), ("Randomized", "integer"), ("ActiveSubj", "integer"),
    ("Completed", "integer"), ("Withdrawn", "integer"), ("AECount", "integer"),
    ("SAECount", "integer"), ("SevereAEPct", "real"), ("RelatedSAE", "integer"),
    ("LabAbnormalPct", "real"), ("OutlierSubj", "integer"), ("MissingLabs", "integer"),
    ("Grade3Labs", "integer"), ("OpenQueries", "integer"), ("ClosedQueries", "integer"),
    ("QueryAgeDays", "real"), ("ResponseDays", "real"), ("VisitCompletionPct", "real"),
    ("IMVApprovalPct", "real"), ("UpcomingVisits", "integer"), ("SDVPct", "real"),
    ("SiteScore", "real"), ("DataQualityPct", "real"), ("HealthScore", "real"),
    ("EnrollTarget", "integer"), ("LabResult", "real"), ("ULN", "real"),
]
# Calculated fields: (caption, internalName, datatype, role, type, formula)
CALCS = [
    ("Enroll %", "Enroll Pct", "real", "measure", "quantitative", "SUM([Randomized]) / SUM([EnrollTarget])"),
    ("Screen Fail %", "ScreenFail Pct", "real", "measure", "quantitative", "(SUM([Screened]) - SUM([Randomized])) / SUM([Screened])"),
    ("xULN", "xULN", "real", "measure", "quantitative", "AVG([LabResult]) / AVG([ULN])"),
    ("KPI Status", "KPI Status", "string", "dimension", "nominal",
     "IF AVG([QueryAgeDays]) > 14 THEN 'crit' ELSEIF AVG([QueryAgeDays]) > 7 THEN 'warn' ELSE 'good' END"),
    ("Query Aging Bucket", "Query Aging Bucket", "string", "dimension", "ordinal",
     "IF [QueryAgeDays] <= 7 THEN '0-7d' ELSEIF [QueryAgeDays] <= 14 THEN '8-14d' "
     "ELSEIF [QueryAgeDays] <= 30 THEN '15-30d' ELSEIF [QueryAgeDays] <= 60 THEN '31-60d' ELSE '60d+' END"),
]
FTYPE = {n: t for n, t in DIMS + MEAS}

# Tableau remote-type codes by datatype (for metadata-records)
RTYPE = {"string": 130, "date": 7, "integer": 20, "real": 5}

# ----------------------------------------------------------------------------
# 2. SAMPLE DATA
# ----------------------------------------------------------------------------
def make_fact_csv():
    random.seed(7)
    sites = [
        ("Madrid 1041", "Dr. A. Reyes", "Spain", "EMEA"),
        ("Berlin 2210", "Dr. M. Schmidt", "Germany", "EMEA"),
        ("Toronto 1180", "Dr. L. Brown", "Canada", "AMER"),
        ("Tokyo 3020", "Dr. K. Sato", "Japan", "APAC"),
        ("Lyon 4015", "Dr. P. Martin", "France", "EMEA"),
        ("Boston 1502", "Dr. J. Okafor", "United States", "AMER"),
    ]
    arms = ["Arm A", "Arm B", "Arm C", "Placebo"]
    statuses = ["Active", "Completed", "Withdrawn", "Screening"]
    months = [datetime.date(2025, 9, 1) + datetime.timedelta(days=30 * i) for i in range(9)]
    header = [d for d, _ in DIMS] + [m for m, _ in MEAS]
    rows = []
    subj = 1
    for site, inv, country, region in sites:
        for vi, vdate in enumerate(months):
            arm = arms[subj % len(arms)]
            status = statuses[subj % len(statuses)]
            screened = random.randint(20, 60)
            rand = int(screened * random.uniform(0.6, 0.85))
            active = int(rand * random.uniform(0.7, 0.95))
            row = {
                "Study": "CTA-2041", "Protocol": "v4.2", "Region": region,
                "Country": country, "Site": site, "Investigator": inv, "Arm": arm,
                "Subject": f"{site.split()[-1]}-{subj:03d}", "SubjectStatus": status,
                "Visit": f"V{vi+1}", "VisitDate": vdate.isoformat(),
                "Screened": screened, "Randomized": rand, "ActiveSubj": active,
                "Completed": random.randint(0, 12), "Withdrawn": random.randint(0, 5),
                "AECount": random.randint(40, 400), "SAECount": random.randint(0, 12),
                "SevereAEPct": round(random.uniform(4, 12), 1), "RelatedSAE": random.randint(0, 5),
                "LabAbnormalPct": round(random.uniform(3, 9), 1), "OutlierSubj": random.randint(2, 12),
                "MissingLabs": random.randint(10, 80), "Grade3Labs": random.randint(0, 8),
                "OpenQueries": random.randint(20, 150), "ClosedQueries": random.randint(200, 1200),
                "QueryAgeDays": round(random.uniform(2, 16), 1), "ResponseDays": round(random.uniform(1, 4), 1),
                "VisitCompletionPct": round(random.uniform(80, 98), 1),
                "IMVApprovalPct": round(random.uniform(75, 96), 1), "UpcomingVisits": random.randint(2, 12),
                "SDVPct": round(random.uniform(70, 96), 1), "SiteScore": round(random.uniform(42, 90), 0),
                "DataQualityPct": round(random.uniform(71, 96), 1), "HealthScore": round(random.uniform(58, 90), 0),
                "EnrollTarget": 1000, "LabResult": round(random.uniform(20, 95), 1), "ULN": 55.0,
            }
            rows.append(row)
            subj += 1
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
    if datatype == "date":
        return f"[none:{field}:nk]"
    return f"[none:{field}:nk]"

def col_def(field, datatype, role, ttype):
    return (f"      <column caption='{esc(field)}' datatype='{datatype}' name='[{field}]' "
            f"role='{role}' type='{ttype}' />\n")

def dep_block(ds, fields):
    """fields: list of (name, datatype, role).
    Native 2026.2 order: ALL <column> first, then ALL <column-instance>."""
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
# 4. WORKSHEET BUILDERS
# ----------------------------------------------------------------------------
def worksheet(name, ds, ds_caption, kind, dim=None, dimtype="string", meas=None):
    """kind: ban | bar | line | table.
    Matches native 2026.2 format: plain rows/cols.

    The data-source / dependency / window construction patterns are UNCHANGED
    from the proven loading recipe. The only viz-layer enhancement is the
    *coloring*: explicit mark classes (Bar/Line) + a pane-level <color>
    encoding on the dimension already on the shelf. That <color column='...'>
    block is mirrored verbatim from the reference workbook (DM_Dashboards.twb),
    so it adds production-grade color without touching datasource-dependencies
    (the colored field is the same column-instance already declared)."""
    deps = []
    rows, cols = "", ""
    mark = "Automatic"
    color_inst = None           # dimension instance to drop on the Color shelf
    if kind == "ban":
        # single aggregated measure -> one mark (KPI value)
        deps = [(meas, FTYPE[meas], "measure")]
        rows = f"[{ds}].{inst_name(meas, FTYPE[meas], 'measure')}"
    elif kind == "bar":
        deps = [(dim, dimtype, "dimension"), (meas, FTYPE[meas], "measure")]
        cols = f"[{ds}].{inst_name(dim, dimtype, 'dimension')}"
        rows = f"[{ds}].{inst_name(meas, FTYPE[meas], 'measure')}"
        mark = "Bar"
        color_inst = f"[{ds}].{inst_name(dim, dimtype, 'dimension')}"
    elif kind == "line":
        deps = [(dim, dimtype, "dimension"), (meas, FTYPE[meas], "measure")]
        cols = f"[{ds}].{inst_name(dim, dimtype, 'dimension')}"
        rows = f"[{ds}].{inst_name(meas, FTYPE[meas], 'measure')}"
        mark = "Line"
        # single connected trend -> no color field (coloring would segment it)
    elif kind == "table":
        # dimension on rows, measure on cols (horizontal bar / scorecard)
        deps = [(dim, dimtype, "dimension"), (meas, FTYPE[meas], "measure")]
        rows = f"[{ds}].{inst_name(dim, dimtype, 'dimension')}"
        cols = f"[{ds}].{inst_name(meas, FTYPE[meas], 'measure')}"
        mark = "Bar"
        color_inst = f"[{ds}].{inst_name(dim, dimtype, 'dimension')}"

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
        # reference-confirmed: <encodings><color column='...'/></encodings>
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
# 5. STYLING — design tokens + zone helpers (production look)
# ----------------------------------------------------------------------------
# status -> (text color, fill, border)  — used for KPI tiles
STATUS = {
    "good": ("#16804A", "#E8F6EE", "#BFE6CF"),
    "warn": ("#B3760A", "#FDF3E1", "#F4DCAA"),
    "crit": ("#C23636", "#FDEAEA", "#F4C6C6"),
    "info": ("#2454B8", "#EAF1FD", "#C9DBF7"),
}
PAGE_BG = "#F3F5F9"
CARD_BG = "#FFFFFF"
CARD_BORDER = "#E1E5ED"
INK = "#101828"
MUTED = "#5B6478"
SUBTLE = "#8A94A6"
ACCENT = "#2454B8"     # primary brand color — logo chip, chart marks
FONT = "Segoe UI"

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
    s.append(zone_style(CARD_BG, CARD_BORDER, "solid", "1", "4", "6"))
    s.append("        </zone>\n")
    return "".join(s)

# ----------------------------------------------------------------------------
# 6. DASHBOARD SPECS  (rich: KPI tiles with real values from the HTML)
# ----------------------------------------------------------------------------
# Each: key, prefix, num, title, crumb, filters,
#   kpis=[(label,value,foot,status)], bar=(title,dim,meas), line=(title,meas), table=(title,dim,meas)
DASH = [
 dict(key="subj", num="01", title="Subject Profile", crumb="Subject Profile — 1041-007",
   filters="Subject: 1041-007   ·   Site 1041 · Madrid   ·   Arm B (high)   ·   On Treatment",
   kpis=[("VISITS DONE","7 / 9","V7 · Day 140","info"),("ADVERSE EVENTS","3","1 serious","warn"),
         ("CON MEDS","3","ongoing","info"),("COMPLIANCE","94%","on treatment","good")],
   bar=("Labs by Visit","Visit","LabResult"), line=("Lab Result Timeline","LabResult"),
   table=("Lab Flags by Visit","Visit","LabResult")),
 dict(key="exec", num="02", title="Study Overview", crumb="Contract & Study Metrics",
   filters="Study: CTA-2041   ·   Region: All   ·   Site: All (82)   ·   Arm: All   ·   YTD 2026",
   kpis=[("ENROLLMENT","71%","+3.1% of target","good"),("ACTIVE SITES","82 / 90","91% activated","info"),
         ("ACTIVE SUBJECTS","842","+38 this month","good"),("SCREEN FAIL","18%","+2.4% vs 15%","warn"),
         ("SAE COUNT","47","+6 last 30d","crit")],
   bar=("Enrollment by Country","Country","Randomized"), line=("Active Subjects Trend","ActiveSubj"),
   table=("Site Health Score","Site","HealthScore")),
 dict(key="studykpi", num="03", title="Study Level KPI", crumb="High-Level Study Metrics",
   filters="Study: CTA-2041   ·   Endpoint: All   ·   Assessment: All   ·   Period: YTD 2026",
   kpis=[("MISSING ENDPOINTS","2.8%","-0.5% of expected","good"),("SAFETY ASSESSMENTS","96%","+1% on schedule","good"),
         ("DATA ENTRY DELAY","4.1d","+0.6d median","warn"),("STUDY HEALTH","88 / 100","+2 weighted","info")],
   bar=("Health Score by Site","Site","HealthScore"), line=("Data Quality Trend","DataQualityPct"),
   table=("Study Metrics by Region","Region","SiteScore")),
 dict(key="site", num="04", title="Site Level KPI", crumb="Site Performance Metrics",
   filters="Study: CTA-2041   ·   Country: All   ·   Region: All   ·   Investigator: All   ·   YTD 2026",
   kpis=[("AVG SITE SCORE","76 / 100","+2 weighted","info"),("TOP ENROLLER","42 /mo","Site 1041","good"),
         ("AVG QUERY AGING","6.4d","+0.9d open","warn"),("DATA QUALITY","92%","+1% clean","good")],
   bar=("Site Score by Site","Site","SiteScore"), line=("Site Score Trend","SiteScore"),
   table=("Site Scorecard","Site","SiteScore")),
 dict(key="expo", num="05", title="Treatment Exposure", crumb="Dosing & Compliance",
   filters="Study: CTA-2041   ·   Treatment: All   ·   Arm: All   ·   Subject: All   ·   YTD 2026",
   kpis=[("AVG COMPLIANCE","94%","+1% of planned","good"),("DOSE MODIFICATIONS","38","+5 last 30d","warn"),
         ("INTERRUPTIONS","12","2 ongoing","warn"),("DISCONTINUATIONS","9","drug-related: 4","crit")],
   bar=("Exposure by Arm","Arm","ActiveSubj"), line=("Dosing Compliance Trend","VisitCompletionPct"),
   table=("Exposure by Site","Site","ActiveSubj")),
 dict(key="ae", num="06", title="Adverse Events", crumb="Patient Safety",
   filters="Study: CTA-2041   ·   Arm: All   ·   Severity: All   ·   Seriousness: All   ·   YTD 2026",
   kpis=[("AE COUNT","3,418","+212 last 30d","info"),("SAE COUNT","47","+6 · 2 unexpected","crit"),
         ("SEVERE (GR3+)","9.1%","+0.8% of all AEs","warn"),("RELATED SAEs","18","+3 drug-related","crit")],
   bar=("Severe AE % by Arm","Arm","SevereAEPct"), line=("AE Count Trend","AECount"),
   table=("SAE by Site","Site","SAECount")),
 dict(key="ecg", num="07", title="ECG Results", crumb="Subject ECG — Trends & Outliers",
   filters="Study: CTA-2041   ·   Parameter: QTcF   ·   Visit: All   ·   Subject: All   ·   YTD 2026",
   kpis=[("ECG ABNORMAL","5.4%","+0.3% of reads","warn"),("QTc PROLONGED","11","> 480 ms","crit"),
         ("OUTLIER SUBJECTS","18","> 3× change","warn"),("PENDING READS","26","central lab","info")],
   bar=("Abnormal ECG by Site","Site","OutlierSubj"), line=("QTcF Trend","LabResult"),
   table=("ECG Outliers by Subject","Subject","LabResult")),
 dict(key="mh", num="08", title="Medical History", crumb="MH Summarized by Subject",
   filters="Study: CTA-2041   ·   Body System: All   ·   Status: All   ·   Subject: All",
   kpis=[("SUBJECTS W/ MH","812","96% of enrolled","info"),("TOP SOC","Vascular","18% of terms","info"),
         ("ACTIVE CONDITIONS","1,204","ongoing","warn"),("AVG TERMS / SUBJ","4.2","+0.3 vs prior","info")],
   bar=("MH Terms by Arm","Arm","AECount"), line=("MH Entries Trend","AECount"),
   table=("MH by Subject","Subject","AECount")),
 dict(key="cm", num="09", title="Concomitant Medications", crumb="Con Meds Summarized by Subject",
   filters="Study: CTA-2041   ·   ATC Class: All   ·   Status: All   ·   Subject: All",
   kpis=[("SUBJECTS ON CONMEDS","788","93% of active","info"),("TOP ATC CLASS","C09","ACE / ARB","info"),
         ("ONGOING MEDS","2,140","at last visit","warn"),("AVG MEDS / SUBJ","3.1","+0.2 vs prior","info")],
   bar=("Con Meds by Arm","Arm","AECount"), line=("Con Med Entries Trend","AECount"),
   table=("Con Meds by Subject","Subject","AECount")),
 dict(key="lab", num="10", title="Lab Results", crumb="Patient Safety",
   filters="Study: CTA-2041   ·   Analyte: All   ·   Visit: All   ·   Lab Flag: All   ·   YTD 2026",
   kpis=[("LAB ABNORMAL","6.2%","+0.4% of results","warn"),("OUTLIER SUBJECTS","41","+5 > 3× ULN","warn"),
         ("MISSING LABS","312","+44 not received","crit"),("GRADE 3+ LABS","22","+2 CTCAE","crit")],
   bar=("Lab Result by Site","Site","LabResult"), line=("Lab Result Trend","LabResult"),
   table=("Outlier Subjects","Subject","LabResult")),
 dict(key="labissue", num="11", title="Lab Data Issues", crumb="Common Lab Data Problems",
   filters="Study: CTA-2041   ·   Issue Type: All   ·   Site: All   ·   Analyte: All",
   kpis=[("MISSING UNITS","146","+12 unresolved","warn"),("MISSING RANGES","98","+8 normal ranges","warn"),
         ("UNMAPPED TESTS","34","need dictionary","crit"),("OUT-OF-RANGE","212","auto-flagged","info")],
   bar=("Missing Labs by Site","Site","MissingLabs"), line=("Missing Labs Trend","MissingLabs"),
   table=("Lab Issues by Site","Site","MissingLabs")),
 dict(key="vitals", num="12", title="Vital Sign Results", crumb="Subject Vitals — Trends & Outliers",
   filters="Study: CTA-2041   ·   Parameter: All   ·   Visit: All   ·   Subject: All   ·   YTD 2026",
   kpis=[("VITALS ABNORMAL","4.8%","+0.2% of reads","warn"),("BP OUTLIERS","22","SBP > 180","crit"),
         ("WEIGHT CHANGE","16","> 7% from BL","warn"),("PENDING ENTRY","31","not received","info")],
   bar=("Abnormal Vitals by Site","Site","OutlierSubj"), line=("Vitals Trend","LabResult"),
   table=("Vital Outliers by Subject","Subject","LabResult")),
 dict(key="consol", num="13", title="Consolidated MH · Lab · CM · AE · Exposure", crumb="Subject Panels Over Time",
   filters="Subject: 1041-007   ·   Panels: All   ·   Visit: All   ·   Period: On Treatment",
   kpis=[("PANELS TRACKED","5","MH·Lab·CM·AE·Exp","info"),("ACTIVE SUBJECTS","760","across panels","good"),
         ("AE EVENTS","3,418","linked records","info"),("LAB FLAGS","212","cross-panel","warn")],
   bar=("Panel Activity by Visit","Visit","AECount"), line=("Records Over Time","AECount"),
   table=("Panels by Subject","Subject","AECount")),
 dict(key="cra", num="14", title="CRA Activity", crumb="CRA Performance Metrics",
   filters="Study: CTA-2041   ·   CRA: All   ·   Site: All   ·   Period: YTD 2026",
   kpis=[("OPEN QUERIES","1,204","+88 vs last wk","warn"),("CANCELLED QUERIES","146","6.2% of raised","info"),
         ("AVG CYCLE TIME","6.4d","+0.9d to close","warn"),("SDV COMPLETION","88%","+1% critical","good")],
   bar=("Open Queries by CRA","Investigator","OpenQueries"), line=("Query Cycle Time Trend","QueryAgeDays"),
   table=("CRA Scorecard","Investigator","SDVPct")),
 dict(key="mon", num="15", title="Monitoring", crumb="Monitoring Visit Oversight",
   filters="Study: CTA-2041   ·   CRA: All   ·   Visit Type: All   ·   Site: All   ·   YTD 2026",
   kpis=[("VISIT COMPLETION","91%","+2% of planned","good"),("IMV APPROVAL","84%","-3% within SLA","warn"),
         ("UPCOMING VISITS","23","6 sites · 30d","info"),("SDV COMPLETION","88%","+1% critical","good")],
   bar=("MV Completion by Site","Site","VisitCompletionPct"), line=("IMV Approval Trend","IMVApprovalPct"),
   table=("Visit Status by Site","Site","UpcomingVisits")),
 dict(key="ctms", num="16", title="CTMS Action Items", crumb="Open Action Items by Site",
   filters="Study: CTA-2041   ·   Status: Open   ·   Owner: All   ·   Site: All",
   kpis=[("OPEN ACTIONS","68","+9 this week","warn"),("OVERDUE","21","> SLA","crit"),
         ("DUE IN 7D","17","follow-up","info"),("AVG AGE","9.2d","+1.1d open","warn")],
   bar=("Open Actions by Site","Site","OpenQueries"), line=("Action Items Trend","OpenQueries"),
   table=("Action Aging by Site","Site","OpenQueries")),
 dict(key="sdv", num="17", title="SDV Backlog", crumb="SDV Backlog by Site Over Time",
   filters="Study: CTA-2041   ·   SDV Type: All   ·   Site: All   ·   Period: YTD 2026",
   kpis=[("PAGES IN BACKLOG","1,860","+140 vs last wk","warn"),("INITIAL SDV","1,240","67% of backlog","info"),
         ("RE-SDV","620","33% of backlog","info"),("AVG AGE","12.4d","+1.8d open","crit")],
   bar=("SDV Backlog by Site","Site","MissingLabs"), line=("SDV Completion Trend","SDVPct"),
   table=("Backlog by Site","Site","MissingLabs")),
 dict(key="query", num="18", title="Queries", crumb="Query Status · Aging · Response",
   filters="Study: CTA-2041   ·   Query Status: All   ·   Aging: All   ·   Role: All   ·   YTD 2026",
   kpis=[("OPEN QUERIES","1,204","+88 vs last wk","warn"),("CLOSED QUERIES","8,932","+412 cumulative","good"),
         ("AVG AGING","6.4d","+0.9d open","warn"),("AVG RESPONSE","2.1d","-0.3d site reply","good")],
   bar=("Query Aging by Site","Site","QueryAgeDays"), line=("Open Queries Trend","OpenQueries"),
   table=("Open Queries by Site","Site","OpenQueries")),
 dict(key="enroll", num="19", title="Enrollment & Population", crumb="Enrollment & Population",
   filters="Study: CTA-2041   ·   Country: All (14)   ·   Site: All (82)   ·   Status: All   ·   YTD 2026",
   kpis=[("SCREENED","1,180","+62 cumulative","info"),("RANDOMIZED","842","71% of target","good"),
         ("ACTIVE","760","+30 on study","good"),("COMPLETED","58","+12 reached EOS","info"),
         ("WITHDRAWN","24","3.2% rate","warn")],
   bar=("Randomized by Country","Country","Randomized"), line=("Monthly Randomization","Randomized"),
   table=("Enrollment by Country","Country","Randomized")),
 dict(key="pd", num="20", title="Protocol Deviations", crumb="PDs by Study · Site · Subject",
   filters="Study: CTA-2041   ·   Category: All   ·   Severity: All   ·   Site: All   ·   YTD 2026",
   kpis=[("TOTAL PDS","214","+18 last 30d","warn"),("MAJOR","46","21% of PDs","crit"),
         ("MINOR","168","79% of PDs","info"),("SITES W/ PDS","58 / 82","71% of sites","warn")],
   bar=("Deviations by Site","Site","OpenQueries"), line=("Deviations Trend","OpenQueries"),
   table=("PD Severity by Site","Site","OpenQueries")),
 dict(key="visit", num="21", title="Visit & Dates", crumb="Visits & Out-of-Window",
   filters="Study: CTA-2041   ·   Visit: All   ·   Window: All   ·   Subject: All   ·   YTD 2026",
   kpis=[("VISITS DONE","6,420","94% of planned","good"),("OUT OF WINDOW","312","4.6% of visits","warn"),
         ("NOT DONE","148","2.2% missed","crit"),("UPCOMING","420","next 30d","info")],
   bar=("Visits by Site","Site","UpcomingVisits"), line=("Visit Completion Trend","VisitCompletionPct"),
   table=("Out-of-Window by Site","Site","UpcomingVisits")),
 dict(key="pagestat", num="22", title="Visit & Page Status Summary", crumb="EDC Visit & Page Status",
   filters="Study: CTA-2041   ·   Status: All   ·   Form: All   ·   Site: All   ·   YTD 2026",
   kpis=[("PLANNED PAGES","48,200","cumulative","info"),("COMPLETED","44,180","91.7% entered","good"),
         ("MISSING","2,140","4.4% expected","crit"),("OVERDUE","1,880","3.9% past due","warn")],
   bar=("Pages by Site","Site","MissingLabs"), line=("Page Completion Trend","VisitCompletionPct"),
   table=("Page Status by Site","Site","MissingLabs")),
 dict(key="dec", num="23", title="Data Entry Changes", crumb="EDC Audit Trail — Changes",
   filters="Study: CTA-2041   ·   Form: All   ·   Site: All   ·   Period: YTD 2026",
   kpis=[("TOTAL CHANGES","12,840","+640 last 30d","info"),("FLAGGED FORMS","186","high-change","warn"),
         ("TOP SITE","Site 3020","8.1% of changes","warn"),("AVG LATENCY","4.1d","entry to change","info")],
   bar=("Changes by Site","Site","OpenQueries"), line=("Data Changes Trend","OpenQueries"),
   table=("Flagged Forms by Site","Site","OpenQueries")),
 dict(key="drc", num="24", title="Data Review Checks Summary", crumb="DM Vendor Review Checks",
   filters="Study: CTA-2041   ·   Check Type: All   ·   Status: All   ·   Period: YTD 2026",
   kpis=[("RESOLVED","6,210","82% of raised","good"),("CONFIRMED","640","8.4% valid","info"),
         ("QUERIED","412","5.4% to site","warn"),("OUTSTANDING","318","4.2% open","crit")],
   bar=("DRC by Site","Site","OpenQueries"), line=("DRC Resolution Trend","ResponseDays"),
   table=("Outstanding by Site","Site","OpenQueries")),
 dict(key="dsts", num="25", title="Data Source Timestamps", crumb="Source Refresh / Transfer Dates",
   filters="Study: CTA-2041   ·   Source: All   ·   Status: All",
   kpis=[("DATA SOURCES","9","EDC·CTMS·Safety…","info"),("LAST REFRESH","04 JUN 2026","02:14 UTC","good"),
         ("ON TIME","8 / 9","within SLA","good"),("DELAYED","1","Labs +6h","warn")],
   bar=("Records by Source","Region","ActiveSubj"), line=("Refresh Volume Trend","ActiveSubj"),
   table=("Sources by Region","Region","ActiveSubj")),
 dict(key="downloads", num="26", title="Download Library", crumb="Data Download Links",
   filters="Study: CTA-2041   ·   Dataset: All   ·   Format: All",
   kpis=[("DATASETS","42","analysis-ready","info"),("LAST BUILD","04 JUN 2026","nightly","good"),
         ("FORMATS","3","CSV·SAS·XPT","info"),("TOTAL SIZE","2.8 GB","compressed","info")],
   bar=("Downloads by Region","Region","ClosedQueries"), line=("Download Volume Trend","ClosedQueries"),
   table=("Available Downloads","Region","ClosedQueries")),
]

def sheet_name(d, kind):  # readable + unique worksheet titles (shown as card titles)
    titles = {"bar": d["bar"][0], "line": d["line"][0], "table": d["table"][0]}
    return f"{d['num']} · {titles[kind]}"

# ----------------------------------------------------------------------------
# 7. DASHBOARD LAYOUT (styled zones — no sidebar, top-bar + card grid)
# ----------------------------------------------------------------------------
def trend_arrow(foot):
    if foot.startswith("+"):
        return "&#9650; "   # ▲
    if foot.startswith("-"):
        return "&#9660; "   # ▼
    return ""

def dashboard_zones(d):
    zid = [2]
    def nid():
        zid[0] += 1
        return zid[0]

    # --- grid constants (100,000-unit canvas) ---------------------------
    MARGIN = 1800          # outer page margin
    GAP = 1800             # gutter between cards
    CONTENT_W = 100000 - 2 * MARGIN
    LOGO_W = 8000

    HEADER_H = 11000
    KPI_H = 16500          # taller so the value + footnote never clip
    CHARTS_H = 34000
    FOOTER_H = 3000

    y_header = MARGIN
    y_kpi = y_header + HEADER_H + GAP
    y_charts = y_kpi + KPI_H + GAP
    y_table = y_charts + CHARTS_H + GAP
    y_footer = 100000 - MARGIN - FOOTER_H
    TABLE_H = y_footer - GAP - y_table

    z = ["        <zones>\n"]
    root = nid()
    z.append(f"          <zone h='100000' id='{root}' type-v2='layout-basic' w='100000' x='0' y='0'>\n")

    # --- header: brand chip + title / breadcrumb / filters ---
    z.append(text_zone(nid(), MARGIN, y_header, LOGO_W, HEADER_H, [
        run("CT", bold=True, size=20, color="#FFFFFF", font=FONT, align=1),
    ], bg=ACCENT, bc=ACCENT, bs="none", bw="0", padding="0"))

    z.append(text_zone(nid(), MARGIN + LOGO_W, y_header, CONTENT_W - LOGO_W, HEADER_H, [
        run(esc(d["title"]), bold=True, size=18, color=INK, font=FONT),
        run("      " + esc(d["crumb"]) + "&#10;", size=11, color=MUTED, font=FONT),
        run("FILTERS    " + esc(d["filters"]), size=10, color=SUBTLE, font=FONT),
    ], bg=CARD_BG, bc=CARD_BORDER, bs="solid", bw="1", padding="14"))

    # --- KPI strip (status-tinted tiles, with trend arrows) ---
    kpis = d["kpis"]
    n = len(kpis)
    available = CONTENT_W - (n - 1) * GAP
    tile_w = available // n
    for i, (label, val, foot, status) in enumerate(kpis):
        tc, bg, bc = STATUS[status]
        x = MARGIN + i * (tile_w + GAP)
        w = tile_w if i < n - 1 else (MARGIN + CONTENT_W) - x
        # reference-proven line breaks: trailing &#10; on each line but the last
        z.append(text_zone(nid(), x, y_kpi, w, KPI_H, [
            run(esc(label) + "&#10;", bold=True, size=10, color=SUBTLE, font=FONT),
            run(esc(val) + "&#10;", bold=True, size=21, color=tc, font=FONT),
            run(trend_arrow(foot) + esc(foot), size=9, color=tc, font=FONT),
        ], bg=bg, bc=bc, bs="solid", bw="1", padding="10"))

    # --- charts row: Bar | Line (white cards) ---
    chart_w = (CONTENT_W - GAP) // 2
    chart_w2 = (MARGIN + CONTENT_W) - (MARGIN + chart_w + GAP)
    z.append(sheet_zone(nid(), sheet_name(d, "bar"), MARGIN, y_charts, chart_w, CHARTS_H))
    z.append(sheet_zone(nid(), sheet_name(d, "line"), MARGIN + chart_w + GAP, y_charts, chart_w2, CHARTS_H))

    # --- table row (white card, full width) ---
    z.append(sheet_zone(nid(), sheet_name(d, "table"), MARGIN, y_table, CONTENT_W, TABLE_H))

    # --- footer note ---
    z.append(text_zone(nid(), MARGIN, y_footer, CONTENT_W, FOOTER_H, [
        run("Wireframe build &#183; Tableau 2026.2 &#183; Synthetic sample data &#183; Not for clinical use",
            size=9, color=SUBTLE, font=FONT),
    ], bg=None, bc="#000000", bs="none", bw="0", padding="0"))

    # page background
    z.append(zone_style(PAGE_BG, "#E0E0E0", "solid", "1", "8"))
    z.append("        </zone>\n        </zones>\n")
    return "".join(z)

def dashboard(d):
    x = [f"    <dashboard name='{esc(d['num'] + ' · ' + d['title'])}'>\n"]
    x.append("      <style />\n")
    x.append("      <size maxheight='852' maxwidth='1280' minheight='852' minwidth='1280' />\n")
    x.append(dashboard_zones(d))
    x.append(f"      <simple-id uuid='{uid()}' />\n")
    x.append("    </dashboard>\n")
    return "".join(x)

# ----------------------------------------------------------------------------
# 7. DATASOURCE XML
# ----------------------------------------------------------------------------
# Native Tableau 2026.2 type codes (verified against an exported reference.twb)
RT2026 = {"string": 129, "date": 133, "integer": 20, "real": 5}
AGG2026 = {"string": "Count", "date": "Year", "integer": "Sum", "real": "Sum"}

def native_datasource(caption, dsname, connname, filename, cols, calcs=None):
    """Emit a data source in 2026.2 object-model format.
    cols: list of (name, datatype). datatype in {string,date,integer,real}.
    Mirrors exactly what Tableau 2026.2 writes for an embedded CSV.
    """
    base = filename[:-4] if filename.lower().endswith(".csv") else filename
    relname = filename                      # e.g. clinical_sample.csv
    parent = f"[{relname}]"
    table = f"[{base}#csv]"
    objid = f"{relname}_{uuid.uuid4().hex.upper()}"   # object id (no brackets)
    objid_b = f"[{objid}]"

    def relation_columns(indent):
        o = []
        o.append(f"{indent}<columns character-set='UTF-8' header='yes' locale='en_US' separator=','>\n")
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
    # relation
    x.append(f"        <relation connection='{connname}' name='{relname}' table='{table}' type='table'>\n")
    x.append(relation_columns("          "))
    x.append("        </relation>\n")
    # metadata-records
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
    # field role / caption defs
    x.append("      <aliases enabled='yes' />\n")
    for n, dt in cols:
        if dt in ("integer", "real"):
            x.append(f"      <column caption='{esc(n)}' datatype='{dt}' name='[{n}]' role='measure' type='quantitative' />\n")
        elif dt == "date":
            x.append(f"      <column caption='{esc(n)}' datatype='date' name='[{n}]' role='dimension' type='ordinal' />\n")
        else:
            x.append(f"      <column caption='{esc(n)}' datatype='string' name='[{n}]' role='dimension' type='nominal' />\n")
    if calcs:
        for cap, iname, dt, role, ttype, formula in calcs:
            x.append(f"      <column caption='{esc(cap)}' datatype='{dt}' name='[{iname}]' role='{role}' type='{ttype}'>\n")
            x.append(f"        <calculation class='tableau' formula='{esc(formula)}' />\n")
            x.append("      </column>\n")
    x.append(f"      <column caption='{esc(relname)}' datatype='table' "
             f"name='[__tableau_internal_object_id__].{objid_b}' role='measure' type='quantitative' />\n")
    x.append("      <layout dim-ordering='alphabetic' measure-ordering='alphabetic' show-structure='true' />\n")
    # object-graph (the new 2026.2 object model)
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

def fact_datasource():
    return native_datasource("Clinical Sample", CLIN, "textscan.clin",
                             "clinical_sample.csv", DIMS + MEAS,
                             calcs=CALCS if INCLUDE_CALCS else None)

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

def windows_section(ws_names, dash):
    """Required by 2026.2: worksheet windows need <cards>, dashboard windows
    need <viewpoints>+<active>. Format mirrors an exported reference.twb."""
    x = ["  <windows source-height='44'>\n"]
    for nm in ws_names:
        x.append(f"    <window class='worksheet' name='{esc(nm)}'>\n")
        x.append(WS_CARDS)
        x.append(f"      <simple-id uuid='{uid()}' />\n")
        x.append("    </window>\n")
    for d in dash:
        cap = d["num"] + " · " + d["title"]
        sheets = [sheet_name(d, "bar"), sheet_name(d, "line"), sheet_name(d, "table")]
        x.append(f"    <window class='dashboard' name='{esc(cap)}'>\n")
        x.append("      <viewpoints>\n")
        for s in sheets:
            x.append(f"        <viewpoint name='{esc(s)}' />\n")
        x.append("      </viewpoints>\n")
        x.append("      <active id='-1' />\n")
        x.append(f"      <simple-id uuid='{uid()}' />\n")
        x.append("    </window>\n")
    x.append("  </windows>\n")
    return "".join(x)

def params_datasource():
    params = [
        ("p_Enroll_Target", "integer", "1000", 0, 2000, 1),
        ("p_SLA_Days", "integer", "14", 1, 60, 1),
        ("p_Top_N_Sites", "integer", "5", 1, 20, 1),
    ]
    x = []
    x.append("  <datasource hasconnection='false' inline='true' name='Parameters' version='18.1'>\n")
    x.append("    <aliases enabled='yes' />\n")
    for i, (cap, dt, val, mn, mx, gr) in enumerate(params, 1):
        x.append(f"    <column caption='{cap}' datatype='{dt}' name='[Parameter {i}]' "
                 f"param-domain-type='range' role='measure' type='quantitative' value='{val}'>\n")
        x.append(f"      <calculation class='tableau' formula='{val}' />\n")
        x.append(f"      <range granularity='{gr}' max='{mx}' min='{mn}' />\n")
        x.append("    </column>\n")
    # string parameter
    x.append("    <column caption='p_Study' datatype='string' name='[Parameter 4]' "
             "param-domain-type='list' role='measure' type='nominal' value='&quot;CTA-2041&quot;'>\n")
    x.append("      <calculation class='tableau' formula='&quot;CTA-2041&quot;' />\n")
    x.append("      <members>\n")
    x.append("        <member value='&quot;CTA-2041&quot;' />\n")
    x.append("        <member value='&quot;CTA-3055&quot;' />\n")
    x.append("      </members>\n")
    x.append("    </column>\n")
    x.append("  </datasource>\n")
    return "".join(x)

# ----------------------------------------------------------------------------
# 8. ASSEMBLE WORKBOOK
# ----------------------------------------------------------------------------
def build():
    make_fact_csv()

    # Worksheets: only Bar / Line / Table per dashboard (KPIs + header are text objects).
    ws = []
    ws_names = []
    for d in DASH:
        b_t, b_dim, b_meas = d["bar"]
        l_t, l_meas = d["line"]
        t_t, t_dim, t_meas = d["table"]
        nb, nl, nt = sheet_name(d, "bar"), sheet_name(d, "line"), sheet_name(d, "table")
        ws.append(worksheet(nb, CLIN, "Clinical Sample", "bar",
                            dim=b_dim, dimtype=FTYPE[b_dim], meas=b_meas))
        ws.append(worksheet(nl, CLIN, "Clinical Sample", "line",
                            dim="Visit", dimtype="string", meas=l_meas))
        ws.append(worksheet(nt, CLIN, "Clinical Sample", "table",
                            dim=t_dim, dimtype=FTYPE[t_dim], meas=t_meas))
        ws_names += [nb, nl, nt]

    dbs = [dashboard(d) for d in DASH]

    # 2026.2 REQUIRES a <windows> section (worksheet windows need <cards>,
    # dashboard windows need <viewpoints>+<active>). Omitting it -> internal error.
    win = [windows_section(ws_names, DASH)]

    out = []
    out.append("<?xml version='1.0' encoding='utf-8' ?>\n")
    out.append("<workbook original-version='18.1' source-build='2026.2.0 (20262.26.0603.1643)' "
               "source-platform='win' version='18.1' xmlns:user='http://www.tableausoftware.com/xml/user'>\n")
    out.append(MANIFEST)
    out.append("  <preferences>\n    <preference name='ui.encoding.shelf.height' value='24' />\n"
               "    <preference name='ui.shelf.height' value='26' />\n  </preferences>\n")
    out.append("  <datasources>\n")
    if INCLUDE_PARAMS:
        out.append(params_datasource())
    out.append(fact_datasource())
    out.append("  </datasources>\n")
    out.append("  <worksheets>\n")
    out.extend(ws)
    out.append("  </worksheets>\n")
    out.append("  <dashboards>\n")
    out.extend(dbs)
    out.append("  </dashboards>\n")
    out.extend(win)
    out.append("</workbook>\n")

    xml = "".join(out)
    # validate well-formedness
    minidom.parseString(xml)
    with open(TWB, "w", encoding="utf-8") as f:
        f.write(xml)
    print("OK wrote", TWB, "(%d bytes)" % len(xml))
    print("Worksheets:", len(ws), "Dashboards:", len(dbs))

if __name__ == "__main__":
    build()