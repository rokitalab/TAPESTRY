import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert, Box, Button, Checkbox, CircularProgress, Divider,
  FormControlLabel, IconButton, MenuItem, Paper, Popover, Stack, Switch, Tab, Tabs, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
  useTheme,
} from "@mui/material";
import SettingsIcon from "@mui/icons-material/Settings";
import * as d3 from "d3";
import { controlCohortColor, histologyColor } from "../histologyColors";
import { triggerDownload } from "./lib/svgExport";
import PlotDownloadMenu from "./PlotDownloadMenu";

const MARGIN = { top: 20, right: 20, bottom: 160, left: 100 };
const API_BASE = (import.meta.env.VITE_API_BASE || "/tapestry-api").replace(/\/$/, "");
const EMPTY_ROWS = [];

// Maps cell-line biospecimen IDs to their PedcBioPortal sampleId URL parameters.
// Source: pbta_all_clinical_data.tsv (SPECIMEN_ID → sampleId columns).
const CELL_LINE_SAMPLE_ID_MAP = {
  "BS_0RQ4P069": "7316-1746-CL-Serum-based-P-4",
  "BS_0Z1XRQ8F": "7316-5335-CL-Serum-free-P-7_1034249",
  "BS_169P1QCA": "7316-5922",
  "BS_1A521KDP": "7316-8851-CL-Serum-free-P-9",
  "BS_1E684SD5": "7316-9433-CL-Serum-free-P-7",
  "BS_1X206RYY": "7316-388-CL-Serum-based-P-10",
  "BS_2A162JH9": "7316-3058-CL-Serum-free-P-7",
  "BS_2EAF5GXZ": "7316-2686-CL-Serum-based-P-8",
  "BS_2KD2NR56": "7316-1746-CL-Serum-based-P-8",
  "BS_2WS7E25W": "7316-2151-CL-Serum-based-P-11",
  "BS_31XK6FNH": "7316-2189-CL-Serum-based-P-13",
  "BS_3JQDQR52": "7316-445-CL-Serum-based-P-9",
  "BS_3K5MMTMR": "7316-1102-CL-Serum-based-P-4",
  "BS_40MP5BWR": "7316-1769-CL-Serum-free-P-11",
  "BS_4DQAQFQH": "7316-4446",
  "BS_4FXPXSR4": "7316-8741-CL-Serum-based-P-6",
  "BS_52V1ADN9": "7316-124-CL-Serum-based-P-5",
  "BS_5357BVCQ": "7316-6349-CL-Serum-free-P-7",
  "BS_59ZJWJTF": "7316-85-CL-Serum-based-P-4",
  "BS_5AK32KGB": "7316-158-CL-Serum-free-P-25",
  "BS_5C0SRKYC": "7316-1763-CL-Serum-based-P-8",
  "BS_5GNQC2FF": "7316-2176-CL-Serum-based-P-3",
  "BS_5SWRB9C6": "7316-4423-CL-Serum-based-P-11",
  "BS_5WG0W2NQ": "7316-7919-CL-Serum-based-P-6",
  "BS_5YF9GK7D": "7316-195-CL-Serum-based-P-11",
  "BS_672V4AHJ": "7316-4423-CL-Serum-free-P-8",
  "BS_68TZMZH1": "7316-1746-CL-Serum-based-P-4",
  "BS_6JBE0947": "7316-4448",
  "BS_6S2YMXRY": "7316-1100-CL-Serum-based-P-9",
  "BS_6Y08PVRK": "7316-4423-CL-Serum-free-P-8",
  "BS_70AW1WH4": "7316-6475-CL-Serum-free-P-5",
  "BS_7E9HHKXA": "7316-2186-CL-Serum-based-P-8",
  "BS_7HD5FK4Z": "7316-4062-CL-Serum-free-P-8",
  "BS_7MZTDB19": "7316-2187-CL-Serum-free-P-10",
  "BS_7ZA2AYHR": "7316-7924-CL-Serum-based-P-6",
  "BS_853PNV7P": "7316-1763-CL-Serum-based-P-3",
  "BS_87E0MMHD": "7316-7538-CL-Serum-free-P-12",
  "BS_8HBQ3JPK": "7316-4509-CL-Serum-free-P-8",
  "BS_8Q7NWJ22": "7316-3058-CL-Serum-free-P-8",
  "BS_8TM3SM9D": "7316-870-CL-Serum-based-P-7",
  "BS_8ZD6J47V": "7316-913-CL-Serum-free-P-13",
  "BS_91JG3WPD": "7316-7963-CL-Serum-based-P-11",
  "BS_91PQ311R": "7316-8128-CL-Serum-free-P-9",
  "BS_93B03065": "7316-6477-CL-Serum-free-P-11",
  "BS_97PS4DTQ": "7316-913-CL-Serum-based-P-16_1007885",
  "BS_989GRHJC": "7316-870-CL-Serum-based-P-7",
  "BS_9FN0417M": "7316-6758-CL-Serum-based-P-11",
  "BS_9VJ3VV46": "7316-2187-CL-Serum-free-P-10",
  "BS_9XKZY5PR": "7316-1746-CL-Serum-free-P-14",
  "BS_A3S28ANC": "7316-445-CL-Serum-free-P-12",
  "BS_A79S84KJ": "7316-2666-CL-Serum-free-P-13",
  "BS_A8XRT37Q": "7316-440-CL-Serum-based-P-11",
  "BS_AFBPM6CN": "7316-1746-CL-Serum-free-P-10",
  "BS_AH3RVK53": "SF11385",
  "BS_AHW1VXPG": "7316-85-CL-Serum-free-P-14",
  "BS_AJ2YA7HC": "7316-1781-CL-Serum-based-P-9",
  "BS_AM05X074": "7316-406-CL-Serum-based-P-7",
  "BS_AMJRV0NK": "7316-6758-CL-Serum-based-P-11",
  "BS_ANZMQ09Q": "7316-5335-CL-Serum-free-P-7_1034249",
  "BS_AZD61W93": "7316-388-CL-Serum-free-P-21",
  "BS_B5S27A0B": "7316-195-CL-Serum-free-P-14",
  "BS_BF2MCS03": "7316-6477-CL-Serum-free-P-11",
  "BS_BFFK7M53": "7316-2151-CL-Serum-based-P-11",
  "BS_BJGV8RBP": "7316-2141-CL-Serum-based-P-8",
  "BS_BPK2KS9J": "7316-7955-CL-Serum-based-P-6",
  "BS_BWBDH9GM": "7316-3058-CL-Serum-based-P-6",
  "BS_C64R2V60": "7316-8017-CL-Serum-based-P-5",
  "BS_C9NE8QMR": "7316-599-CL-Serum-based-P-8",
  "BS_CA4CRZKP": "CNMC-967",
  "BS_CHBWCERH": "7316-2141-CL-Serum-free-P-9",
  "BS_CHFJZQWR": "7316-161-CL-Serum-based-P-13",
  "BS_CNMM5BCD": "7316-2187-CL-Serum-based-P-8",
  "BS_CNNBPEXA": "7316-3045-CL-Serum-based-P-5",
  "BS_CRWF3CZQ": "7316-8128-CL-Serum-based-P-8",
  "BS_CS091RPM": "7316-161-CL-Serum-based-P-13",
  "BS_CX2EPMNP": "7316-6349-CL-Serum-free-P-7",
  "BS_CZ6XFMAW": "7316-8128-CL-Serum-free-P-11",
  "BS_CZRA594T": "7316-85-CL-Serum-based-P-4",
  "BS_DKF4CQB4": "7316-7965-CL-Serum-based-P-10",
  "BS_DRY58DTF": "7316-1763-CL-Serum-based-P-3",
  "BS_DVDT4VXQ": "7316-3234",
  "BS_DVQ6Q5C1": "7316-913-CL-Serum-based-P-16_1007886",
  "BS_DX3CGG44": "7316-4800-CL-Serum-based-P-8",
  "BS_DXXVE0V1": "7316-1763-CL-Serum-based-P-8",
  "BS_E3N4JN0X": "7316-5335-CL-Serum-free-P-7_1034337",
  "BS_E60JZ9Z3": "7316-1763-CL-Serum-free-P-9",
  "BS_EK4XEBRD": "7316-8128-CL-Serum-based-P-8",
  "BS_EKJB7HFV": "7316-9433-CL-Serum-free-P-7",
  "BS_EM8PDG4B": "7316-2186-CL-Serum-based-P-8",
  "BS_ERAWW3H7": "7316-85-CL-Serum-free-P-13",
  "BS_ERFMPQN3": "7316-2189-CL-Serum-based-P-4",
  "BS_EY857EMY": "7316-7943-CL-Serum-based-P-7",
  "BS_F2YGCAHF": "7316-445-CL-Serum-based-P-9",
  "BS_F3Q8HG1M": "7316-7958-CL-Serum-based-P-8",
  "BS_F5JCJM6S": "7316-913-CL-Serum-free-P-11",
  "BS_FH4TA0XM": "7316-1102-CL-Serum-based-P-4",
  "BS_FJEZ3ASV": "7316-913-CL-Serum-free-P-13",
  "BS_FMCSE824": "7316-212-CL-Serum-based-P-6",
  "BS_G802JZ6S": "7316-2176-CL-Serum-based-P-6",
  "BS_GF8MHY11": "7316-195-CL-Serum-free-P-14",
  "BS_GGXGNP9S": "7316-7049-CL-Serum-free-P-14",
  "BS_GNSAKWR4": "7316-4062-CL-Serum-based-P-5",
  "BS_GW7MKKP9": "7316-1763-CL-Serum-free-P-8",
  "BS_GXTFW99H": "7316-2151-CL-Serum-based-P-5",
  "BS_HFZPE6ZA": "7316-5335-CL-Serum-free-P-7_1034337",
  "BS_HGE47RGT": "7316-8121-CL-Serum-free-P-7",
  "BS_HM5GFJN8": "7316-3058-CL-Serum-free-P-7",
  "BS_HMJD6DTA": "7316-5317-CL-Serum-free-P-11",
  "BS_J440ZA7W": "7316-440-CL-Serum-free-P-21",
  "BS_JEZBA2EW": "CNMC-1277",
  "BS_JGKRN7NA": "7316-195-CL-Serum-free-P-8",
  "BS_JPVVRR84": "7316-7958-CL-Serum-based-P-8",
  "BS_JV0K935Z": "7316-1781-CL-Serum-based-P-9",
  "BS_K0X5TZ5K": "7316-7919-CL-Serum-based-P-6",
  "BS_K20V1HST": "7316-7924-CL-Serum-based-P-6",
  "BS_KK87WD8M": "7316-2176-CL-Serum-based-P-6",
  "BS_KQPCYZ2K": "CNMC-1034",
  "BS_KYRAHGZ8": "7316-2187-CL-Serum-based-P-8",
  "BS_M0FN1D8Y": "7316-2686-CL-Serum-based-P-8",
  "BS_M659G06J": "7316-2176-CL-Serum-based-P-3",
  "BS_M8EA6R2A": "7316-913-CL-Serum-based-P-4",
  "BS_MH9D24WY": "7316-4062-CL-Serum-free-P-8",
  "BS_MJ3ZTWB7": "7316-3058-CL-Serum-based-P-7",
  "BS_MS39AKDH": "7316-8851-CL-Serum-free-P-9",
  "BS_MVPJFHPG": "7316-440-CL-Serum-free-P-21",
  "BS_MX23ZY0Y": "7316-195-CL-Serum-free-P-8",
  "BS_MZM00D4F": "7316-8128-CL-Serum-free-P-9",
  "BS_MZMTHD63": "7316-7928-CL-Serum-based-P-6",
  "BS_NE82PE7G": "7316-195-CL-Serum-based-P-11",
  "BS_NFTZDWJ8": "7316-406-CL-Serum-based-P-7",
  "BS_NXXTPSEP": "7316-388-CL-Serum-based-P-10",
  "BS_P7J6GBHR": "7316-85-CL-Serum-based-P-5",
  "BS_P9JP6JFA": "7316-195-CL-Serum-based-P-4",
  "BS_P9MA3S97": "7316-1100-CL-Serum-based-P-9",
  "BS_PBBWKYFX": "7316-8128-CL-Serum-free-P-11",
  "BS_PGK832G2": "7316-2189-CL-Serum-based-P-4",
  "BS_PKZ1HWNB": "7316-913-CL-Serum-based-P-4",
  "BS_PMFAKGQ5": "7316-2189-CL-Serum-based-P-13",
  "BS_PNYN0AYD": "7316-1746-CL-Serum-free-P-10",
  "BS_Q3KV6NDN": "7316-2141-CL-Serum-based-P-8",
  "BS_Q9MAXZF6": "7316-2141-CL-Serum-free-P-9",
  "BS_QCVB3325": "7316-3058-CL-Serum-based-P-7",
  "BS_QFS497M1": "7316-8121-CL-Serum-free-P-8",
  "BS_QNQX0Q35": "7316-3237-CL-Serum-free-P-22",
  "BS_QNTYAQJN": "7316-5317-CL-Serum-free-P-11",
  "BS_QWM9BPDY": "7316-3058-CL-Serum-based-P-6",
  "BS_QYPHA40N": "7316-85-CL-Serum-free-P-13",
  "BS_QZRP3NSG": "7316-4447-CL-Serum-free-P-0",
  "BS_R34ZYJR8": "7316-7943-CL-Serum-based-P-7",
  "BS_RMNNT83R": "7316-913-CL-Serum-based-P-16_1007885",
  "BS_RQ9W1EQ7": "7316-2183-CL-Serum-based-P-6",
  "BS_RXP2ZRQT": "7316-1769-CL-Serum-free-P-11",
  "BS_S4P7XKFK": "7316-913-CL-Serum-free-P-11",
  "BS_SAHWJ50F": "7316-7955-CL-Serum-based-P-6",
  "BS_SH9NS018": "7316-158-CL-Serum-free-P-25",
  "BS_SNWRBH0J": "7316-212-CL-Serum-based-P-6",
  "BS_SXM30B9W": "7316-85-CL-Serum-free-P-14",
  "BS_T5N6GWXH": "7316-7965-CL-Serum-based-P-10",
  "BS_TF5TTEXH": "7316-1763-CL-Serum-free-P-9",
  "BS_TGSXGXM7": "7316-1763-CL-Serum-free-P-8",
  "BS_TX8C5VAJ": "7316-2151-CL-Serum-based-P-5",
  "BS_V27ABVGT": "7316-1746-CL-Serum-free-P-14",
  "BS_V2QN65XA": "7316-7959-CL-Serum-based-P-7",
  "BS_V9Y9HSGQ": "7316-4062-CL-Serum-based-P-5",
  "BS_VKGX1F8Z": "7316-2582-CL-Serum-based-P-6",
  "BS_VT2YFZNB": "7316-8121-CL-Serum-free-P-8",
  "BS_VXDGXQKZ": "7316-3235",
  "BS_VYGCBBWB": "7316-599-CL-Serum-based-P-8",
  "BS_W37YKD6X": "7316-4509-CL-Serum-free-P-8",
  "BS_W6PXPK9Q": "7316-7538-CL-Serum-free-P-12",
  "BS_WE4C1XN1": "7316-6475-CL-Serum-free-P-5",
  "BS_WF90N975": "7316-445-CL-Serum-free-P-12",
  "BS_X586X4VM": "7316-2183-CL-Serum-based-P-6",
  "BS_XFW6426N": "7316-8121-CL-Serum-free-P-7",
  "BS_XMP9XNR9": "7316-195-CL-Serum-based-P-4",
  "BS_Y7CT08T2": "7316-2582-CL-Serum-based-P-6",
  "BS_YAT7CTDK": "7316-3045-CL-Serum-based-P-5",
  "BS_YBZ2DNSK": "7316-7963-CL-Serum-based-P-11",
  "BS_YHVCFBXZ": "7316-913-CL-Serum-based-P-16_1007886",
  "BS_YPN9H9KK": "7316-1746-CL-Serum-based-P-8",
  "BS_YS3ZJWN9": "7316-388-CL-Serum-free-P-21",
  "BS_YTTPJ4RX": "7316-406-CL-Serum-free-P-9",
  "BS_ZEQCS2WN": "7316-85-CL-Serum-based-P-5",
};

