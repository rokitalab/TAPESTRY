import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Alert,
  Box,
  Checkbox,
  CircularProgress,
  Chip,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputAdornment,
  InputLabel,
  Menu,
  MenuItem,
  Paper,
  Select,
  Slider,
  Stack,
  Switch,
  TextField,
  Button,
  Tooltip,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TableSortLabel,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import writeXlsxFile from "write-excel-file/universal";
import { HISTOLOGIES, histologyLabel } from "../histologyColors";
import PlotArea from "../components/PlotArea";
import TranscriptVis from "../components/TranscriptVis";
import JunctionExpressionHeatmap from "../components/JunctionExpressionHeatmap";
import GeneModelGtex from "../components/GeneModelGtex";

const API_BASE = (import.meta.env.VITE_API_BASE || "/tapestry-api").replace(/\/$/, "");

// Gene symbol → Ensembl gene ID, kept for the page session so reselecting a
// gene (or returning to Explore) doesn't repeat the xrefs lookup.
const ensgCache = new Map();


// Slider bounds for the tumor-enrichment metrics. FC and SNR can't go below
// the minimum threshold of 5; defaults sit at the lower bounds.
const FC_BOUNDS = [5, 50];
const SNR_BOUNDS = [5, 50];
const MAX_MEAN_CPM_BOUNDS = [0, 10];

// Shrinks the TableSortLabel arrow so it doesn't crowd out header text on
// the narrower numeric columns.
const sortLabelSx = { "& .MuiTableSortLabel-icon": { fontSize: "0.85rem" } };

const isMinActive = (v, bounds) => v !== bounds[0];
const isMaxActive = (v, bounds) => v !== bounds[1];
const fmtNum = (n) => (Number.isInteger(n) ? n : n.toFixed(1));
const fmt2 = (n) => (n == null ? "—" : n.toFixed(2));

// Every TEJ is tumor-enriched; oncofetal is the subset also expressed in at
// least one prenatal evo-devo group (semicolon-separated in the API).
const isOncofetal = (r) => r.junction_preference?.toLowerCase() === "oncofetal";
const prenatalGroups = (r) =>
  isOncofetal(r) && r.oncofetal_prenatal_group
    ? r.oncofetal_prenatal_group.split(";").map((g) => g.trim()).filter(Boolean)
    : [];

// No expression in any reference control cohort, prenatal or postnatal: the
// junction is absent from every control matrix ("No ctrl expr" criteria).
const hasNoControlExpr = (r) => Boolean(r.criteria?.startsWith("No ctrl expr"));

function triggerDownload(href, filename) {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.click();
}


