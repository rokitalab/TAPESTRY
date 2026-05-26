import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Paper,
  Grid,
  TextField,
  Button,
  Stack,
  InputAdornment,
  Divider,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";

function SearchCard({
  title,
  subtitle,
  placeholder,
  value,
  onChange,
  onSubmit,
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 4,
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        borderRadius: 2,
        transition: "transform 120ms ease, box-shadow 120ms ease",
        "&:hover": {
          transform: "translateY(-2px)",
          boxShadow: 2,
        },
      }}
    >
      <Stack spacing={2} sx={{ height: "100%", width: "100%"}}>
        <Box >
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {subtitle}
          </Typography>
        </Box>

        <TextField
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          size="medium"
          fullWidth
          onKeyDown={(e) => {
            if (e.key === "Enter") onSubmit();
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
        />

        <Box sx={{ flexGrow: 1 }} />

        <Button
          variant="contained"
          onClick={onSubmit}
          disabled={!value.trim()}
          sx={{ alignSelf: "flex-start" }}
        >
          Search
        </Button>
      </Stack>
    </Paper>
  );
}

export default function Home() {
  const navigate = useNavigate();

  // Big “global” search (optional but nice)
  const [globalQuery, setGlobalQuery] = useState("");

  // The three “big button” searches
  const [gene, setGene] = useState("");
  const [histology, setHistology] = useState("");
  const [spliceEvent, setSpliceEvent] = useState("");

  const goExplore = (params) => {
    const sp = new URLSearchParams(params);
    navigate(`/explore?${sp.toString()}`);
  };

  const examples = useMemo(
    () => ({
      gene: "CLK1",
      histology: "HGG",
      spliceEvent: "SE",
    }),
    []
  );

  return (
    <Box>
      <Typography variant="h3" color="primary" sx={{ fontWeight: 800, mb: 1 }}>
        TAPESTRY
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Explore tumor-specific alternative splicing across pediatric CNS tumors.
      </Typography>

      <Divider sx={{ my: 4 }} />

      {/* Three big “search cards” */}
      <Grid container spacing={3} alignItems="stretch">
        <Grid item xs={12} md={4} sx={{ display: "flex", width: "30%" }}>
          <SearchCard
            title="Search by gene"
            subtitle="Jump straight to events for a gene symbol."
            placeholder='e.g. "CLK1"'
            value={gene}
            onChange={setGene}
            onSubmit={() => goExplore({ gene: gene.trim() })}
          />
        </Grid>

        <Grid item xs={12} md={4} sx={{ display: "flex", width: "30%" }}>
          <SearchCard
            title="Search by histology"
            subtitle="Filter by tumor type."
            placeholder='e.g. "HGG", "LGG'
            value={histology}
            onChange={setHistology}
            onSubmit={() => goExplore({ histology: histology.trim() })}
          />
        </Grid>

        <Grid item xs={12} md={4} sx={{ display: "flex", width: "30%" }}>
          <SearchCard
            title="Search by splice event"
            subtitle="Start with an rMATS event class."
            placeholder='e.g. "SE", "A3SS"'
            value={spliceEvent}
            onChange={setSpliceEvent}
            onSubmit={() => goExplore({ event: spliceEvent.trim() })}
          />
        </Grid>
      </Grid>
    </Box>
  );
}
