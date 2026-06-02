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
  Stack,
  TextField,
  Button,
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

export default function Tejs() {
  const [histology, setHistology] = useState("");
  const [geneFilter, setGeneFilter] = useState("");

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Fetch whenever histology changes (gene filter is client-side)
  useEffect(() => {
    setLoading(true);
    setFetchError(null);
    const url = histology
      ? `${API_BASE}/tej-view/?plot_group=${encodeURIComponent(histology)}`
      : `${API_BASE}/tej-view/`;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setRows(data);
        setPage(0);
      })
      .catch((e) => setFetchError(e.message))
      .finally(() => setLoading(false));
  }, [histology]);

  const filtered = useMemo(() => {
    const g = geneFilter.trim().toUpperCase();
    if (!g) return rows;
    return rows.filter((r) => (r.gene_symbol ?? "").toUpperCase().includes(g));
  }, [rows, geneFilter]);

  useEffect(() => { setPage(0); }, [filtered]);

  const paged = useMemo(() => {
    const start = page * rowsPerPage;
    return filtered.slice(start, start + rowsPerPage);
  }, [filtered, page, rowsPerPage]);

  const activeChips = useMemo(() => {
    const chips = [];
    if (histology) chips.push({ key: "histology", label: `Histology: ${histology}` });
    if (geneFilter.trim()) chips.push({ key: "gene", label: `Gene: ${geneFilter.trim()}` });
    return chips;
  }, [histology, geneFilter]);

  const removeChip = (key) => {
    if (key === "histology") setHistology("");
    if (key === "gene") setGeneFilter("");
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

          <Button
            variant="text"
            onClick={() => { setHistology(""); setGeneFilter(""); }}
            disabled={!histology && !geneFilter.trim()}
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
                    <TableCell sx={{ fontWeight: 700 }}>Chr</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Strand</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Specificity</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Preference</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Event Type</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">Samples</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paged.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9}>
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
                            title={row.junction}
                          >
                            {row.junction.length > 38
                              ? `${row.junction.slice(0, 38)}…`
                              : row.junction}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{row.gene_symbol ?? "—"}</TableCell>
                        <TableCell>{row.chr ?? "—"}</TableCell>
                        <TableCell>{row.strand ?? "—"}</TableCell>
                        <TableCell>{row.consensus_specificity ?? "—"}</TableCell>
                        <TableCell>{row.status ?? "—"}</TableCell>
                        <TableCell>{row.preference_code ?? "—"}</TableCell>
                        <TableCell>{row.event_type ?? "—"}</TableCell>
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