export default function Explore() {
  const location = useLocation();
  const initialGene = useMemo(
    () => new URLSearchParams(location.search).get("gene") || "",
    [location.search]
  );
  const initialHistology = useMemo(
    () => new URLSearchParams(location.search).get("histology") || "",
    [location.search]
  );
  const initialGeneExact = useMemo(
    () => new URLSearchParams(location.search).get("exact") === "1",
    [location.search]
  );

  const [histology, setHistology] = useState(initialHistology);
  const [geneFilter, setGeneFilter] = useState(initialGene);
  const [geneExact, setGeneExact] = useState(initialGeneExact);
  const [statusFilter, setStatusFilter] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("");
  const [oncofetalOnly, setOncofetalOnly] = useState(false);
  const [includeNoCtrlExpr, setIncludeNoCtrlExpr] = useState(true);
  const [fcMin, setFcMin] = useState(FC_BOUNDS[0]);
  const [snrMin, setSnrMin] = useState(SNR_BOUNDS[0]);
  const [maxMeanCpmMax, setMaxMeanCpmMax] = useState(MAX_MEAN_CPM_BOUNDS[1]);

  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");

  const [rows, setRows] = useState([]);
  const [fetchError, setFetchError] = useState(null);
  // Histology that `rows`/`fetchError` currently reflect; mismatched
  // means a fetch for the current histology is still in flight.
  const [loadedFor, setLoadedFor] = useState(null);
  const loading = loadedFor !== histology;

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Fetch whenever histology changes (other filters are client-side)
  useEffect(() => {
    let active = true;
    const url = histology
      ? `${API_BASE}/tej-view/?plot_group=${encodeURIComponent(histology)}`
      : `${API_BASE}/tej-view/`;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (!active) return;
        setRows(data);
        setFetchError(null);
        setPage(0);
      })
      .catch((e) => {
        if (!active) return;
        setFetchError(e.message);
      })
      .finally(() => {
        if (active) setLoadedFor(histology);
      });
    return () => { active = false; };
  }, [histology]);

  const statusOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.status).filter(Boolean))).sort(),
    [rows]
  );
  const eventTypeOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.event_type).filter(Boolean))).sort(),
    [rows]
  );
  const filtered = useMemo(() => {
    const g = geneFilter.trim().toUpperCase();
    const maxMeanCpmActive = isMaxActive(maxMeanCpmMax, MAX_MEAN_CPM_BOUNDS);

    return rows.filter((r) => {
      const rowGene = (r.gene_symbol ?? "").toUpperCase();
      if (g && (geneExact ? rowGene !== g : !rowGene.includes(g))) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      if (eventTypeFilter && r.event_type !== eventTypeFilter) return false;
      if (oncofetalOnly && !isOncofetal(r)) return false;
      if (!includeNoCtrlExpr && hasNoControlExpr(r)) return false;
      // null means the reference cohort has zero expression (or noise), i.e.
      // an infinite (maximally specific) fold-change or SNR, so it always passes.
      if (r.min_cpm_fc_postnatal != null && r.min_cpm_fc_postnatal < fcMin) return false;
      if (r.min_cpm_snr_postnatal != null && r.min_cpm_snr_postnatal < snrMin) return false;
      // null means the junction is absent from every control matrix (no
      // control expression), so it always passes the maximum.
      if (maxMeanCpmActive) {
        const v = r.max_mean_cpm_postnatal;
        if (v != null && v > maxMeanCpmMax) return false;
      }
      return true;
    });
  }, [
    rows,
    geneFilter,
    geneExact,
    statusFilter,
    eventTypeFilter,
    oncofetalOnly,
    includeNoCtrlExpr,
    fcMin,
    snrMin,
    maxMeanCpmMax,
  ]);

  // Reset to the first page whenever the filtered result set changes.
  // useMemo returns the same `filtered` reference across renders where its
  // dependencies are unchanged, so this only fires on an actual change.
  const [prevFiltered, setPrevFiltered] = useState(filtered);
  if (filtered !== prevFiltered) {
    setPrevFiltered(filtered);
    setPage(0);
  }

  // Looks up the sort value for a row/column. The metric columns are
  // computed against postnatal reference cohorts.
  const getSortValue = useCallback((row, key) => {
    switch (key) {
      case "gene_symbol":
      case "event_type":
        return row[key];
      case "oncofetal":
        return prenatalGroups(row).length;
      case "fc":
        return row.min_cpm_fc_postnatal;
      case "snr":
        return row.min_cpm_snr_postnatal;
      case "maxMeanCpm":
        return row.max_mean_cpm_postnatal;
      case "num_samples":
        return row.num_samples;
      default:
        return null;
    }
  }, []);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const arr = [...filtered];
    arr.sort((a, b) => {
      const va = getSortValue(a, sortKey);
      const vb = getSortValue(b, sortKey);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "string") {
        return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return sortDir === "asc" ? va - vb : vb - va;
    });
    return arr;
  }, [filtered, sortKey, sortDir, getSortValue]);

  // Resets the selection to the top row whenever `sorted` changes and the
  // current selection is no longer in it; otherwise leaves it as-is. Runs
  // during render, matching the `prevFiltered` page-reset above, so the
  // plots/transcripts below always have a row to show, including on first
  // load.
  const [prevSorted, setPrevSorted] = useState(sorted);
  const [selectedRow, setSelectedRow] = useState(() => sorted[0] ?? null);
  if (sorted !== prevSorted) {
    setPrevSorted(sorted);
    if (!(selectedRow && sorted.some((r) => r.junction === selectedRow.junction))) {
      setSelectedRow(sorted[0] ?? null);
    }
  }

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const [downloadAnchor, setDownloadAnchor] = useState(null);

  // Snake-case headers matching the tej-view API fields directly, so the
  // export can be loaded/joined programmatically (e.g. pandas) without
  // re-mapping human-readable labels. chr/strand are split out from the
  // junction string since downstream genomic tools expect them separately.
  const exportColumns = [
    { header: "junction_name", get: (r) => r.junction_name },
    { header: "junction_id", get: (r) => r.junction },
    { header: "chr", get: (r) => r.chr },
    { header: "strand", get: (r) => r.strand },
    { header: "gene_symbol", get: (r) => r.gene_symbol },
    { header: "junction_preference", get: (r) => r.junction_preference },
    { header: "status", get: (r) => r.status },
    { header: "event_type", get: (r) => r.event_type },
    { header: "criteria", get: (r) => r.criteria },
    { header: "library_bias", get: (r) => r.library_bias },
    { header: "min_cpm_fc_postnatal", get: (r) => r.min_cpm_fc_postnatal },
    { header: "min_cpm_snr_postnatal", get: (r) => r.min_cpm_snr_postnatal },
    { header: "max_mean_cpm_postnatal", get: (r) => r.max_mean_cpm_postnatal },
    { header: "max_prenatal_min_cpm_fc", get: (r) => r.max_prenatal_min_cpm_fc },
    { header: "max_prenatal_min_cpm_snr", get: (r) => r.max_prenatal_min_cpm_snr },
    { header: "oncofetal_prenatal_group", get: (r) => r.oncofetal_prenatal_group },
    { header: "num_samples", get: (r) => r.num_samples },
  ];

  // Short, filename-safe tags for the active filters, in the same order as
  // activeChips but stripped to bare values (no "Histology: " labels/units/
  // symbols) since those aren't valid/readable in a filename. Capped so a
  // heavily-filtered export still gets a usable name instead of one with
  // every slider value crammed in.
  const filenameTag = useMemo(() => {
    const slug = (s) => String(s).replace(/[^a-zA-Z0-9]+/g, "");
    const parts = [];
    if (histology) parts.push(slug(histology));
    if (geneFilter.trim()) parts.push(slug(geneFilter.trim()));
    if (statusFilter) parts.push(slug(statusFilter));
    if (eventTypeFilter) parts.push(slug(eventTypeFilter));
    if (oncofetalOnly) parts.push("Oncofetal");
    if (!includeNoCtrlExpr) parts.push("NoCtrlExprExcluded");
    if (isMinActive(fcMin, FC_BOUNDS)) parts.push(`FC${slug(fmtNum(fcMin))}`);
    if (isMinActive(snrMin, SNR_BOUNDS)) parts.push(`SNR${slug(fmtNum(snrMin))}`);
    if (isMaxActive(maxMeanCpmMax, MAX_MEAN_CPM_BOUNDS)) parts.push(`MaxCPM${slug(fmtNum(maxMeanCpmMax))}`);

    const MAX_PARTS = 3;
    const shown = parts.slice(0, MAX_PARTS);
    if (parts.length > MAX_PARTS) shown.push(`+${parts.length - MAX_PARTS}more`);
    return shown.map((p) => `_${p}`).join("");
  }, [histology, geneFilter, statusFilter, eventTypeFilter, oncofetalOnly, includeNoCtrlExpr, fcMin, snrMin, maxMeanCpmMax]);

  const exportFilename = (ext) => {
    const date = new Date().toISOString().slice(0, 10);
    return `TAPESTRY${filenameTag}_${date}.${ext}`;
  };

  const downloadTsv = () => {
    const escapeTsv = (v) => String(v ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
    const lines = [exportColumns.map((c) => c.header).join("\t")];
    sorted.forEach((r) => lines.push(exportColumns.map((c) => escapeTsv(c.get(r))).join("\t")));
    const blob = new Blob([lines.join("\n")], { type: "text/tab-separated-values;charset=utf-8" });
    triggerDownload(URL.createObjectURL(blob), exportFilename("tsv"));
  };

  const downloadExcel = async () => {
    const headers = exportColumns.map((c) => c.header);
    const rows = sorted.map((r) => exportColumns.map((c) => c.get(r)));
    const blob = await writeXlsxFile([headers, ...rows]).toBlob();
    triggerDownload(URL.createObjectURL(blob), exportFilename("xlsx"));
  };

  const paged = useMemo(() => {
    const start = page * rowsPerPage;
    return sorted.slice(start, start + rowsPerPage);
  }, [sorted, page, rowsPerPage]);

  const activeChips = useMemo(() => {
    const chips = [];
    if (histology) chips.push({ key: "histology", label: `Histology: ${histologyLabel(histology)}` });
    if (geneFilter.trim()) {
      chips.push({
        key: "gene",
        label: `Gene: ${geneFilter.trim()}${geneExact ? " (exact)" : ""}`,
      });
    }
    if (statusFilter) chips.push({ key: "status", label: `Status: ${statusFilter}` });
    if (eventTypeFilter) chips.push({ key: "eventType", label: `Event type: ${eventTypeFilter}` });
    if (oncofetalOnly) chips.push({ key: "oncofetal", label: "Oncofetal only" });
    if (!includeNoCtrlExpr) chips.push({ key: "noCtrlExpr", label: "No control expression: excluded" });
    if (isMinActive(fcMin, FC_BOUNDS)) {
      chips.push({ key: "fc", label: `Fold-change ≥ ${fmtNum(fcMin)}` });
    }
    if (isMinActive(snrMin, SNR_BOUNDS)) {
      chips.push({ key: "snr", label: `SNR ≥ ${fmtNum(snrMin)}` });
    }
    if (isMaxActive(maxMeanCpmMax, MAX_MEAN_CPM_BOUNDS)) {
      chips.push({ key: "maxMeanCpm", label: `Max mean CPM ≤ ${fmtNum(maxMeanCpmMax)}` });
    }
    return chips;
  }, [
    histology,
    geneFilter,
    geneExact,
    statusFilter,
    eventTypeFilter,
    oncofetalOnly,
    includeNoCtrlExpr,
    fcMin,
    snrMin,
    maxMeanCpmMax,
  ]);

  const removeChip = (key) => {
    if (key === "histology") setHistology("");
    if (key === "gene") {
      setGeneFilter("");
      setGeneExact(false);
    }
    if (key === "status") setStatusFilter("");
    if (key === "eventType") setEventTypeFilter("");
    if (key === "oncofetal") setOncofetalOnly(false);
    if (key === "noCtrlExpr") setIncludeNoCtrlExpr(true);
    if (key === "fc") setFcMin(FC_BOUNDS[0]);
    if (key === "snr") setSnrMin(SNR_BOUNDS[0]);
    if (key === "maxMeanCpm") setMaxMeanCpmMax(MAX_MEAN_CPM_BOUNDS[1]);
  };

  const [tumorSamples, setTumorSamples] = useState([]);

  useEffect(() => {
    const junction = selectedRow?.junction;
    // Skips the fetch with no junction selected, leaving tumorSamples as-is.
    // PlotArea (the only consumer of tumorSampleIds) doesn't render without
    // selectedRow, so the stale value is never shown.
    if (!junction) return;
    let active = true;
    fetch(`${API_BASE}/junction-sample-view/?junction=${encodeURIComponent(junction)}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => { if (active) setTumorSamples(data); })
      .catch(() => { if (active) setTumorSamples([]); });
    return () => { active = false; };
  }, [selectedRow]);

  const tumorSampleIds = useMemo(
    () => new Set(tumorSamples.map((s) => s.biospecimen_id)),
    [tumorSamples]
  );

  // Resolve gene symbol → Ensembl gene ID for TranscriptVis. Cached IDs are
  // applied during render; only uncached symbols hit Ensembl.
  const txGene = selectedRow?.gene_symbol ?? null;
  const [ensgId, setEnsgId] = useState(() => ensgCache.get(txGene) ?? null);
  const [ensgError, setEnsgError] = useState(null);
  const [prevTxGene, setPrevTxGene] = useState(txGene);
  if (txGene !== prevTxGene) {
    setPrevTxGene(txGene);
    setEnsgId(ensgCache.get(txGene) ?? null);
    setEnsgError(null);
  }

  useEffect(() => {
    if (!txGene || ensgCache.has(txGene)) return;
    const controller = new AbortController();
    let active = true;
    fetch(
      `https://rest.ensembl.org/xrefs/symbol/homo_sapiens/${encodeURIComponent(txGene)}?content-type=application/json`,
      { signal: controller.signal, headers: { Accept: "application/json" } }
    )
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (!active || !Array.isArray(data)) return;
        const ensg = data.find((e) => e.type === "gene" && e.id?.startsWith("ENSG"))?.id;
        if (ensg) {
          ensgCache.set(txGene, ensg);
          setEnsgId(ensg);
        }
      })
      .catch((err) => {
        if (active && err.name !== "AbortError") setEnsgError(err.message);
      });
    return () => { active = false; controller.abort(); };
  }, [txGene]);

  // Parse transcript name from junction_name, e.g. "UBE3A-201, exon5:exon4" → "UBE3A-201"
  const highlightedTranscript = useMemo(() => {
    const name = selectedRow?.junction_name;
    if (!name) return null;
    const comma = name.indexOf(",");
    return comma > -1 ? name.slice(0, comma).trim() : null;
  }, [selectedRow]);

  // Parse junction coords from junction field, e.g. "chr10:116862799-116862852_116868650-116868706"
  // Middle two values (end1, start2) are the splice donor and acceptor sites.
  const junctionCoords = useMemo(() => {
    const j = selectedRow?.junction;
    if (!j) return null;
    const m = j.match(/:(\d+)-(\d+)_(\d+)-(\d+)/);
    if (!m) return null;
    return {
      donorSite:    parseInt(m[2], 10),
      acceptorSite: parseInt(m[3], 10),
      eventType:    selectedRow?.event_type ?? "",
    };
  }, [selectedRow]);

  return (
    <>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "280px 1fr" }, gap: 3 }}>
        {/* Filters */}
        <Stack spacing={2}>
          <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, height: "fit-content" }}>
            <Stack spacing={1}>
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 800 }}>
                  Explore
                </Typography>
              </Box>

              <Divider />

              <FormControl fullWidth size="small">
                <InputLabel id="histology-label">Histology</InputLabel>
                <Select
                  labelId="histology-label"
                  label="Histology"
                  value={histology}
                  onChange={(e) => setHistology(e.target.value)}
                >
                  <MenuItem value="">All histologies</MenuItem>
                  {HISTOLOGIES.map((h) => (
                    <MenuItem key={h} value={h}>{histologyLabel(h)}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <TextField
                label="Gene"
                placeholder='e.g. "NRCAM"'
                value={geneFilter}
                size="small"
                onChange={(e) => setGeneFilter(e.target.value.toUpperCase())}
                fullWidth
                InputProps={{
                  endAdornment: geneFilter.trim() ? (
                    <InputAdornment position="end">
                      <Tooltip title="Exact match only">
                        <Stack
                          direction="row"
                          alignItems="center"
                          spacing={0.25}
                          sx={{ cursor: "pointer" }}
                          onClick={() => setGeneExact((v) => !v)}
                        >
                          <Checkbox
                            size="small"
                            checked={geneExact}
                            onChange={(e) => setGeneExact(e.target.checked)}
                            onClick={(e) => e.stopPropagation()}
                            sx={{ p: 0.5 }}
                          />
                          <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                            Exact
                          </Typography>
                        </Stack>
                      </Tooltip>
                    </InputAdornment>
                  ) : null,
                }}
              />

              <FormControl fullWidth size="small">
                <InputLabel id="status-label">Junction status</InputLabel>
                <Select
                  labelId="status-label"
                  label="Junction status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <MenuItem value="">All statuses</MenuItem>
                  {statusOptions.map((s) => (
                    <MenuItem key={s} value={s}>{s}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl fullWidth size="small">
                <InputLabel id="event-type-label">Event type</InputLabel>
                <Select
                  labelId="event-type-label"
                  label="Event type"
                  value={eventTypeFilter}
                  onChange={(e) => setEventTypeFilter(e.target.value)}
                >
                  <MenuItem value="">All event types</MenuItem>
                  {eventTypeOptions.map((e) => (
                    <MenuItem key={e} value={e}>{e}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControlLabel
                control={
                  <Switch
                    id="oncofetal-only"
                    size="small"
                    checked={oncofetalOnly}
                    onChange={(e) => setOncofetalOnly(e.target.checked)}
                  />
                }
                label={<Typography variant="body2" sx={{ fontSize: "0.79rem" }}>Oncofetal only</Typography>}
              />

              <FormControlLabel
                control={
                  <Switch
                    id="include-no-ctrl-expr"
                    size="small"
                    checked={includeNoCtrlExpr}
                    onChange={(e) => setIncludeNoCtrlExpr(e.target.checked)}
                  />
                }
                label={
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <Typography variant="body2" sx={{ fontSize: "0.79rem" }}>Include no control expression</Typography>
                    <Tooltip
                      arrow
                      title="Junctions with no expression in any control cohort, prenatal or postnatal (GTEx <40, evo-devo, pediatric normal brain and brain cell types). They are the most tumor-specific junctions, but most use a novel splice site and some may be technical artifacts, such as alignment errors, so check recurrence before relying on one. Turn off to exclude them."
                    >
                      <InfoOutlinedIcon fontSize="small" sx={{ color: "text.secondary", cursor: "help" }} />
                    </Tooltip>
                  </Box>
                }
              />
            </Stack>
          </Paper>

          <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, height: "fit-content" }}>
            <Stack spacing={1}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Reference filter
                </Typography>
                <Tooltip
                  title={
                    <Box sx={{ p: 0.5 }}>
                      <Typography variant="body2" sx={{ mb: 1 }}>
                        <strong>Reference cohorts:</strong> fold-change, SNR and max mean CPM compare tumor signal
                        against postnatal control cohorts only (adult GTEx, postnatal evo-devo timepoints, and
                        pediatric normal brain).
                      </Typography>
                      <Typography variant="body2" sx={{ mb: 1 }}>
                        <strong>Tumor-enriched:</strong> fold-change &gt; 5 and SNR &gt; 5 against every postnatal
                        control group, with no control group averaging 10 CPM or more.
                      </Typography>
                      <Typography variant="body2">
                        <strong>Oncofetal:</strong> a tumor-enriched junction that is also expressed in at least one
                        prenatal evo-devo group (fold-change &gt; 2 and SNR &gt; 2 against every postnatal group).
                        See the Docs page for full details.
                      </Typography>
                    </Box>
                  }
                  arrow
                >
                  <InfoOutlinedIcon fontSize="small" sx={{ color: "text.secondary", cursor: "help" }} />
                </Tooltip>
              </Box>

              <Divider />

              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Min CPM fold-change ≥ {fmtNum(fcMin)}
                </Typography>
                <Slider
                  value={fcMin}
                  onChange={(_, v) => setFcMin(v)}
                  min={FC_BOUNDS[0]}
                  max={FC_BOUNDS[1]}
                  step={0.5}
                  marks={[{ value: 5 }]}
                  valueLabelDisplay="auto"
                  size="small"
                />
              </Box>

              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Min CPM signal-to-noise ratio ≥ {fmtNum(snrMin)}
                </Typography>
                <Slider
                  value={snrMin}
                  onChange={(_, v) => setSnrMin(v)}
                  min={SNR_BOUNDS[0]}
                  max={SNR_BOUNDS[1]}
                  step={0.5}
                  marks={[{ value: 5 }]}
                  valueLabelDisplay="auto"
                  size="small"
                />
              </Box>

              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Max mean CPM ≤ {fmtNum(maxMeanCpmMax)}
                </Typography>
                <Slider
                  value={maxMeanCpmMax}
                  onChange={(_, v) => setMaxMeanCpmMax(v)}
                  min={MAX_MEAN_CPM_BOUNDS[0]}
                  max={MAX_MEAN_CPM_BOUNDS[1]}
                  step={0.1}
                  marks={[{ value: 10 }]}
                  valueLabelDisplay="auto"
                  size="small"
                />
              </Box>

              <Divider />

              <Button
                variant="text"
                onClick={() => {
                  setHistology("");
                  setGeneFilter("");
                  setGeneExact(false);
                  setStatusFilter("");
                  setEventTypeFilter("");
                  setOncofetalOnly(false);
                  setIncludeNoCtrlExpr(true);
                  setFcMin(FC_BOUNDS[0]);
                  setSnrMin(SNR_BOUNDS[0]);
                  setMaxMeanCpmMax(MAX_MEAN_CPM_BOUNDS[1]);
                }}
                disabled={
                  !histology &&
                  !geneFilter.trim() &&
                  !statusFilter &&
                  !eventTypeFilter &&
                  !oncofetalOnly &&
                  includeNoCtrlExpr &&
                  !isMinActive(fcMin, FC_BOUNDS) &&
                  !isMinActive(snrMin, SNR_BOUNDS) &&
                  !isMaxActive(maxMeanCpmMax, MAX_MEAN_CPM_BOUNDS)
                }
              >
                Clear all filters
              </Button>
            </Stack>
          </Paper>
        </Stack>

        {/* Results */}
        <Box>
          <Stack direction="row" spacing={1} sx={{ mb: 2, justifyContent: "space-between", alignItems: "flex-start" }}>
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
              {activeChips.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  No filters applied — showing all TEJs.
                </Typography>
              ) : (
                activeChips.map((c) => (
                  <Chip color="secondary" key={c.key} label={c.label} onDelete={() => removeChip(c.key)} />
                ))
              )}
            </Stack>

            <Tooltip title="Download table">
              <IconButton
                size="small"
                disabled={sorted.length === 0}
                onClick={(e) => setDownloadAnchor(e.currentTarget)}
              >
                <DownloadIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Menu anchorEl={downloadAnchor} open={Boolean(downloadAnchor)} onClose={() => setDownloadAnchor(null)}>
              <MenuItem onClick={() => { setDownloadAnchor(null); downloadTsv(); }}>TSV</MenuItem>
              <MenuItem onClick={() => { setDownloadAnchor(null); downloadExcel(); }}>Excel</MenuItem>
            </Menu>
          </Stack>

          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", p: 6 }}>
              <CircularProgress />
            </Box>
          ) : fetchError ? (
            <Alert severity="error">Failed to load TEJs: {fetchError}</Alert>
          ) : (
            <Paper variant="outlined" sx={{ borderRadius: 2 }}>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Junction</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>
                        <TableSortLabel
                          sx={sortLabelSx}
                          active={sortKey === "gene_symbol"}
                          direction={sortKey === "gene_symbol" ? sortDir : "asc"}
                          onClick={() => handleSort("gene_symbol")}
                        >
                          Gene
                        </TableSortLabel>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>
                        <TableSortLabel
                          sx={sortLabelSx}
                          active={sortKey === "oncofetal"}
                          direction={sortKey === "oncofetal" ? sortDir : "asc"}
                          onClick={() => handleSort("oncofetal")}
                        >
                          Oncofetal
                        </TableSortLabel>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>
                        <TableSortLabel
                          sx={sortLabelSx}
                          active={sortKey === "event_type"}
                          direction={sortKey === "event_type" ? sortDir : "asc"}
                          onClick={() => handleSort("event_type")}
                        >
                          Event Type
                        </TableSortLabel>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, minWidth: 90 }} align="right">
                        <TableSortLabel
                          sx={sortLabelSx}
                          active={sortKey === "fc"}
                          direction={sortKey === "fc" ? sortDir : "asc"}
                          onClick={() => handleSort("fc")}
                        >
                          Fold-change
                        </TableSortLabel>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, minWidth: 90 }} align="right">
                        <TableSortLabel
                          sx={sortLabelSx}
                          active={sortKey === "snr"}
                          direction={sortKey === "snr" ? sortDir : "asc"}
                          onClick={() => handleSort("snr")}
                        >
                          SNR
                        </TableSortLabel>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, minWidth: 116 }} align="right">
                        <TableSortLabel
                          sx={sortLabelSx}
                          active={sortKey === "maxMeanCpm"}
                          direction={sortKey === "maxMeanCpm" ? sortDir : "asc"}
                          onClick={() => handleSort("maxMeanCpm")}
                        >
                          Max mean CPM
                        </TableSortLabel>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">
                        <TableSortLabel
                          sx={sortLabelSx}
                          active={sortKey === "num_samples"}
                          direction={sortKey === "num_samples" ? sortDir : "asc"}
                          onClick={() => handleSort("num_samples")}
                        >
                          Samples
                        </TableSortLabel>
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paged.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8}>
                          <Box sx={{ p: 2 }}>
                            <Typography sx={{ fontWeight: 700 }}>No results</Typography>
                            <Typography variant="body2" color="text.secondary">
                              Try adjusting your filters.
                            </Typography>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ) : (
                      paged.map((row) => (
                        <TableRow
                          key={row.junction}
                          hover
                          selected={selectedRow?.junction === row.junction}
                          onClick={() => setSelectedRow(row)}
                          sx={{ cursor: "pointer" }}
                        >
                          <TableCell>
                            <Typography
                              variant="caption"
                              sx={{ fontFamily: "monospace", fontSize: "0.7rem" }}
                              title={row.junction_name ?? row.junction}
                            >
                              {(row.junction_name ?? row.junction).length > 38
                                ? `${(row.junction_name ?? row.junction).slice(0, 38)}…`
                                : (row.junction_name ?? row.junction)}
                            </Typography>
                          </TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>{row.gene_symbol ?? "—"}</TableCell>
                          <TableCell>
                            {(() => {
                              const groups = prenatalGroups(row);
                              if (!groups.length) return "—";
                              return (
                                <Tooltip
                                  arrow
                                  title={groups.map((g) => (
                                    <Box key={g}>{g.replace(/_/g, " ")}</Box>
                                  ))}
                                >
                                  <Typography
                                    variant="body2"
                                    component="span"
                                    sx={{
                                      cursor: "help",
                                      textDecoration: "underline dotted",
                                      textUnderlineOffset: 3,
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {groups.length} {groups.length === 1 ? "group" : "groups"}
                                  </Typography>
                                </Tooltip>
                              );
                            })()}
                          </TableCell>
                          <TableCell>{row.event_type ?? "—"}</TableCell>
                          <TableCell align="right">{fmt2(row.min_cpm_fc_postnatal)}</TableCell>
                          <TableCell align="right">{fmt2(row.min_cpm_snr_postnatal)}</TableCell>
                          <TableCell align="right">{fmt2(row.max_mean_cpm_postnatal)}</TableCell>
                          <TableCell align="right">{row.num_samples}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                component="div"
                count={filtered.length}
                page={page}
                onPageChange={(_, nextPage) => setPage(nextPage)}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={(e) => {
                  setRowsPerPage(parseInt(e.target.value, 10));
                  setPage(0);
                }}
                rowsPerPageOptions={[10, 25, 50, 100]}
              />
            </Paper>
          )}
        </Box>
      </Box>

      {selectedRow && (
        <Box sx={{ mt: 3 }}>
          <PlotArea
            junction={selectedRow.junction}
            gene={selectedRow.gene_symbol}
            junctionName={selectedRow.junction_name}
            highlightIds={tumorSampleIds}
          />
        </Box>
      )}
      {ensgId && (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mt: 3 }}>
          <TranscriptVis
            geneID={ensgId}
            geneName={txGene}
            strand={selectedRow?.strand ?? "+"}
            highlightedTranscript={highlightedTranscript}
            highlightedTranscriptId={selectedRow?.transcript_id ?? null}
            junctionCoords={junctionCoords}
            junctionName={selectedRow?.junction_name ?? null}
            junctionString={selectedRow?.junction ?? null}
          />
        </Paper>
      )}
      {!ensgId && ensgError && (
        <Alert severity="warning" sx={{ mt: 3 }}>
          Gene model is temporarily unavailable — Ensembl's API isn't responding ({ensgError}). Try again later.
        </Alert>
      )}
    </>
  );
}