function cbioportalId(biospecimenId, sampleId) {
  return CELL_LINE_SAMPLE_ID_MAP[biospecimenId] ?? sampleId;
}

// Tab indices, named so reordering the <Tab> elements doesn't require
// touching every activeTab === N check scattered through this file.
const TAB_TUMORS = 0;
const TAB_CONTROLS = 1;
const TAB_EVO_DEVO = 2;
const TAB_TUMORS_VS_CONTROLS = 3;
const TAB_CELL_LINES = 4;

// Deterministic per-sample horizontal jitter for box-plot points, derived
// from the sample id so it's stable across re-renders (calling Math.random
// during render violates React's purity rules).
function jitterFromId(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return (Math.abs(hash) % 1000) / 1000 - 0.5;
}

// Sample groups selected by default when landing on a tab: Tumors vs
// Controls starts with cell lines hidden; the control-facing tabs start
// with tumors hidden.
function defaultGroupsForTab(tabGroups, activeTab) {
  if (activeTab === TAB_TUMORS_VS_CONTROLS) return tabGroups.filter((g) => !g.isCellLine);
  if (activeTab === TAB_CONTROLS || activeTab === TAB_CELL_LINES || activeTab === TAB_EVO_DEVO) {
    return tabGroups.filter((g) => !g.isTumor);
  }
  return tabGroups;
}

