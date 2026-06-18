import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Alert,
  Box,
  CircularProgress,
  Chip,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  Menu,
  MenuItem,
  Paper,
  Select,
  Slider,
  Stack,
  TextField,
  Button,
  ToggleButton,
  ToggleButtonGroup,
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
import writeXlsxFile from "write-excel-file/universal";
import { HISTOLOGY_COLORS } from "../histologyColors";
import PlotArea from "../components/PlotArea";
import ExonVis from "../components/ExonVis";

const API_BASE = (import.meta.env.VITE_API_BASE || "/tapestry-api").replace(/\/$/, "");

const HISTOLOGIES = Object.keys(HISTOLOGY_COLORS).sort();

// Slider bounds for the tumor-enrichment metrics. Defaults span the full
// bounds (no filtering applied).
const FC_BOUNDS = [0, 50];
const SNR_BOUNDS = [0, 50];
const MAX_MEAN_CPM_BOUNDS = [0, 10];

const isMinActive = (v, bounds) => v !== bounds[0];
const isMaxActive = (v, bounds) => v !== bounds[1];
const fmtNum = (n) => (Number.isInteger(n) ? n : n.toFixed(1));
const fmt2 = (n) => (n == null ? "—" : n.toFixed(2));

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

  const [histology, setHistology] = useState(initialHistology);
  const [geneFilter, setGeneFilter] = useState(initialGene);
  const [statusFilter, setStatusFilter] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("");
  const [specificityFilter, setSpecificityFilter] = useState("");
  const [cohortScope, setCohortScope] = useState("all"); // "all" | "postnatal"
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
  const specificityOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.consensus_specificity).filter(Boolean))).sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    const g = geneFilter.trim().toUpperCase();
    const fcField = `min_cpm_fc_${cohortScope}`;
    const snrField = `min_cpm_snr_${cohortScope}`;
    const maxMeanCpmField = `max_mean_cpm_${cohortScope}`;
    const fcActive = isMinActive(fcMin, FC_BOUNDS);
    const snrActive = isMinActive(snrMin, SNR_BOUNDS);
    const maxMeanCpmActive = isMaxActive(maxMeanCpmMax, MAX_MEAN_CPM_BOUNDS);

    return rows.filter((r) => {
      if (g && !(r.gene_symbol ?? "").toUpperCase().includes(g)) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      if (eventTypeFilter && r.event_type !== eventTypeFilter) return false;
      if (specificityFilter && r.consensus_specificity !== specificityFilter) return false;
      if (fcActive) {
        // null means the reference cohort has zero expression, i.e. an
        // infinite (maximally specific) fold-change, so it always passes.
        const v = r[fcField];
        if (v != null && v < fcMin) return false;
      }
      if (snrActive) {
        // null means the reference cohort has zero noise, i.e. an infinite
        // (maximally specific) SNR, so it always passes.
        const v = r[snrField];
        if (v != null && v < snrMin) return false;
      }
      if (maxMeanCpmActive) {
        const v = r[maxMeanCpmField];
        if (v == null || v > maxMeanCpmMax) return false;
      }
      return true;
    });
  }, [
    rows,
    geneFilter,
    statusFilter,
    eventTypeFilter,
    specificityFilter,
    cohortScope,
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

  const scopeLabel = cohortScope === "postnatal" ? "postnatal" : "all";

  // Looks up the sort value for a row/column, reading from the
  // cohort-scoped field (min_cpm_fc_all vs. min_cpm_fc_postnatal, etc.)
  // for the metric columns. Memoized so `sorted` depends on the function
  // reference rather than on `cohortScope` directly.
  const getSortValue = useCallback(
    (row, key) => {
      switch (key) {
        case "gene_symbol":
        case "consensus_specificity":
        case "event_type":
          return row[key];
        case "fc":
          return row[`min_cpm_fc_${cohortScope}`];
        case "snr":
          return row[`min_cpm_snr_${cohortScope}`];
        case "maxMeanCpm":
          return row[`max_mean_cpm_${cohortScope}`];
        case "num_samples":
          return row.num_samples;
        default:
          return null;
      }
    },
    [cohortScope]
  );

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
    { header: "consensus_specificity", get: (r) => r.consensus_specificity },
    { header: "status", get: (r) => r.status },
    { header: "event_type", get: (r) => r.event_type },
    { header: "min_cpm_fc_all", get: (r) => r.min_cpm_fc_all },
    { header: "min_cpm_fc_postnatal", get: (r) => r.min_cpm_fc_postnatal },
    { header: "min_cpm_snr_all", get: (r) => r.min_cpm_snr_all },
    { header: "min_cpm_snr_postnatal", get: (r) => r.min_cpm_snr_postnatal },
    { header: "max_mean_cpm_all", get: (r) => r.max_mean_cpm_all },
    { header: "max_mean_cpm_postnatal", get: (r) => r.max_mean_cpm_postnatal },
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
    if (specificityFilter) parts.push(slug(specificityFilter));
    if (isMinActive(fcMin, FC_BOUNDS)) parts.push(`FC${slug(fmtNum(fcMin))}`);
    if (isMinActive(snrMin, SNR_BOUNDS)) parts.push(`SNR${slug(fmtNum(snrMin))}`);
    if (isMaxActive(maxMeanCpmMax, MAX_MEAN_CPM_BOUNDS)) parts.push(`MaxCPM${slug(fmtNum(maxMeanCpmMax))}`);

    const MAX_PARTS = 3;
    const shown = parts.slice(0, MAX_PARTS);
    if (parts.length > MAX_PARTS) shown.push(`+${parts.length - MAX_PARTS}more`);
    return shown.map((p) => `_${p}`).join("");
  }, [histology, geneFilter, statusFilter, eventTypeFilter, specificityFilter, fcMin, snrMin, maxMeanCpmMax]);

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
    if (histology) chips.push({ key: "histology", label: `Histology: ${histology}` });
    if (geneFilter.trim()) chips.push({ key: "gene", label: `Gene: ${geneFilter.trim()}` });
    if (statusFilter) chips.push({ key: "status", label: `Status: ${statusFilter}` });
    if (eventTypeFilter) chips.push({ key: "eventType", label: `Event type: ${eventTypeFilter}` });
    if (specificityFilter) chips.push({ key: "specificity", label: `Specificity: ${specificityFilter}` });
    if (isMinActive(fcMin, FC_BOUNDS)) {
      chips.push({ key: "fc", label: `Fold-change (${scopeLabel}) ≥ ${fmtNum(fcMin)}` });
    }
    if (isMinActive(snrMin, SNR_BOUNDS)) {
      chips.push({ key: "snr", label: `SNR (${scopeLabel}) ≥ ${fmtNum(snrMin)}` });
    }
    if (isMaxActive(maxMeanCpmMax, MAX_MEAN_CPM_BOUNDS)) {
      chips.push({ key: "maxMeanCpm", label: `Max mean CPM (${scopeLabel}) ≤ ${fmtNum(maxMeanCpmMax)}` });
    }
    return chips;
  }, [
    histology,
    geneFilter,
    statusFilter,
    eventTypeFilter,
    specificityFilter,
    scopeLabel,
    fcMin,
    snrMin,
    maxMeanCpmMax,
  ]);

  const removeChip = (key) => {
    if (key === "histology") setHistology("");
    if (key === "gene") setGeneFilter("");
    if (key === "status") setStatusFilter("");
    if (key === "eventType") setEventTypeFilter("");
    if (key === "specificity") setSpecificityFilter("");
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

  return (
    <>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "280px 1fr" }, gap: 3 }}>
        {/* Filters */}
        <Stack spacing={3}>
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
                    <MenuItem key={h} value={h}>{h}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <TextField
                label="Gene"
                placeholder='e.g. "NRCAM"'
                value={geneFilter}
                size="small"
                onChange={(e) => setGeneFilter(e.target.value)}
                fullWidth
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

              <FormControl fullWidth size="small">
                <InputLabel id="specificity-label">Specificity</InputLabel>
                <Select
                  labelId="specificity-label"
                  label="Specificity"
                  value={specificityFilter}
                  onChange={(e) => setSpecificityFilter(e.target.value)}
                >
                  <MenuItem value="">All specificities</MenuItem>
                  {specificityOptions.map((s) => (
                    <MenuItem key={s} value={s}>{s}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>
          </Paper>

          <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, height: "fit-content" }}>
            <Stack spacing={1}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Reference filter
                </Typography>
              </Box>

              <Divider />

              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                  Reference cohorts
                </Typography>
                <ToggleButtonGroup
                  value={cohortScope}
                  exclusive
                  onChange={(_, v) => v && setCohortScope(v)}
                  size="small"
                  fullWidth
                >
                  <ToggleButton value="all">All</ToggleButton>
                  <ToggleButton value="postnatal">Postnatal</ToggleButton>
                </ToggleButtonGroup>
              </Box>

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
                  setStatusFilter("");
                  setEventTypeFilter("");
                  setSpecificityFilter("");
                  setCohortScope("all");
                  setFcMin(FC_BOUNDS[0]);
                  setSnrMin(SNR_BOUNDS[0]);
                  setMaxMeanCpmMax(MAX_MEAN_CPM_BOUNDS[1]);
                }}
                disabled={
                  !histology &&
                  !geneFilter.trim() &&
                  !statusFilter &&
                  !eventTypeFilter &&
                  !specificityFilter &&
                  !isMinActive(fcMin, FC_BOUNDS) &&
                  !isMinActive(snrMin, SNR_BOUNDS) &&
                  !isMaxActive(maxMeanCpmMax, MAX_MEAN_CPM_BOUNDS)
                }
              >
                Clear
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
                          active={sortKey === "gene_symbol"}
                          direction={sortKey === "gene_symbol" ? sortDir : "asc"}
                          onClick={() => handleSort("gene_symbol")}
                        >
                          Gene
                        </TableSortLabel>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>
                        <TableSortLabel
                          active={sortKey === "consensus_specificity"}
                          direction={sortKey === "consensus_specificity" ? sortDir : "asc"}
                          onClick={() => handleSort("consensus_specificity")}
                        >
                          Specificity
                        </TableSortLabel>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>
                        <TableSortLabel
                          active={sortKey === "event_type"}
                          direction={sortKey === "event_type" ? sortDir : "asc"}
                          onClick={() => handleSort("event_type")}
                        >
                          Event Type
                        </TableSortLabel>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, minWidth: 150, whiteSpace: "nowrap" }} align="right">
                        <TableSortLabel
                          active={sortKey === "fc"}
                          direction={sortKey === "fc" ? sortDir : "asc"}
                          onClick={() => handleSort("fc")}
                        >
                          Fold-change ({scopeLabel})
                        </TableSortLabel>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, minWidth: 150, whiteSpace: "nowrap" }} align="right">
                        <TableSortLabel
                          active={sortKey === "snr"}
                          direction={sortKey === "snr" ? sortDir : "asc"}
                          onClick={() => handleSort("snr")}
                        >
                          SNR ({scopeLabel})
                        </TableSortLabel>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, minWidth: 170, whiteSpace: "nowrap" }} align="right">
                        <TableSortLabel
                          active={sortKey === "maxMeanCpm"}
                          direction={sortKey === "maxMeanCpm" ? sortDir : "asc"}
                          onClick={() => handleSort("maxMeanCpm")}
                        >
                          Max mean CPM ({scopeLabel})
                        </TableSortLabel>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">
                        <TableSortLabel
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
                          <TableCell>{row.consensus_specificity ?? "—"}</TableCell>
                          <TableCell>{row.event_type ?? "—"}</TableCell>
                          <TableCell align="right">{fmt2(row[`min_cpm_fc_${cohortScope}`])}</TableCell>
                          <TableCell align="right">{fmt2(row[`min_cpm_snr_${cohortScope}`])}</TableCell>
                          <TableCell align="right">{fmt2(row[`max_mean_cpm_${cohortScope}`])}</TableCell>
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
            highlightIds={tumorSampleIds}
          />
        </Box>
      )}
      <Box sx={{ mt: 3 }}>
        <ExonVis
          gene={selectedRow?.gene_symbol ?? null}
          exonID={null}
          eventType={selectedRow?.event_type ?? ""}
          strand={selectedRow?.strand ?? "+"}
        />
      </Box>
    </>
  );
}
