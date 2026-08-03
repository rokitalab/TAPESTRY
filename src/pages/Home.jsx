import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Paper,
  Grid,
  TextField,
  FormControl,
  Checkbox,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Stack,
  InputAdornment,
  Divider,
  Tooltip,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import HistologySummary from "../components/HistologySummary";
import { HISTOLOGY_COLORS } from "../histologyColors";

const HISTOLOGIES = Object.keys(HISTOLOGY_COLORS).sort();

function SearchCard({ title, subtitle, onSubmit, submitDisabled, children }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 3,
        width: "100%",
        height: "100%",
        borderRadius: 2,
        transition: "transform 120ms ease, box-shadow 120ms ease",
        "&:hover": {
          transform: "translateY(-2px)",
          boxShadow: 2,
        },
      }}
    >
      <Stack spacing={1.5}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {subtitle}
          </Typography>
        </Box>

        <Stack direction="row" spacing={1} alignItems="flex-start">
          <Box sx={{ flex: 1 }}>{children}</Box>
          <Button
            variant="contained"
            onClick={onSubmit}
            disabled={submitDisabled}
            sx={{ height: 56, flexShrink: 0 }}
          >
            Search
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}

export default function Home() {
  const navigate = useNavigate();

  const [gene, setGene] = useState("");
  const [geneExact, setGeneExact] = useState(false);
  const [histology, setHistology] = useState("");

  const goExplore = (params) => {
    const sp = new URLSearchParams(params);
    navigate(`/explore?${sp.toString()}`);
  };

  return (
    <Box>
      <Typography variant="h3" color="primary" sx={{ fontWeight: 800, mb: 1 }}>
        TAPESTRY
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Explore tumor-specific alternative splicing across pediatric CNS tumors.
      </Typography>

      <Divider sx={{ my: 4 }} />

      {/* Two "search card" entry points */}
      <Grid container spacing={3} alignItems="stretch" justifyContent="center">
        <Grid item xs={12} md={6} sx={{ display: "flex", width: "45%" }}>
          <SearchCard
            title="Search by gene"
            subtitle="Jump straight to events for a gene symbol."
            onSubmit={() => goExplore({ gene: gene.trim(), ...(geneExact ? { exact: "1" } : {}) })}
            submitDisabled={!gene.trim()}
          >
            <TextField
              value={gene}
              onChange={(e) => setGene(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
              placeholder='e.g. "NRCAM"'
              size="medium"
              fullWidth
              onKeyDown={(e) => {
                if (e.key === "Enter" && gene.trim()) {
                  goExplore({ gene: gene.trim(), ...(geneExact ? { exact: "1" } : {}) });
                }
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
                endAdornment: (
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
                ),
              }}
            />
          </SearchCard>
        </Grid>

        <Grid item xs={12} md={6} sx={{ display: "flex", width: "45%" }}>
          <SearchCard
            title="Search by histology"
            subtitle="Filter by tumor type."
            onSubmit={() => goExplore({ histology })}
            submitDisabled={!histology}
          >
            <FormControl fullWidth size="medium">
              <InputLabel id="home-histology-label">Histology</InputLabel>
              <Select
                labelId="home-histology-label"
                label="Histology"
                value={histology}
                onChange={(e) => setHistology(e.target.value)}
              >
                {HISTOLOGIES.map((h) => (
                  <MenuItem key={h} value={h}>{h}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </SearchCard>
        </Grid>
      </Grid>

      <Divider sx={{ mt: 5 }} />
      <HistologySummary />
    </Box>
  );
}