const EVODEVO_TIMEPOINTS = [
  "4 Week Post Conception", "5 Week Post Conception", "6 Week Post Conception",
  "7 Week Post Conception", "8 Week Post Conception", "9 Week Post Conception",
  "10 Week Post Conception", "11 Week Post Conception", "12 Week Post Conception",
  "13 Week Post Conception", "16 Week Post Conception", "18 Week Post Conception",
  "19 Week Post Conception",
  "Neonate", "Infant", "Toddler", "School Age Child", "Adolescent", "Young Adult",
];

const EVODEVO_LABELS = {
  "4 Week Post Conception": "4wpc", "5 Week Post Conception": "5wpc",
  "6 Week Post Conception": "6wpc", "7 Week Post Conception": "7wpc",
  "8 Week Post Conception": "8wpc", "9 Week Post Conception": "9wpc",
  "10 Week Post Conception": "10wpc", "11 Week Post Conception": "11wpc",
  "12 Week Post Conception": "12wpc", "13 Week Post Conception": "13wpc",
  "16 Week Post Conception": "16wpc", "18 Week Post Conception": "18wpc",
  "19 Week Post Conception": "19wpc",
  "Neonate": "Newborn", "Infant": "Infant", "Toddler": "Toddler",
  "School Age Child": "School Age", "Adolescent": "Adolescent", "Young Adult": "Young Adult",
};

// EvoDevo's "Neonate" timepoint is displayed as "Newborn" in tooltips too.
const timepointDisplay = (t) => (t === "Neonate" ? "Newborn" : t);

const EVODEVO_COLORS = { Forebrain: "#e67e22", Hindbrain: "#2980b9" };

function boxStats(cpms) {
  const sorted = [...cpms].sort(d3.ascending);
  const q1 = d3.quantile(sorted, 0.25);
  const median = d3.quantile(sorted, 0.5);
  const q3 = d3.quantile(sorted, 0.75);
  const iqr = q3 - q1;
  return {
    q1, median, q3,
    lo: Math.max(d3.min(sorted), q1 - 1.5 * iqr),
    hi: Math.min(d3.max(sorted), q3 + 1.5 * iqr),
  };
}

const EMPTY_SET = new Set();

// Controls are colored by source cohort (GTEx, Evo-devo, etc.) since they
// don't have per-histology colors; tumor/cell-line groups use histologyColor.
function groupColor(g) {
  return g.isControl ? controlCohortColor(g.cohort) : histologyColor(g.label);
}

// Box-plot groups are split into side-by-side facet panels by tumor/control
// cohort/cell-line, in this order. "Other" catches any control cohort not
// in COHORT_FACET_NAMES so groups are never silently dropped.
const COHORT_FACET_NAMES = {
  "Pediatric brain cell type": "Cell of Origin",
  "Evo-devo": "Evo-devo",
  "Pediatric brain": "Pediatric Brain",
  "GTEx": "GTEx <40",
};

const FACET_ORDER = ["Primary Tumors", "Cell of Origin", "Evo-devo", "Pediatric Brain", "GTEx <40", "Cell Lines", "Other"];

// Gap (px) between facet panels.
const FACET_GAP = 16;
// Height (px) of the ggplot-style strip label above each facet panel.
const FACET_STRIP_H = 16;

function facetName(g) {
  if (g.isTumor) return "Primary Tumors";
  if (g.isCellLine) return "Cell Lines";
  return COHORT_FACET_NAMES[g.cohort] ?? "Other";
}

// Renders the per-histology box plot into `svg`, sized to `width` x `height`.
// Shared by the on-screen chart and off-screen export rendering.
function drawBoxPlot(svg, { width, height, visibleGroups, log2Scale, highlightIds, enrichedIds = highlightIds, textColor = "#333", onHover, onBoxHover = onHover, onMove, onLeave }) {
  svg.selectAll("*").remove();

  const iW = width - MARGIN.left - MARGIN.right;
  const iH = height - MARGIN.top - MARGIN.bottom;

  const xform = (d) => log2Scale ? (d.log2CpmCorrected ?? Math.log2(d.cpm + 1)) : d.cpm;

  const allCpms = visibleGroups.flatMap((g) => g.values.map(xform));
  const yMax = d3.max(allCpms) ?? 1;
  const y = d3.scaleLinear().domain([0, yMax]).nice().range([iH, 0]);

  // Split groups into side-by-side facet panels (Tumor, control cohorts,
  // Cell Lines). Panel widths are proportional to group count, so box
  // widths stay consistent across panels; all panels share the y-scale above.
  const facetBuckets = FACET_ORDER
    .map((name) => ({ name, groups: visibleGroups.filter((g) => facetName(g) === name) }))
    .filter((f) => f.groups.length > 0);

  const facetGapWidth = FACET_GAP * Math.max(0, facetBuckets.length - 1);
  const usableWidth = Math.max(iW - facetGapWidth, 0);

  const scaleForKey = new Map();
  let cursor = 0;
  facetBuckets.forEach((f) => {
    const facetWidth = usableWidth * (f.groups.length / visibleGroups.length);
    f.scale = d3.scaleBand()
      .domain(f.groups.map((g) => g.key))
      .range([cursor, cursor + facetWidth])
      .padding(0.35);
    f.groups.forEach((g) => scaleForKey.set(g.key, f.scale));
    cursor += facetWidth + FACET_GAP;
  });

  const root = svg.append("g").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

  root.append("g")
    .call(d3.axisLeft(y).tickSize(-iW).tickFormat(""))
    .call((g) => g.select(".domain").remove())
    .call((g) => g.selectAll("line").attr("stroke", "#e0e0e0").attr("stroke-dasharray", "3,3"));

  const labelForKey = new Map(visibleGroups.map((g) => [g.key, g.label]));

  facetBuckets.forEach((f) => {
    root.append("g")
      .attr("transform", `translate(0,${iH})`)
      .call(d3.axisBottom(f.scale).tickFormat((key) => labelForKey.get(key) ?? key))
      .selectAll("text")
      .attr("transform", "rotate(-55)")
      .style("text-anchor", "end")
      .attr("dx", "-0.5em")
      .attr("font-size", 11)
      .attr("dy", "0.15em");

    {
      const [x0, x1] = f.scale.range();
      root.append("line")
        .attr("x1", x0).attr("x2", x1)
        .attr("y1", 0).attr("y2", 0)
        .attr("stroke", textColor).attr("stroke-width", 1.5);
      root.append("text")
        .attr("x", (x0 + x1) / 2)
        .attr("y", -FACET_STRIP_H / 2)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "central")
        .attr("font-size", 13)
        .attr("font-weight", 700)
        .attr("font-family", "sans-serif")
        .attr("fill", textColor)
        .text(f.name);
    }
  });

  root.append("g").call(d3.axisLeft(y).tickFormat(d3.format(".2f")));

  root.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -iH / 2).attr("y", -52)
    .attr("text-anchor", "middle")
    .attr("font-size", 16)
    .attr("font-family", "sans-serif")
    .attr("fill", "#666")
    .text(log2Scale ? "log₂(CPM + 1)" : "CPM");

  visibleGroups.forEach((g) => {
    const { key, label, values } = g;
    const xVals = values.map(xform);
    const { q1, median, q3, lo, hi } = boxStats(xVals);
    const scale = scaleForKey.get(key);
    const cx = scale(key) + scale.bandwidth() / 2;
    const bw = scale.bandwidth() * 0.7;
    const color = groupColor(g);
    const fmt = (v) => v.toFixed(3);
    const axisLabel = log2Scale ? "log₂(CPM+1)" : "CPM";

    const boxTip = `<strong>${label}</strong><br/>n=${values.length}<br/>Median: ${fmt(median)}<br/>IQR: [${fmt(q1)}, ${fmt(q3)}]<br/>Whiskers: [${fmt(lo)}, ${fmt(hi)}]`;

    root.append("line").attr("x1", cx).attr("x2", cx)
      .attr("y1", y(lo)).attr("y2", y(q1))
      .attr("stroke", textColor).attr("stroke-width", 1.5).attr("stroke-dasharray", "4,2");
    root.append("line").attr("x1", cx).attr("x2", cx)
      .attr("y1", y(q3)).attr("y2", y(hi))
      .attr("stroke", textColor).attr("stroke-width", 1.5).attr("stroke-dasharray", "4,2");

    [lo, hi].forEach((v) =>
      root.append("line")
        .attr("x1", cx - bw / 4).attr("x2", cx + bw / 4)
        .attr("y1", y(v)).attr("y2", y(v))
        .attr("stroke", textColor).attr("stroke-width", 1.5)
    );

    root.append("rect")
      .attr("x", cx - bw / 2).attr("y", y(q3))
      .attr("width", bw).attr("height", Math.abs(y(q1) - y(q3)))
      .attr("fill", color).attr("fill-opacity", 0.2)
      .attr("stroke", textColor).attr("stroke-width", 1.5)
      .attr("rx", 2)
      .on("mouseover", (e) => onBoxHover(e, boxTip))
      .on("mousemove", onMove)
      .on("mouseout", onLeave);

    root.append("line")
      .attr("x1", cx - bw / 2).attr("x2", cx + bw / 2)
      .attr("y1", y(median)).attr("y2", y(median))
      .attr("stroke", textColor).attr("stroke-width", 2.5)
      .attr("stroke-linecap", "round");

    const sorted = [...values].sort((a, b) => highlightIds.has(a.id) - highlightIds.has(b.id));
    sorted.forEach((d) => {
      const highlighted = highlightIds.has(d.id);
      const enriched = enrichedIds.has(d.id);
      root.append("circle")
        .attr("cx", cx + d.jitter * bw * 0.65)
        .attr("cy", y(xform(d)))
        .attr("r", highlighted ? 5 : 3)
        .attr("fill", color)
        .attr("fill-opacity", highlighted ? 1 : 0.4)
        .attr("stroke", textColor)
        .attr("stroke-width", highlighted ? 1.5 : 0.5)
        .style("cursor", "pointer")
        .on("mouseover", (e) =>
          onHover(e, `<strong>${d.id}</strong>${d.sampleId ? `<br/><a href="https://pedcbioportal.kidsfirstdrc.org/patient?studyId=pbta_all&sampleId=${encodeURIComponent(cbioportalId(d.id, d.sampleId))}" target="_blank" rel="noreferrer">${cbioportalId(d.id, d.sampleId)}<img src="https://pbs.twimg.com/profile_images/448682169553006594/Uh7nmhLE_400x400.png" style="width:12px;height:12px;vertical-align:middle;margin-left:3px;border-radius:2px;display:inline-block;" /></a>` : ""}<br/>${label}${d.molecularSubtype ? `<br/>${d.molecularSubtype}` : ""}<br/>${axisLabel}: ${xform(d).toFixed(3)}<br/>${d.rnaLibrary ?? "—"}${enriched ? "<br/><em>tumor enriched</em>" : ""}`)
        )
        .on("mousemove", onMove)
        .on("mouseout", onLeave);
    });
  });
}

