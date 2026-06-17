import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  CircularProgress,
  Chip,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Slider,
  Stack,
  TextField,
  Button,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
} from "@mui/material";
import { HISTOLOGY_COLORS } from "../histologyColors";

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

export default function Tejs() {
  const [histology, setHistology] = useState("");
  const [geneFilter, setGeneFilter] = useState("");
  const [cohortScope, setCohortScope] = useState("all"); // "all" | "postnatal"
  const [fcMin, setFcMin] = useState(FC_BOUNDS[0]);
  const [snrMin, setSnrMin] = useState(SNR_BOUNDS[0]);
  const [maxMeanCpmMax, setMaxMeanCpmMax] = useState(MAX_MEAN_CPM_BOUNDS[1]);

  const [rows, setRows] = useState([]);
  const [fetchError, setFetchError] = useState(null);
  // Histology that `rows`/`fetchError` currently reflect; mismatched
  // means a fetch for the current histology is still in flight.
  const [loadedFor, setLoadedFor] = useState(null);
  const loading = loadedFor !== histology;

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Fetch whenever histology changes (gene filter is client-side)
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
  }, [rows, geneFilter, cohortScope, fcMin, snrMin, maxMeanCpmMax]);

  // Reset to the first page whenever the filtered result set changes.
  // useMemo returns the same `filtered` reference across renders where its
  // dependencies are unchanged, so this only fires on an actual change.
  const [prevFiltered, setPrevFiltered] = useState(filtered);
  if (filtered !== prevFiltered) {
    setPrevFiltered(filtered);
    setPage(0);
  }

  const paged = useMemo(() => {
    const start = page * rowsPerPage;
    return filtered.slice(start, start + rowsPerPage);
  }, [filtered, page, rowsPerPage]);

  const scopeLabel = cohortScope === "postnatal" ? "postnatal" : "all";

  const activeChips = useMemo(() => {
    const chips = [];
    if (histology) chips.push({ key: "histology", label: `Histology: ${histology}` });
    if (geneFilter.trim()) chips.push({ key: "gene", label: `Gene: ${geneFilter.trim()}` });
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
  }, [histology, geneFilter, cohortScope, fcMin, snrMin, maxMeanCpmMax]);

  const removeChip = (key) => {
    if (key === "histology") setHistology("");
    if (key === "gene") setGeneFilter("");
    if (key === "fc") setFcMin(FC_BOUNDS[0]);
    if (key === "snr") setSnrMin(SNR_BOUNDS[0]);
    if (key === "maxMeanCpm") setMaxMeanCpmMax(MAX_MEAN_CPM_BOUNDS[1]);
  };

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "280px 1fr" }, gap: 3 }}>
      {/* Filters */}
      <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, height: "fit-content" }}>
        <Stack spacing={1}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 800 }}>
              TEJ Browser
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Browse all tumor-exclusive junctions.
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
            placeholder='e.g. "CLK1"'
            value={geneFilter}
            size="small"
            onChange={(e) => setGeneFilter(e.target.value)}
            fullWidth
          />

          <Divider />

          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
            <Stack spacing={1}>
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
            </Stack>
          </Paper>

          <Button
            variant="text"
            onClick={() => {
              setHistology("");
              setGeneFilter("");
              setCohortScope("all");
              setFcMin(FC_BOUNDS[0]);
              setSnrMin(SNR_BOUNDS[0]);
              setMaxMeanCpmMax(MAX_MEAN_CPM_BOUNDS[1]);
            }}
            disabled={
              !histology &&
              !geneFilter.trim() &&
              !isMinActive(fcMin, FC_BOUNDS) &&
              !isMinActive(snrMin, SNR_BOUNDS) &&
              !isMaxActive(maxMeanCpmMax, MAX_MEAN_CPM_BOUNDS)
            }
          >
            Clear
          </Button>
        </Stack>
      </Paper>

      {/* Results */}
      <Box>
        <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: "wrap" }}>
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
                    <TableCell sx={{ fontWeight: 700 }}>Gene</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Specificity</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Event Type</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">Fold-change ({scopeLabel})</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">SNR ({scopeLabel})</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">Max mean CPM ({scopeLabel})</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">Samples</TableCell>
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
                      <TableRow key={row.junction} hover>
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
  );
}

