import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import PlotArea from "../components/PlotArea";
import ExonVis from "../components/ExonVis";

import {
  Box,
  Paper,
  Typography,
  Stack,
  TextField,
  Button,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
} from "@mui/material";

function useQueryParams() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

function toObject(params) {
  return Object.fromEntries(params.entries());
}

// ---- stub data (replace later with API results) ----
const STUB_RESULTS = [
  {
    id: "CLK1:SE:chr2:123-456",
    gene: "CLK1",
    eventType: "SE",
    histology: "HGG",
    deltaPSI: 0.22,
    nTumor: 140,
    nNormal: 35,
    exonNumber: 4,
    strand: "-",
    geneID: "ENSG00000013441"
  },
  {
    id: "CLK1:A3SS:chr2:789-012",
    gene: "CLK1",
    eventType: "A3SS",
    histology: "LGG",
    deltaPSI: -0.18,
    nTumor: 62,
    nNormal: 35,
    exonNumber: 8,
    strand: "-",
    geneID: "ENSG00000013441"
  },
  {
    id: "PTEN:RI:chr10:111-222",
    gene: "PTEN",
    eventType: "RI",
    histology: "Medulloblastoma",
    deltaPSI: 0.12,
    nTumor: 88,
    nNormal: 35,
    exonNumber: 5,
    strand: "+",
    geneID: "ENSG00000171862"
  },
];

const EVENT_TYPES = ["SE", "RI", "A5SS", "A3SS"];

// Temporary stub until API wiring: maps gene -> exon count
function getExonCountForGene(name) {
  const g = (name || "").trim().toUpperCase();
  const LUT = {
    CLK1: 13,
    PTEN: 9,
    BRCA1: 24,
    BRCA2: 27,
    TP53: 11,
    EGFR: 28,
  };
  return LUT[g] ?? 12; // sensible default
}

