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

const API_BASE = (import.meta.env.VITE_API_BASE || "/tapestry-api").replace(/\/$/, "");

const PREF_LABELS = {
  a3_short: "A3-",
  a3_long: "A3+",
  a5_short: "A5-",
  a5_long: "A5+",
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
    fetch(`${API_BASE}/summary-gene-view/`)
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
  const [selectedJunction, setSelectedJunction] = useState(null);

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

      {selectedGene && (
        <JunctionTable
          gene={selectedGene}
          selectedJunction={selectedJunction}
          onJunctionSelect={setSelectedJunction}
        />
      )}
      {selectedJunction && <SampleTable junction={selectedJunction} />}

      <Box sx={{ mt: 3 }}>
        <ExonVis gene={selectedGene} exonID={null} eventType="" strand="+" />
      </Box>
      {selectedJunction && (
        <Box sx={{ mt: 3 }}>
          <PlotArea junction={selectedJunction} />
        </Box>
      )}
    </>
  );
}


function JunctionTable({ gene, selectedJunction, onJunctionSelect }) {
  const [junctions, setJunctions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  useEffect(() => {
    if (!gene) return;
    setLoading(true);
    setFetchError(null);
    fetch(`${API_BASE}/gene-junction-view/?gene=${encodeURIComponent(gene)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setJunctions(data);
        setPage(0);
      })
      .catch((e) => setFetchError(e.message))
      .finally(() => setLoading(false));
  }, [gene]);

  const paged = useMemo(() => {
    const start = page * rowsPerPage;
    return junctions.slice(start, start + rowsPerPage);
  }, [junctions, page, rowsPerPage]);

  return (
    <Box sx={{ mt: 3 }}>
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
        Junctions — {gene}
      </Typography>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress size={28} />
        </Box>
      ) : fetchError ? (
        <Alert severity="error">Failed to load junctions: {fetchError}</Alert>
      ) : (
        <Paper variant="outlined" sx={{ borderRadius: 2 }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Junction</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Chr</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Strand</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Upstream</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Downstream</TableCell>
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
                    <TableCell colSpan={10}>
                      <Box sx={{ p: 2 }}>
                        <Typography sx={{ fontWeight: 700 }}>No junctions found</Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                ) : (
                  paged.map((row) => (
                    <TableRow
                      key={row.junction}
                      hover
                      selected={selectedJunction === row.junction}
                      onClick={() => onJunctionSelect(row.junction)}
                      sx={{ cursor: "pointer" }}
                    >
                      <TableCell>
                        <Typography
                          variant="caption"
                          sx={{ fontFamily: "monospace", fontSize: "0.7rem" }}
                          title={row.junction}
                        >
                          {row.junction.length > 40
                            ? `${row.junction.slice(0, 40)}…`
                            : row.junction}
                        </Typography>
                      </TableCell>
                      <TableCell>{row.chr}</TableCell>
                      <TableCell>{row.strand}</TableCell>
                      <TableCell sx={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
                        {row.up_jc_start}–{row.up_jc_end}
                      </TableCell>
                      <TableCell sx={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
                        {row.down_jc_start}–{row.down_jc_end}
                      </TableCell>
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
            count={junctions.length}
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
  );
}

function SampleTable({ junction }) {
  const [samples, setSamples] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  useEffect(() => {
    if (!junction) return;
    setLoading(true);
    setFetchError(null);
    fetch(`${API_BASE}/junction-sample-view/?junction=${encodeURIComponent(junction)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setSamples(data);
        setPage(0);
      })
      .catch((e) => setFetchError(e.message))
      .finally(() => setLoading(false));
  }, [junction]);

  const paged = useMemo(() => {
    const start = page * rowsPerPage;
    return samples.slice(start, start + rowsPerPage);
  }, [samples, page, rowsPerPage]);

  return (
    <Box sx={{ mt: 3 }}>
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
        Samples — <Typography component="span" sx={{ fontFamily: "monospace", fontWeight: 400, fontSize: "0.85rem" }}>{junction}</Typography>
      </Typography>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress size={28} />
        </Box>
      ) : fetchError ? (
        <Alert severity="error">Failed to load samples: {fetchError}</Alert>
      ) : (
        <Paper variant="outlined" sx={{ borderRadius: 2 }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Biospecimen ID</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Histology</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Molecular Subtype</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Cohort</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Tumor Descriptor</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">Junction CPM</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">Gene TPM</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">Junction Count</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Event Type</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paged.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10}>
                      <Box sx={{ p: 2 }}>
                        <Typography sx={{ fontWeight: 700 }}>No samples found</Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                ) : (
                  paged.map((row) => (
                    <TableRow key={row.biospecimen_id} hover>
                      <TableCell sx={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
                        {row.biospecimen_id}
                      </TableCell>
                      <TableCell>{row.plot_group ?? "—"}</TableCell>
                      <TableCell>{row.molecular_subtype ?? "—"}</TableCell>
                      <TableCell>{row.cohort ?? "—"}</TableCell>
                      <TableCell>{row.tumor_descriptor ?? "—"}</TableCell>
                      <TableCell align="right">
                        {row.junction_cpm != null ? row.junction_cpm.toFixed(3) : "—"}
                      </TableCell>
                      <TableCell align="right">
                        {row.gene_tpm != null ? row.gene_tpm.toFixed(2) : "—"}
                      </TableCell>
                      <TableCell align="right">{row.junction_count ?? "—"}</TableCell>
                      <TableCell>{row.event_type_sample ?? "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={samples.length}
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
  );
}