// Renders the EvoDevo timepoint plot into `svg`, sized to `width` x `height`.
// Shared by the on-screen chart and off-screen export rendering.
function drawEvoDevoPlot(svg, { width, height, evodevoPoints, log2Scale, textColor = "#333", onHover, onMove, onLeave }) {
  svg.selectAll("*").remove();

  const presentTimepoints = EVODEVO_TIMEPOINTS.filter((t) =>
    evodevoPoints.some((d) => d.timepoint === t)
  );
  if (presentTimepoints.length === 0) return;

  const xform = (d) => log2Scale ? (d.log2CpmCorrected ?? Math.log2(d.cpm + 1)) : d.cpm;

  const iW = width - MARGIN.left - MARGIN.right;
  const iH = height - MARGIN.top - MARGIN.bottom;
  const yMax = d3.max(evodevoPoints, xform) ?? 1;

  const x = d3.scalePoint().domain(presentTimepoints).range([0, iW]).padding(0.5);
  const y = d3.scaleLinear().domain([0, yMax]).nice().range([iH, 0]);

  const root = svg.append("g").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

  root.append("g")
    .call(d3.axisLeft(y).tickSize(-iW).tickFormat(""))
    .call((g) => g.select(".domain").remove())
    .call((g) => g.selectAll("line").attr("stroke", "#e0e0e0").attr("stroke-dasharray", "3,3"));

  root.append("line")
    .attr("x1", 0).attr("x2", iW).attr("y1", 0).attr("y2", 0)
    .attr("stroke", textColor).attr("stroke-width", 1.5);
  root.append("text")
    .attr("x", iW / 2).attr("y", -FACET_STRIP_H / 2)
    .attr("text-anchor", "middle").attr("dominant-baseline", "central")
    .attr("font-size", 13).attr("font-weight", 700).attr("font-family", "sans-serif")
    .attr("fill", textColor).text("Evo-devo");

  root.append("g")
    .attr("transform", `translate(0,${iH})`)
    .call(d3.axisBottom(x).tickFormat((t) => EVODEVO_LABELS[t] ?? t))
    .selectAll("text")
    .attr("transform", "rotate(-45)")
    .style("text-anchor", "end")
    .attr("dx", "-0.5em")
    .attr("font-size", 11)
    .attr("dy", "0.15em");

  root.append("g").call(d3.axisLeft(y).tickFormat(d3.format(".2f")));

  root.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -iH / 2).attr("y", -52)
    .attr("text-anchor", "middle")
    .attr("font-size", 16)
    .attr("font-family", "sans-serif")
    .attr("fill", "#666")
    .text(log2Scale ? "log₂(CPM + 1)" : "CPM");

  ["Forebrain", "Hindbrain"].forEach((region) => {
    const color = EVODEVO_COLORS[region];
    const regionPts = evodevoPoints.filter((d) => d.region === region);

    regionPts.forEach((d) => {
      if (!presentTimepoints.includes(d.timepoint)) return;
      root.append("circle")
        .attr("cx", x(d.timepoint))
        .attr("cy", y(xform(d)))
        .attr("r", 3)
        .attr("fill", color)
        .attr("fill-opacity", 0.3)
        .attr("stroke", textColor)
        .attr("stroke-width", 0.5)
        .style("cursor", "pointer")
        .on("mouseover", (e) =>
          onHover(e, `<strong>${d.id}</strong>${d.sampleId ? `<br/><a href="https://pedcbioportal.kidsfirstdrc.org/patient?studyId=pbta_all&sampleId=${encodeURIComponent(cbioportalId(d.id, d.sampleId))}" target="_blank" rel="noreferrer">${cbioportalId(d.id, d.sampleId)}<img src="https://pbs.twimg.com/profile_images/448682169553006594/Uh7nmhLE_400x400.png" style="width:12px;height:12px;vertical-align:middle;margin-left:3px;border-radius:2px;display:inline-block;" /></a>` : ""}<br/>${region} — ${timepointDisplay(d.timepoint)}<br/>CPM: ${xform(d).toFixed(3)}<br/>${d.rnaLibrary ?? "—"}`)
        )
        .on("mousemove", onMove)
        .on("mouseout", onLeave);
    });

    const meanPoints = presentTimepoints.map((tp) => {
      const vals = regionPts.filter((d) => d.timepoint === tp).map(xform);
      return vals.length ? { timepoint: tp, value: d3.mean(vals) } : null;
    }).filter(Boolean);

    if (meanPoints.length > 1) {
      root.append("path")
        .datum(meanPoints)
        .attr("d", d3.line().x((d) => x(d.timepoint)).y((d) => y(d.value)))
        .attr("fill", "none")
        .attr("stroke", color)
        .attr("stroke-width", 2)
        .attr("stroke-linejoin", "round");
    }

    meanPoints.forEach((d) => {
      root.append("circle")
        .attr("cx", x(d.timepoint))
        .attr("cy", y(d.value))
        .attr("r", 5)
        .attr("fill", color)
        .attr("stroke", textColor)
        .attr("stroke-width", 1.5)
        .style("cursor", "pointer")
        .on("mouseover", (e) =>
          onHover(e, `<strong>${region}</strong><br/>${timepointDisplay(d.timepoint)}<br/>Mean: ${d.value.toFixed(3)}`)
        )
        .on("mousemove", onMove)
        .on("mouseout", onLeave);
    });
  });

  const legend = root.append("g").attr("transform", `translate(${iW - 100}, 10)`);
  ["Forebrain", "Hindbrain"].forEach((region, i) => {
    const g = legend.append("g").attr("transform", `translate(0, ${i * 22})`);
    g.append("line").attr("x1", 0).attr("x2", 20).attr("y1", 8).attr("y2", 8)
      .attr("stroke", EVODEVO_COLORS[region]).attr("stroke-width", 2);
    g.append("circle").attr("cx", 10).attr("cy", 8).attr("r", 4)
      .attr("fill", EVODEVO_COLORS[region]).attr("stroke", "transparent").attr("stroke-width", 1);
    g.append("text").attr("x", 26).attr("y", 12)
      .attr("font-size", 12).attr("font-family", "sans-serif").attr("fill", textColor).text(region);
  });
}