export default function Explore() {
  const navigate = useNavigate();
  const params = useQueryParams();

  // Read initial filter state from URL
  const initial = useMemo(() => {
    const obj = toObject(params);
    return {
      gene: obj.gene || "",
      histology: obj.histology || "",
      eventType: obj.eventType || "",
    };
  }, [params]);

  const [gene, setGene] = useState(initial.gene);
  const [histology, setHistology] = useState(initial.histology);
  const [eventType, setEventType] = useState(initial.eventType);

  // Keep local state in sync if user edits URL directly
  useEffect(() => {
    setGene(initial.gene);
    setHistology(initial.histology);
    setEventType(initial.eventType);
  }, [initial.gene, initial.histology, initial.eventType]);

  // Pagination
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Exon visualization count, derived from gene name
  const [selectedRowId, setSelectedRowId] = useState(null);
  const [selectedGene, setSelectedGene] = useState(initial.gene || "");
  const [selectedEventType, setSelectedEventType] = useState(initial.eventType || "");
  const [selectedExonNumber, setSelectedExonNumber] = useState(null);
  const [selectedStrand, setSelectedStrand] = useState("+");
  const [selectedGeneID, setSelectedGeneID] = useState(null);

  // Apply filters to stub results
  const filtered = useMemo(() => {
    const g = gene.trim().toUpperCase();
    const h = histology.trim();
    const e = eventType.trim();

    return STUB_RESULTS.filter((row) => {
      const okGene = !g || row.gene.toUpperCase().includes(g);
      const okHist = !h || row.histology.toLowerCase().includes(h.toLowerCase());
      const okEvent = !e || row.eventType === e;
      return okGene && okHist && okEvent;
    });
  }, [gene, histology, eventType]);

  const paged = useMemo(() => {
    const start = page * rowsPerPage;
    return filtered.slice(start, start + rowsPerPage);
  }, [filtered, page, rowsPerPage]);

  // Auto-select the first available row whenever the filtered results change
  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedRowId(null);
      setSelectedGene("");
      setSelectedEventType("");
      setSelectedExonNumber(null);
      setSelectedStrand("+");
      setSelectedGeneID(null);
      return;
    }
    const exists = filtered.some((r) => r.id === selectedRowId);
    if (!exists) {
      const first = filtered[0];
      setSelectedRowId(first.id);
      setSelectedGene(first.gene);
      setSelectedEventType(first.eventType);
      setSelectedExonNumber(first.exonNumber ?? null);
      setSelectedStrand(first.strand || "+");
      setSelectedGeneID(first.geneID || null);
    }
  }, [filtered]);

  const activeChips = useMemo(() => {
    const chips = [];
    if (gene.trim()) chips.push({ key: "gene", label: `Gene: ${gene.trim()}` });
    if (histology.trim()) chips.push({ key: "histology", label: `Histology: ${histology.trim()}` });
    if (eventType.trim()) chips.push({ key: "eventType", label: `Event: ${eventType.trim()}` });
    return chips;
  }, [gene, histology, eventType]);

  const updateUrl = (next) => {
    const sp = new URLSearchParams();
    if (next.gene) sp.set("gene", next.gene);
    if (next.histology) sp.set("histology", next.histology);
    if (next.eventType) sp.set("eventType", next.eventType);
    navigate(`/explore?${sp.toString()}`);
    setPage(0);
  };

  const onApply = () => {
    updateUrl({
      gene: gene.trim(),
      histology: histology.trim(),
      eventType: eventType.trim(),
    });
  };

  const onClear = () => {
    setGene("");
    setHistology("");
    setEventType("");
    updateUrl({ gene: "", histology: "", eventType: "" });
  };

  const removeChip = (key) => {
    if (key === "gene") setGene("");
    if (key === "histology") setHistology("");
    if (key === "eventType") setEventType("");
    updateUrl({
      gene: key === "gene" ? "" : gene.trim(),
      histology: key === "histology" ? "" : histology.trim(),
      eventType: key === "eventType" ? "" : eventType.trim(),
    });
  };

  return (
    <>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "320px 1fr" }, gap: 3 }}>
        {/* Filters */}
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, height: "fit-content" }}>
          <Stack spacing={1}>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 800 }}>
                Explore
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Filter splice events by gene, histology, or event type.
              </Typography>
            </Box>

            <Divider />

            <TextField
              label="Gene"
              placeholder='e.g. "CLK1"'
              value={gene}
              size="small"
              onChange={(e) => setGene(e.target.value)}
              fullWidth
            />

            <TextField
              label="Histology"
              placeholder='e.g. "HGG"'
              value={histology}
              size="small"
              onChange={(e) => setHistology(e.target.value)}
              fullWidth
            />

            <FormControl fullWidth size="small">
              <InputLabel id="event-type-label">Event type</InputLabel>
              <Select
                labelId="event-type-label"
                label="Event type"
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
              >
                <MenuItem value="">Any</MenuItem>
                {EVENT_TYPES.map((t) => (
                  <MenuItem key={t} value={t}>
                    {t}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

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
            {activeChips.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                No filters applied.
              </Typography>
            ) : (
              activeChips.map((c) => (
                <Chip color="secondary" key={c.key} label={c.label} onDelete={() => removeChip(c.key)} />
              ))
            )}
          </Stack>

          <Paper variant="outlined" sx={{ borderRadius: 2 }}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Gene</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Event</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Histology</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Exon #</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">
                      ΔPSI
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">
                      Tumor N
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">
                      Normal N
                    </TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {paged.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6}>
                        <Box sx={{ p: 2 }}>
                          <Typography sx={{ fontWeight: 700 }}>No results</Typography>
                          <Typography variant="body2" color="text.secondary">
                            Try relaxing filters or clearing them.
                          </Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ) : (
                    paged.map((row) => (
                      <TableRow
                        key={row.id}
                        hover
                        selected={selectedRowId === row.id}
                        onClick={() => {
                          setSelectedRowId(row.id);
                          setSelectedGene(row.gene);
                          setSelectedEventType(row.eventType);
                          setSelectedExonNumber(row.exonNumber ?? null);
                          setSelectedStrand(row.strand || "+");
                          setSelectedGeneID(row.geneID || null);
                        }}
                        sx={{ cursor: "pointer" }}
                      >
                        <TableCell>{row.gene}</TableCell>
                        <TableCell>{row.eventType}</TableCell>
                        <TableCell>{row.histology}</TableCell>
                        <TableCell>{row.exonNumber ?? "-"}</TableCell>
                        <TableCell align="right">{row.deltaPSI.toFixed(2)}</TableCell>
                        <TableCell align="right">{row.nTumor}</TableCell>
                        <TableCell align="right">{row.nNormal}</TableCell>
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
              rowsPerPageOptions={[5, 10, 25]}
            />
          </Paper>
        </Box>
      </Box>

      {/* Full-width sections below the grid */}
      <Box sx={{ mt: 3 }}>
        <ExonVis gene={selectedGene} geneID={selectedGeneID} exonID={selectedExonNumber} eventType={selectedEventType} strand={selectedStrand} />
      </Box>
      <Box sx={{ mt: 3 }}>
        <PlotArea />
      </Box>
    </>
  );
}
