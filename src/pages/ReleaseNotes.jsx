import {
  Box,
  Typography,
  Divider,
  List,
  ListItem,
  Chip,
  Link,
} from "@mui/material";
import { RELEASES } from "../releases";

function Release({ release }) {
  const label = release.current ? "Current" : null;
  return (
    <Box id={release.version} sx={{ mt: 5, scrollMarginTop: 80 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          {release.version}
        </Typography>
        {release.date && (
          <Typography color="text.secondary">{release.date}</Typography>
        )}
        {label && <Chip size="small" color="primary" label={label} />}
      </Box>
      {release.summary && (
        <Typography sx={{ mt: 1 }}>{release.summary}</Typography>
      )}
      {release.changes && (
        <>
          <Typography variant="h6" sx={{ fontWeight: 700, mt: 2, mb: 0.5 }}>
            What changed
          </Typography>
          <List sx={{ listStyleType: "disc", pl: 4, py: 0 }}>
            {release.changes.map((c, i) => (
              <ListItem key={i} sx={{ display: "list-item", py: 0.25, pl: 0 }}>
                <Typography variant="body2">{c}</Typography>
              </ListItem>
            ))}
          </List>
        </>
      )}
      <Divider sx={{ mt: 4 }} />
    </Box>
  );
}

export default function ReleaseNotes() {
  return (
    <Box sx={{ maxWidth: 900 }}>
      <Typography variant="h3" color="primary" sx={{ fontWeight: 800, mb: 1 }}>
        Release notes
      </Typography>
      <Typography color="text.secondary">
        What changed in each TAPESTRY release. The underlying TEJ code and data
        are in the{" "}
        <Link
          href="https://github.com/rokitalab/pbta-tumor-enriched-junctions"
          target="_blank"
          rel="noopener noreferrer"
        >
          pbta-tumor-enriched-junctions
        </Link>{" "}
        repository.
      </Typography>

      <Box component="nav" aria-label="Releases" sx={{ mt: 3 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
          Jump to
        </Typography>
        <Typography variant="body2">
          {RELEASES.map((r, i) => (
            <span key={r.version}>
              {i > 0 && " · "}
              <Link href={`#${r.version}`}>{r.version}</Link>
            </span>
          ))}
        </Typography>
      </Box>

      <Divider sx={{ mt: 3 }} />
      {RELEASES.map((r) => (
        <Release key={r.version} release={r} />
      ))}
    </Box>
  );
}