// Renders tumor box plots on the left and the evo-devo line plot on the right
// as two adjacent facets sharing a continuous y-scale and grid lines.
function drawEvoDevoWithTumorsPlot(svg, { width, height, evodevoPoints, visibleGroups, log2Scale, highlightIds, enrichedIds = highlightIds, textColor = "#333", onHover, onBoxHover = onHover, onMove, onLeave }) {
  svg.selectAll("*").remove();

  const presentTimepoints = EVODEVO_TIMEPOINTS.filter((t) =>
    evodevoPoints.some((d) => d.timepoint === t)
  );
  if (presentTimepoints.length === 0) return;

  const xform = (d) => log2Scale ? (d.log2CpmCorrected ?? Math.log2(d.cpm + 1)) : d.cpm;

  const iW = width - MARGIN.left - MARGIN.right;
  const iH = height - MARGIN.top - MARGIN.bottom;

  // Shared y-scale across both sections
  const allCpms = [
    ...evodevoPoints.map(xform),
    ...visibleGroups.flatMap((g) => g.values.map(xform)),
  ];
  const yMax = d3.max(allCpms) ?? 1;
  const y = d3.scaleLinear().domain([0, yMax]).nice().range([iH, 0]);

  // Width proportional to item counts so box width stays consistent with standalone view.
  // A FACET_GAP separates the two panels, just like the box-plot facet layout.
  const tumorCount = visibleGroups.length;
  const timepointCount = presentTimepoints.length;
  const usableW = iW - FACET_GAP;
  const tumorWidth = Math.floor(usableW * tumorCount / (tumorCount + timepointCount));
  const evoStart = tumorWidth + FACET_GAP;
  const evoWidth = usableW - tumorWidth;

  const xTumor = d3.scaleBand()
    .domain(visibleGroups.map((g) => g.key))
    .range([0, tumorWidth])
    .padding(0.35);

  const xEvo = d3.scalePoint()
    .domain(presentTimepoints)
    .range([evoStart, evoStart + evoWidth])
    .padding(0.5);

  const root = svg.append("g").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

  // Full-width grid lines — continuous across both sections, no gap
  root.append("g")
    .call(d3.axisLeft(y).tickSize(-iW).tickFormat(""))
    .call((g) => g.select(".domain").remove())
    .call((g) => g.selectAll("line").attr("stroke", "#e0e0e0").attr("stroke-dasharray", "3,3"));

  // — Tumor section —
  root.append("line")
    .attr("x1", 0).attr("x2", tumorWidth)
    .attr("y1", 0).attr("y2", 0)
    .attr("stroke", textColor).attr("stroke-width", 1.5);
  root.append("text")
    .attr("x", tumorWidth / 2).attr("y", -FACET_STRIP_H / 2)
    .attr("text-anchor", "middle").attr("dominant-baseline", "central")
    .attr("font-size", 13).attr("font-weight", 700).attr("font-family", "sans-serif")
    .attr("fill", textColor).text("Primary Tumors");
  root.append("g")
    .attr("transform", `translate(0,${iH})`)
    .call(d3.axisBottom(xTumor).tickFormat((key) => {
      const g = visibleGroups.find((g) => g.key === key);
      return g ? g.label : key;
    }))
    .selectAll("text")
    .attr("transform", "rotate(-55)").style("text-anchor", "end")
    .attr("dx", "-0.5em").attr("font-size", 11).attr("dy", "0.15em");

  visibleGroups.forEach((g) => {
    const { key, label, values } = g;
    const xVals = values.map(xform);
    const { q1, median, q3, lo, hi } = boxStats(xVals);
    const cx = xTumor(key) + xTumor.bandwidth() / 2;
    const bw = xTumor.bandwidth() * 0.7;
    const color = groupColor(g);
    const fmt = (v) => v.toFixed(3);
    const axisLabel = log2Scale ? "log₂(CPM+1)" : "CPM";
    const boxTip = `<strong>${label}</strong><br/>n=${values.length}<br/>Median: ${fmt(median)}<br/>IQR: [${fmt(q1)}, ${fmt(q3)}]<br/>Whiskers: [${fmt(lo)}, ${fmt(hi)}]`;

    root.append("line").attr("x1", cx).attr("x2", cx)
      .attr("y1", y(lo)).attr("y2", y(q1))
      .attr("stroke", textColor).attr("stroke-width", 1.5).attr("stroke-dasharray", "4,2");
    root.append("line").attr("x1", cx).attr("x2", cx)
      .attr("y1", y(q3)).attr("y2", y(hi))
      .attr("stroke", textColor).attr("stroke-width", 1.5).attr("stroke-dasharray", "4,2");
    [lo, hi].forEach((v) =>
      root.append("line")
        .attr("x1", cx - bw / 4).attr("x2", cx + bw / 4)
        .attr("y1", y(v)).attr("y2", y(v))
        .attr("stroke", textColor).attr("stroke-width", 1.5)
    );
    root.append("rect")
      .attr("x", cx - bw / 2).attr("y", y(q3))
      .attr("width", bw).attr("height", Math.abs(y(q1) - y(q3)))
      .attr("fill", color).attr("fill-opacity", 0.2)
      .attr("stroke", textColor).attr("stroke-width", 1.5).attr("rx", 2)
      .on("mouseover", (e) => onBoxHover(e, boxTip))
      .on("mousemove", onMove).on("mouseout", onLeave);
    root.append("line")
      .attr("x1", cx - bw / 2).attr("x2", cx + bw / 2)
      .attr("y1", y(median)).attr("y2", y(median))
      .attr("stroke", textColor).attr("stroke-width", 2.5).attr("stroke-linecap", "round");
    const sorted = [...values].sort((a, b) => highlightIds.has(a.id) - highlightIds.has(b.id));
    sorted.forEach((d) => {
      const highlighted = highlightIds.has(d.id);
      const enriched = enrichedIds.has(d.id);
      root.append("circle")
        .attr("cx", cx + d.jitter * bw * 0.65).attr("cy", y(xform(d)))
        .attr("r", highlighted ? 5 : 3).attr("fill", color)
        .attr("fill-opacity", highlighted ? 1 : 0.4)
        .attr("stroke", textColor).attr("stroke-width", highlighted ? 1.5 : 0.5)
        .style("cursor", "pointer")
        .on("mouseover", (e) =>
          onHover(e, `<strong>${d.id}</strong>${d.sampleId ? `<br/><a href="https://pedcbioportal.kidsfirstdrc.org/patient?studyId=pbta_all&sampleId=${encodeURIComponent(cbioportalId(d.id, d.sampleId))}" target="_blank" rel="noreferrer">${cbioportalId(d.id, d.sampleId)}<img src="https://pbs.twimg.com/profile_images/448682169553006594/Uh7nmhLE_400x400.png" style="width:12px;height:12px;vertical-align:middle;margin-left:3px;border-radius:2px;display:inline-block;" /></a>` : ""}<br/>${label}${d.molecularSubtype ? `<br/>${d.molecularSubtype}` : ""}<br/>${axisLabel}: ${xform(d).toFixed(3)}<br/>${d.rnaLibrary ?? "—"}${enriched ? "<br/><em>tumor enriched</em>" : ""}`)
        )
        .on("mousemove", onMove).on("mouseout", onLeave);
    });
  });

  // — Evo-devo section —
  root.append("line")
    .attr("x1", evoStart).attr("x2", evoStart + evoWidth)
    .attr("y1", 0).attr("y2", 0)
    .attr("stroke", textColor).attr("stroke-width", 1.5);
  root.append("text")
    .attr("x", evoStart + evoWidth / 2).attr("y", -FACET_STRIP_H / 2)
    .attr("text-anchor", "middle").attr("dominant-baseline", "central")
    .attr("font-size", 13).attr("font-weight", 700).attr("font-family", "sans-serif")
    .attr("fill", textColor).text("Evo-devo");
  root.append("g")
    .attr("transform", `translate(0,${iH})`)
    .call(d3.axisBottom(xEvo).tickFormat((t) => EVODEVO_LABELS[t] ?? t))
    .selectAll("text")
    .attr("transform", "rotate(-45)").style("text-anchor", "end")
    .attr("dx", "-0.5em").attr("font-size", 11).attr("dy", "0.15em");

  root.append("g").call(d3.axisLeft(y).tickFormat(d3.format(".2f")));
  root.append("text")
    .attr("transform", "rotate(-90)").attr("x", -iH / 2).attr("y", -52)
    .attr("text-anchor", "middle").attr("font-size", 16)
    .attr("font-family", "sans-serif").attr("fill", "#666")
    .text(log2Scale ? "log₂(CPM + 1)" : "CPM");

  ["Forebrain", "Hindbrain"].forEach((region) => {
    const color = EVODEVO_COLORS[region];
    const regionPts = evodevoPoints.filter((d) => d.region === region);

    regionPts.forEach((d) => {
      if (!presentTimepoints.includes(d.timepoint)) return;
      root.append("circle")
        .attr("cx", xEvo(d.timepoint)).attr("cy", y(xform(d)))
        .attr("r", 3).attr("fill", color).attr("fill-opacity", 0.3)
        .attr("stroke", textColor).attr("stroke-width", 0.5).style("cursor", "pointer")
        .on("mouseover", (e) =>
          onHover(e, `<strong>${d.id}</strong>${d.sampleId ? `<br/><a href="https://pedcbioportal.kidsfirstdrc.org/patient?studyId=pbta_all&sampleId=${encodeURIComponent(cbioportalId(d.id, d.sampleId))}" target="_blank" rel="noreferrer">${cbioportalId(d.id, d.sampleId)}<img src="https://pbs.twimg.com/profile_images/448682169553006594/Uh7nmhLE_400x400.png" style="width:12px;height:12px;vertical-align:middle;margin-left:3px;border-radius:2px;display:inline-block;" /></a>` : ""}<br/>${region} — ${timepointDisplay(d.timepoint)}<br/>CPM: ${xform(d).toFixed(3)}<br/>${d.rnaLibrary ?? "—"}`)
        )
        .on("mousemove", onMove).on("mouseout", onLeave);
    });

    const meanPoints = presentTimepoints.map((tp) => {
      const vals = regionPts.filter((d) => d.timepoint === tp).map(xform);
      return vals.length ? { timepoint: tp, value: d3.mean(vals) } : null;
    }).filter(Boolean);

    if (meanPoints.length > 1) {
      root.append("path")
        .datum(meanPoints)
        .attr("d", d3.line().x((d) => xEvo(d.timepoint)).y((d) => y(d.value)))
        .attr("fill", "none").attr("stroke", color).attr("stroke-width", 2).attr("stroke-linejoin", "round");
    }

    meanPoints.forEach((d) => {
      root.append("circle")
        .attr("cx", xEvo(d.timepoint)).attr("cy", y(d.value)).attr("r", 5)
        .attr("fill", color).attr("stroke", textColor).attr("stroke-width", 1.5)
        .style("cursor", "pointer")
        .on("mouseover", (e) =>
          onHover(e, `<strong>${region}</strong><br/>${timepointDisplay(d.timepoint)}<br/>Mean: ${d.value.toFixed(3)}`)
        )
        .on("mousemove", onMove).on("mouseout", onLeave);
    });
  });

  const legend = root.append("g").attr("transform", `translate(${evoStart + evoWidth - 100}, 10)`);
  ["Forebrain", "Hindbrain"].forEach((region, i) => {
    const lg = legend.append("g").attr("transform", `translate(0, ${i * 22})`);
    lg.append("line").attr("x1", 0).attr("x2", 20).attr("y1", 8).attr("y2", 8)
      .attr("stroke", EVODEVO_COLORS[region]).attr("stroke-width", 2);
    lg.append("circle").attr("cx", 10).attr("cy", 8).attr("r", 4)
      .attr("fill", EVODEVO_COLORS[region]).attr("stroke", "transparent").attr("stroke-width", 1);
    lg.append("text").attr("x", 26).attr("y", 12)
      .attr("font-size", 12).attr("font-family", "sans-serif").attr("fill", textColor).text(region);
  });
}

