import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import PlotArea from "../components/PlotArea";
import ExonVis from "../components/ExonVis";

import {
  Alert,
  Box,
  CircularProgress,
  Chip,
  Divider,
  Paper,
  Typography,
  Stack,
  TextField,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
} from "@mui/material";

const API_BASE = "http://10.87.48.149:8080/tapestry-api";

const PREF_LABELS = {
  a3_short: "A3S",
  a3_long: "A3L",
  a5_short: "A5S",
  a5_long: "A5L",
  ei: "EI",
  es: "ES",
  ri: "RI",
};

const STATUS_LABELS = {
  annotated_junction: "Ann",
  novel_junction: "Nov",
  novel_splice_site: "NSS",
};

function activeCodes(obj, labelMap) {
  return Object.entries(obj)
    .filter(([, v]) => v > 0)
    .map(([k]) => labelMap[k] ?? k)
    .join(", ");
}

function useQueryParams() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export default function Explore() {
  const navigate = useNavigate();
  const params = useQueryParams();

  const initialGene = useMemo(() => params.get("gene") || "", [params]);
  const [gene, setGene] = useState(initialGene);

  useEffect(() => {
    setGene(initialGene);
  }, [initialGene]);

  const [geneSummary, setGeneSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/summary-gene-view`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setGeneSummary(data);
        setFetchError(null);
      })
      .catch((e) => setFetchError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const [selectedGene, setSelectedGene] = useState(initialGene || "");

  const filtered = useMemo(() => {
    const g = gene.trim().toUpperCase();
    if (!g) return geneSummary;
    return geneSummary.filter((row) => row.gene.toUpperCase().includes(g));
  }, [gene, geneSummary]);

  useEffect(() => {
    setPage(0);
  }, [filtered]);

  const paged = useMemo(() => {
    const start = page * rowsPerPage;
    return filtered.slice(start, start + rowsPerPage);
  }, [filtered, page, rowsPerPage]);

  const updateUrl = (nextGene) => {
    const sp = new URLSearchParams();
    if (nextGene) sp.set("gene", nextGene);
    navigate(`/explore?${sp.toString()}`);
  };

  const onApply = () => updateUrl(gene.trim());

  const onClear = () => {
    setGene("");
    updateUrl("");
  };

  return (
    <>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "280px 1fr" }, gap: 3 }}>
        {/* Filters */}
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, height: "fit-content" }}>
          <Stack spacing={1}>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 800 }}>
                Explore
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Browse genes with tumor-specific splicing events.
              </Typography>
            </Box>

            <Divider />

            <TextField
              label="Gene"
              placeholder='e.g. "CLK1"'
              value={gene}
              size="small"
              onChange={(e) => setGene(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onApply()}
              fullWidth
            />

            <Stack direction="row" spacing={1}>
              <Button variant="contained" onClick={onApply}>
                Apply
              </Button>
              <Button variant="text" onClick={onClear}>
                Clear
              </Button>
            </Stack>
          </Stack>
        </Paper>

        {/* Results */}
        <Box>
          <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: "wrap" }}>
            {gene.trim() ? (
              <Chip color="secondary" label={`Gene: ${gene.trim()}`} onDelete={onClear} />
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                No filters applied.
              </Typography>
            )}
          </Stack>

          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", p: 6 }}>
              <CircularProgress />
            </Box>
          ) : fetchError ? (
            <Alert severity="error">Failed to load gene summary: {fetchError}</Alert>
          ) : (
            <Paper variant="outlined" sx={{ borderRadius: 2 }}>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Gene</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">Samples</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">Junctions</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">Groups</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">Domains</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">Tumor Sp.</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">Oncofetal</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Splice Type</TableCell>
                    </TableRow>
                  </TableHead>

                  <TableBody>
                    {paged.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9}>
                          <Box sx={{ p: 2 }}>
                            <Typography sx={{ fontWeight: 700 }}>No results</Typography>
                            <Typography variant="body2" color="text.secondary">
                              Try a different gene name or clear the filter.
                            </Typography>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ) : (
                      paged.map((row) => (
                        <TableRow
                          key={row.gene}
                          hover
                          selected={selectedGene === row.gene}
                          onClick={() => setSelectedGene(row.gene)}
                          sx={{ cursor: "pointer" }}
                        >
                          <TableCell sx={{ fontWeight: 600 }}>{row.gene}</TableCell>
                          <TableCell align="right">{row.num_samples}</TableCell>
                          <TableCell align="right">{row.num_junctions}</TableCell>
                          <TableCell align="right">{row.num_plot_groups}</TableCell>
                          <TableCell align="right">{row.num_domains_affected}</TableCell>
                          <TableCell align="right">{row.consensus_specificity.tumor_specific}</TableCell>
                          <TableCell align="right">{row.consensus_specificity.oncofetal}</TableCell>
                          <TableCell>
                            <Typography variant="caption" color="text.secondary">
                              {activeCodes(row.status, STATUS_LABELS) || "—"}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption" color="text.secondary">
                              {activeCodes(row.preference_code, PREF_LABELS) || "—"}
                            </Typography>
                          </TableCell>
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
                rowsPerPageOptions={[10, 25, 50]}
              />
            </Paper>
          )}
        </Box>
      </Box>

      <Box sx={{ mt: 3 }}>
        <ExonVis gene={selectedGene} geneID={null} exonID={null} eventType="" strand="+" />
      </Box>
      <Box sx={{ mt: 3 }}>
        <PlotArea />
      </Box>
    </>
  );
}