// Tooltip handlers are no-ops for the off-screen SVG built for export.
const NO_TOOLTIP = { onHover: () => {}, onMove: () => {}, onLeave: () => {} };

// Builds a detached <svg> at the requested export dimensions, drawn with the
// same logic as the on-screen chart for the active tab.
function buildExportSvg({ width, height, activeTab, visibleGroups, evodevoPoints, log2Scale, highlightIds }) {
  const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svgEl.setAttribute("width", width);
  svgEl.setAttribute("height", height);
  const svg = d3.select(svgEl);
  if (activeTab === TAB_EVO_DEVO) {
    if (visibleGroups.length > 0) {
      drawEvoDevoWithTumorsPlot(svg, { width, height, evodevoPoints, visibleGroups, log2Scale, highlightIds, ...NO_TOOLTIP });
    } else {
      drawEvoDevoPlot(svg, { width, height, evodevoPoints, log2Scale, ...NO_TOOLTIP });
    }
  } else {
    drawBoxPlot(svg, { width, height, visibleGroups, log2Scale, highlightIds, ...NO_TOOLTIP });
  }
  return svgEl;
}

export default function PlotArea({
  junction = null,
  gene = null,
  junctionName = null,
  rows = EMPTY_ROWS,
  height = 460,
  highlightIds = EMPTY_SET,
}) {
  const theme = useTheme();
  // The junction name is the headline label; the junction id (genomic
  // coordinates) is only shown as a subheading when a name is available,
  // since otherwise it's already the headline and would be redundant.
  const mainTitle = junctionName ?? junction ?? "Junction CPM by histology";
  const subTitle = junctionName && junction ? junction : null;
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const hideTimeoutRef = useRef(null);
  const pinnedRef = useRef(false);
  const [containerWidth, setContainerWidth] = useState(900);
  const [fetchedRows, setFetchedRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [selectedGroups, setSelectedGroups] = useState(new Set());
  const [settingsAnchor, setSettingsAnchor] = useState(null);
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, html: "" });
  const [activeTab, setActiveTab] = useState(0);
  const [log2Scale, setLog2Scale] = useState(false);
  const [sortMode, setSortMode] = useState("alpha");
  const [showHighlight, setShowHighlight] = useState(false);
  const [expandedFacets, setExpandedFacets] = useState(new Set());
  const [selectedTimepoints, setSelectedTimepoints] = useState(new Set(EVODEVO_TIMEPOINTS));

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!junction) return;
    // Kicking off loading/error state for an in-flight fetch — the canonical
    // "fetch data in an effect" pattern from React's own docs. There's no
    // render-derivable substitute for "a request is currently in flight",
    // so this rule is intentionally not satisfiable here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setFetchError(null);
    fetch(`${API_BASE}/junction-cpm/?junction=${encodeURIComponent(junction)}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => setFetchedRows(data))
      .catch((e) => setFetchError(e.message))
      .finally(() => setLoading(false));
  }, [junction]);

  const groups = useMemo(() => {
    const src = junction ? fetchedRows : rows;
    const pts = src.map((r, i) => {
      const id = r.biospecimen_id ?? `S${i}`;
      return {
        id,
        sampleId: r.sample_id ?? null,
        cpm: Number(r.cpm),
        log2CpmCorrected: r.log2_cpm_corrected ?? null,
        histology: collapseControlGroup(r.plot_group ?? "Unknown"),
        cancerGroup: r.cancer_group ?? null,
        molecularSubtype: r.molecular_subtype ?? null,
        cohort: r.cohort ?? null,
        isCellLine: r.composition === "Derived Cell Line",
        isIndependentPrimary: r.is_independent_primary,
        rnaLibrary: r.rna_library ?? null,
        jitter: jitterFromId(id),
      };
    });

    // Tumor samples are restricted to independent primaries; cell lines and
    // controls (is_independent_primary === null) are unaffected by this filter.
    const filtered = pts.filter((d) => d.isCellLine || d.isIndependentPrimary !== false);

    const groupByHistology = (src, isCellLineGroup) =>
      Array.from(d3.group(src, (d) => `${d.cohort ?? ""}::${d.histology}`), ([groupKey, values]) => {
        const histology = values[0].histology;
        const hasCancerGroup = values.some((d) => d.cancerGroup != null);
        const isNonNeoplastic = !isCellLineGroup && histology.toLowerCase().includes("non-neoplastic");
        const isTumor = !isCellLineGroup && (hasCancerGroup || isNonNeoplastic);
        const isControl = !isCellLineGroup && !isTumor;
        return {
          key: groupKey, label: histology, values, isTumor, isControl,
          isCellLine: isCellLineGroup,
          cohort: values[0]?.cohort ?? null,
          stats: boxStats(values.map((d) => d.cpm)),
        };
      });

    const tumorPts = filtered.filter((d) => !d.isCellLine);
    const cellLinePts = filtered.filter((d) => d.isCellLine);

    const tumorAndControlGroups = groupByHistology(tumorPts, false);
    const cellLineGroups = groupByHistology(cellLinePts, true);

    // Cell-line groups can share a histology name with a tumor/control group
    // (e.g. "Diffuse midline glioma"). Disambiguate the key in that case so the two stay
    // distinct for selectedGroups, React list keys, and the scaleBand domain;
    // `label` keeps the plain histology name for display and color lookup.
    const tumorAndControlKeys = new Set(tumorAndControlGroups.map((g) => g.key));
    cellLineGroups.forEach((g) => {
      if (tumorAndControlKeys.has(g.key)) g.key = `${g.key} (Cell Line)`;
    });

    const typeRank = (g) => (g.isTumor ? 0 : g.isControl ? 1 : 2);

    return [...tumorAndControlGroups, ...cellLineGroups].sort((a, b) => {
      const rankDiff = typeRank(a) - typeRank(b);
      if (rankDiff !== 0) return rankDiff;
      if (sortMode === "asc") return a.stats.median - b.stats.median;
      if (sortMode === "desc") return b.stats.median - a.stats.median;
      return evoDevoLabelSort(a.label, b.label);
    });
  }, [junction, fetchedRows, rows, sortMode]);

  const evodevoPoints = useMemo(() => {
    const src = junction ? fetchedRows : rows;
    return src
      .filter((r) => r.cohort === "Evo-devo")
      .map((r, i) => {
        const pg = r.plot_group ?? "";
        const dash = pg.indexOf("-");
        return {
          id: r.biospecimen_id ?? `S${i}`,
          sampleId: r.sample_id ?? null,
          cpm: Number(r.cpm),
          log2CpmCorrected: r.log2_cpm_corrected ?? null,
          region: dash >= 0 ? pg.slice(0, dash) : pg,
          timepoint: dash >= 0 ? pg.slice(dash + 1) : pg,
          rnaLibrary: r.rna_library ?? null,
        };
      })
      .filter((d) => d.region === "Forebrain" || d.region === "Hindbrain");
  }, [junction, fetchedRows, rows]);

  const presentTimepoints = useMemo(
    () => EVODEVO_TIMEPOINTS.filter((tp) => evodevoPoints.some((d) => d.timepoint === tp)),
    [evodevoPoints],
  );

  const filteredEvodevoPoints = useMemo(
    () => evodevoPoints.filter((d) => selectedTimepoints.has(d.timepoint)),
    [evodevoPoints, selectedTimepoints],
  );

  const tabGroups = useMemo(() => {
    if (activeTab === TAB_TUMORS) return groups.filter((g) => g.isTumor);
    if (activeTab === TAB_CONTROLS) return groups.filter((g) => g.isControl || g.isTumor);
    if (activeTab === TAB_CELL_LINES) return groups.filter((g) => g.isCellLine || g.isTumor);
    if (activeTab === TAB_EVO_DEVO) return groups.filter((g) => g.isTumor);
    return groups;
  }, [groups, activeTab]);

  // Reset the sample selection to the tab's defaults when the available group
  // keys change (new junction data or tab switch). A sort-mode change reorders
  // groups without adding or removing any, so we compare sorted key fingerprints
  // and skip the reset when only order changed.
  const [prevTabGroups, setPrevTabGroups] = useState(tabGroups);
  if (tabGroups !== prevTabGroups) {
    setPrevTabGroups(tabGroups);
    const prevKeys = prevTabGroups.map((g) => g.key).sort().join("\0");
    const nextKeys = tabGroups.map((g) => g.key).sort().join("\0");
    if (prevKeys !== nextKeys) {
      setSelectedGroups(new Set(defaultGroupsForTab(tabGroups, activeTab).map((g) => g.key)));
    }
  }

  const visibleGroups = useMemo(
    () => tabGroups.filter((g) => selectedGroups.has(g.key)),
    [tabGroups, selectedGroups],
  );

  const activeHighlightIds = showHighlight ? highlightIds : EMPTY_SET;

  const scheduleHide = () => {
    hideTimeoutRef.current = setTimeout(() => {
      pinnedRef.current = false;
      setTooltip((prev) => ({ ...prev, visible: false }));
    }, 150);
  };
  const cancelHide = () => clearTimeout(hideTimeoutRef.current);

  useEffect(() => {
    if (!svgRef.current || activeTab === TAB_EVO_DEVO) return;
    drawBoxPlot(d3.select(svgRef.current), {
      width: containerWidth,
      height,
      visibleGroups,
      log2Scale,
      highlightIds: activeHighlightIds,
      enrichedIds: highlightIds,
      textColor: theme.palette.text.primary,
      onHover: (e, html) => { cancelHide(); pinnedRef.current = true; setTooltip({ visible: true, x: e.clientX + 14, y: e.clientY - 32, html }); },
      onBoxHover: (e, html) => { if (pinnedRef.current) return; cancelHide(); setTooltip({ visible: true, x: e.clientX + 14, y: e.clientY - 32, html }); },
      onMove: (e) => { cancelHide(); setTooltip((prev) => ({ ...prev, x: e.clientX + 14, y: e.clientY - 32 })); },
      onLeave: scheduleHide,
    });
  }, [visibleGroups, containerWidth, height, activeTab, activeHighlightIds, highlightIds, log2Scale, theme.palette.text.primary]);

  useEffect(() => {
    if (!svgRef.current || activeTab !== TAB_EVO_DEVO) return;
    const onHover = (e, html) => { cancelHide(); pinnedRef.current = true; setTooltip({ visible: true, x: e.clientX + 14, y: e.clientY - 32, html }); };
    const onBoxHover = (e, html) => { if (pinnedRef.current) return; cancelHide(); setTooltip({ visible: true, x: e.clientX + 14, y: e.clientY - 32, html }); };
    const onMove = (e) => { cancelHide(); setTooltip((prev) => ({ ...prev, x: e.clientX + 14, y: e.clientY - 32 })); };
    const onLeave = scheduleHide;
    if (visibleGroups.length > 0) {
      drawEvoDevoWithTumorsPlot(d3.select(svgRef.current), {
        width: containerWidth, height, evodevoPoints: filteredEvodevoPoints,
        visibleGroups, log2Scale, highlightIds: activeHighlightIds, enrichedIds: highlightIds,
        textColor: theme.palette.text.primary, onHover, onBoxHover, onMove, onLeave,
      });
    } else {
      drawEvoDevoPlot(d3.select(svgRef.current), {
        width: containerWidth, height, evodevoPoints: filteredEvodevoPoints,
        log2Scale, textColor: theme.palette.text.primary, onHover, onMove, onLeave,
      });
    }
  }, [filteredEvodevoPoints, activeTab, containerWidth, height, log2Scale, theme.palette.text.primary,
      visibleGroups, activeHighlightIds, highlightIds]);

  function exportFilename(ext) {
    return `junction-cpm${junction ? `-${junction}` : ""}.${ext}`;
  }

  function buildExportSvgEl({ width, height }) {
    return buildExportSvg({
      width,
      height,
      activeTab,
      visibleGroups,
      evodevoPoints: filteredEvodevoPoints,
      log2Scale,
      highlightIds: activeHighlightIds,
    });
  }

  function downloadAsTsv() {
    const columns = [
      ["biospecimen_id", (r) => r.biospecimen_id],
      ["sample_id", (r) => r.sample_id],
      ["patient_id", (r) => r.patient_id],
      ["junction", (r) => r.junction],
      ["gene_symbol", () => gene],
      ["plot_group", (r) => r.plot_group],
      ["cancer_group", (r) => r.cancer_group],
      ["cohort", (r) => r.cohort],
      ["composition", (r) => r.composition],
      ["rna_library", (r) => r.rna_library],
      ["is_independent_primary", (r) => r.is_independent_primary],
      ["cpm", (r) => r.cpm],
      ["log2_cpm_corrected", (r) => r.log2_cpm_corrected],
      ["tumor_enriched", (r) => highlightIds.has(r.biospecimen_id)],
    ];
    const escape = (v) => (v === null || v === undefined ? "" : String(v).replace(/[\t\n\r]/g, " "));
    const lines = [
      columns.map(([name]) => name).join("\t"),
      ...fetchedRows.map((r) => columns.map(([, get]) => escape(get(r))).join("\t")),
    ];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/tab-separated-values;charset=utf-8" }));
    triggerDownload(url, exportFilename("tsv"));
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function toggleGroup(key) {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const groupSections = [
    { label: "Primary Tumors", items: tabGroups.filter((g) => g.isTumor) },
    { label: "Controls", items: tabGroups.filter((g) => g.isControl) },
    { label: "Cell Lines", items: tabGroups.filter((g) => g.isCellLine) },
  ].filter((s) => s.items.length > 0);

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, width: "100%" }}>
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 1 }}>
        <Box>
          <Typography sx={{ fontWeight: 800 }}>{mainTitle}</Typography>
          {subTitle && (
            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace", display: "block" }}>
              {subTitle}
            </Typography>
          )}
        </Box>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={log2Scale}
                onChange={(e) => setLog2Scale(e.target.checked)}
              />
            }
            label={<Typography variant="body2">log₂</Typography>}
            sx={{ mr: 0 }}
          />
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={showHighlight}
                onChange={(e) => setShowHighlight(e.target.checked)}
              />
            }
            label={<Typography variant="body2">Show enriched</Typography>}
            sx={{ mr: 0 }}
          />
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Typography variant="body2" color="text.secondary">Sort:</Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={sortMode}
              onChange={(_, v) => { if (v !== null) setSortMode(v); }}
            >
              <Tooltip title="Median ascending"><ToggleButton value="asc" sx={{ px: 1, py: 0.25, fontSize: 13 }}>↑</ToggleButton></Tooltip>
              <Tooltip title="Alphabetical"><ToggleButton value="alpha" sx={{ px: 1, py: 0.25, fontSize: 11 }}>A–Z</ToggleButton></Tooltip>
              <Tooltip title="Median descending"><ToggleButton value="desc" sx={{ px: 1, py: 0.25, fontSize: 13 }}>↓</ToggleButton></Tooltip>
            </ToggleButtonGroup>
          </Stack>
          <Button
            size="small"
            variant="outlined"
            startIcon={<SettingsIcon fontSize="small" />}
            onClick={(e) => setSettingsAnchor(e.currentTarget)}
          >
            Configure Samples
          </Button>
          <PlotDownloadMenu
            buildExportSvg={buildExportSvgEl}
            title={mainTitle}
            subtitle={subTitle}
            filename={exportFilename}
            extraItems={(closeMenu) => (
              <MenuItem disabled={fetchedRows.length === 0} onClick={() => { closeMenu(); downloadAsTsv(); }}>
                TSV (plot data)
              </MenuItem>
            )}
          />
        </Stack>
      </Box>

      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        sx={{ mb: 1, borderBottom: 1, borderColor: "divider" }}
      >
        <Tab label="Primary Tumors" />
        <Tab label="Controls" />
        <Tab label="Evo-Devo" />
        <Tab label="Tumors vs Controls" />
        <Tab label="Cell Lines" />
      </Tabs>

      <Popover
        open={Boolean(settingsAnchor)}
        anchorEl={settingsAnchor}
        onClose={() => setSettingsAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <Box sx={{ p: 2, minWidth: 240, maxHeight: 480, overflowY: "auto" }}>
          {groupSections.map((section, i) => (
            <Box key={section.label}>
              {i > 0 && <Divider sx={{ my: 1 }} />}
              {groupSections.length > 1 && (
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: "block", mb: 0.5 }}>
                  {section.label}
                </Typography>
              )}

              {(section.label === "Primary Tumors" || groupSections.length === 1) && (
                <>
                  <Stack direction="row" spacing={0.5} sx={{ mb: 0.5 }}>
                    <Button size="small" onClick={() => setSelectedGroups((prev) => {
                      const next = new Set(prev);
                      section.items.forEach((g) => next.add(g.key));
                      return next;
                    })}>All</Button>
                    <Button size="small" onClick={() => setSelectedGroups((prev) => {
                      const next = new Set(prev);
                      section.items.forEach((g) => next.delete(g.key));
                      return next;
                    })}>None</Button>
                    {(() => {
                      const enrichedKeys = section.items
                        .filter((g) => g.values.some((d) => highlightIds.has(d.id)))
                        .map((g) => g.key);
                      if (enrichedKeys.length === 0) return null;
                      return (
                        <Button size="small" onClick={() => setSelectedGroups((prev) => {
                          const next = new Set(prev);
                          section.items.forEach((g) => next.delete(g.key));
                          enrichedKeys.forEach((k) => next.add(k));
                          return next;
                        })}>Enriched</Button>
                      );
                    })()}
                  </Stack>
                  {section.items.map((g) => (
                    <Box key={g.key} sx={{ display: "block" }}>
                      <FormControlLabel
                        control={
                          <Checkbox
                            size="small"
                            checked={selectedGroups.has(g.key)}
                            onChange={() => toggleGroup(g.key)}
                            sx={{ color: groupColor(g), "&.Mui-checked": { color: groupColor(g) } }}
                          />
                        }
                        label={<Typography variant="body2">{g.label}</Typography>}
                      />
                    </Box>
                  ))}
                </>
              )}

              {section.label === "Controls" && (
                <>
                  {Object.entries(
                    section.items.reduce((acc, g) => {
                      const f = facetName(g);
                      (acc[f] = acc[f] || []).push(g);
                      return acc;
                    }, {})
                  )
                  .sort(([a], [b]) => FACET_ORDER.indexOf(a) - FACET_ORDER.indexOf(b))
                  .map(([facet, items]) => {
                    const allOn = items.every((g) => selectedGroups.has(g.key));
                    const someOn = items.some((g) => selectedGroups.has(g.key));
                    const isExpanded = expandedFacets.has(facet);
                    return (
                      <Box key={facet}>
                        <Stack direction="row" alignItems="center">
                          <Checkbox
                            size="small"
                            checked={allOn}
                            indeterminate={!allOn && someOn}
                            onChange={() => setSelectedGroups((prev) => {
                              const next = new Set(prev);
                              if (allOn) items.forEach((g) => next.delete(g.key));
                              else items.forEach((g) => next.add(g.key));
                              return next;
                            })}
                          />
                          <Typography variant="body2" sx={{ flex: 1 }}>{facet}</Typography>
                          <IconButton
                            size="small"
                            onClick={() => setExpandedFacets((prev) => {
                              const next = new Set(prev);
                              next.has(facet) ? next.delete(facet) : next.add(facet);
                              return next;
                            })}
                          >
                            <Typography variant="caption" sx={{ lineHeight: 1 }}>{isExpanded ? "▴" : "▾"}</Typography>
                          </IconButton>
                        </Stack>
                        {isExpanded && items.map((g) => (
                          <Box key={g.key} sx={{ pl: 2.5, display: "block" }}>
                            <FormControlLabel
                              control={
                                <Checkbox
                                  size="small"
                                  checked={selectedGroups.has(g.key)}
                                  onChange={() => toggleGroup(g.key)}
                                />
                              }
                              label={<Typography variant="body2">{g.label}</Typography>}
                            />
                          </Box>
                        ))}
                      </Box>
                    );
                  })}
                </>
              )}

              {section.label === "Cell Lines" && section.items.map((g) => (
                <Box key={g.key} sx={{ display: "block" }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={selectedGroups.has(g.key)}
                        onChange={() => toggleGroup(g.key)}
                        sx={{ color: groupColor(g), "&.Mui-checked": { color: groupColor(g) } }}
                      />
                    }
                    label={<Typography variant="body2">{g.label}</Typography>}
                  />
                </Box>
              ))}
            </Box>
          ))}

          {activeTab === TAB_EVO_DEVO && (
            <>
              {groupSections.length > 0 && <Divider sx={{ my: 1 }} />}
              <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                <Button size="small" onClick={() => setSelectedTimepoints(new Set(presentTimepoints))}>All</Button>
                <Button size="small" onClick={() => setSelectedTimepoints(new Set())}>None</Button>
              </Stack>
              {presentTimepoints.map((tp) => (
                <Box key={tp} sx={{ display: "block" }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={selectedTimepoints.has(tp)}
                        onChange={() => setSelectedTimepoints((prev) => {
                          const next = new Set(prev);
                          next.has(tp) ? next.delete(tp) : next.add(tp);
                          return next;
                        })}
                      />
                    }
                    label={<Typography variant="body2">{EVODEVO_LABELS[tp] ?? tp}</Typography>}
                  />
                </Box>
              ))}
            </>
          )}
        </Box>
      </Popover>

      <Box ref={containerRef} sx={{ width: "100%" }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", p: 6 }}>
            <CircularProgress />
          </Box>
        ) : fetchError ? (
          <Alert severity="error">Failed to load CPM data: {fetchError}</Alert>
        ) : (
          <svg ref={svgRef} width={containerWidth} height={height} style={{ display: "block" }} />
        )}
      </Box>

      {tooltip.visible && (
        <Box
          dangerouslySetInnerHTML={{ __html: tooltip.html }}
          onMouseEnter={cancelHide}
          onMouseLeave={() => { pinnedRef.current = false; setTooltip((prev) => ({ ...prev, visible: false })); }}
          sx={{
            position: "fixed",
            left: tooltip.x,
            top: tooltip.y,
            background: "rgba(30,30,30,0.9)",
            color: "#fff",
            px: "10px",
            py: "6px",
            borderRadius: "4px",
            fontSize: 12,
            lineHeight: 1.6,
            pointerEvents: "auto",
            zIndex: 9999,
            whiteSpace: "nowrap",
            "& a": {
              color: "#7eb8f7",
              textDecoration: "underline",
              cursor: "pointer",
            },
          }}
        />
      )}
    </Paper>
  );
}

// Plain alphabetical order would put "Forebrain (Postnatal)" before
// "Forebrain (Prenatal)" ('o' < 'r') -- this keeps Prenatal first within a
// region instead, matching JunctionExpressionHeatmap.jsx's row order.
function evoDevoLabelSort(a, b) {
  const phaseRank = (label) => (label.endsWith("(Prenatal)") ? 0 : label.endsWith("(Postnatal)") ? 1 : null);
  const aPhase = phaseRank(a);
  const bPhase = phaseRank(b);
  if (aPhase !== null && bPhase !== null) {
    if (aPhase !== bPhase) return aPhase - bPhase;
    return a.localeCompare(b);
  }
  return a.localeCompare(b);
}

function collapseControlGroup(plotGroup) {
  if (plotGroup.startsWith("Forebrain-")) {
    return plotGroup.includes("Week Post Conception")
      ? "Forebrain (Prenatal)"
      : "Forebrain (Postnatal)";
  }
  if (plotGroup.startsWith("Hindbrain-")) {
    return plotGroup.includes("Week Post Conception")
      ? "Hindbrain (Prenatal)"
      : "Hindbrain (Postnatal)";
  }
  if (plotGroup.startsWith("Brain - ")) {
    const stripped = plotGroup.slice("Brain - ".length);
    if (stripped.includes("basal ganglia")) return "Basal Ganglia";
    return stripped;
  }
  if (plotGroup.includes("basal ganglia")) return "Basal Ganglia";
  return plotGroup;
}
