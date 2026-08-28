import { AppBar, Toolbar, Typography, Button, Box, IconButton } from "@mui/material";
import { NavLink } from "react-router-dom";
import { LightMode, DarkMode } from '@mui/icons-material';


const linkStyle = () => ({
  textDecoration: "none",
});

export default function NavBar({ mode, setMode }) {
  return (
    <AppBar 
        position="fixed"
        elevation={0}
        color="default"
        sx={{
          borderBottom: "2px solid",
          borderColor: "divider",
        }}
    >
      <Toolbar>
        <Box
          component={NavLink}
          to="/"
          sx={{ display: "flex", alignItems: "center", gap: 1, textDecoration: "none" }}
        >
          <Box
            component="img"
            src={`/brand/tapestry-mark-${mode === "dark" ? "dark" : "light"}.svg`}
            alt=""
            sx={{ height: 28, width: "auto" }}
          />
          <Typography
            variant="h6"
            color="primary"
            sx={{ fontWeight: 700, letterSpacing: 0.5 }}
          >
            TAPESTRY
          </Typography>
        </Box>

        <Box sx={{ flexGrow: 1 }} />

        <Button
          component={NavLink}
          to="/explore"
          style={linkStyle}
          color="inherit"
          sx={{ opacity: 0.9, "&.active": { opacity: 1, fontWeight: 700 } }}
        >
          Explore
        </Button>
        <Button
          component={NavLink}
          to="/junction-expression"
          style={linkStyle}
          color="inherit"
          sx={{ opacity: 0.9, "&.active": { opacity: 1, fontWeight: 700 } }}
        >
          Junction Expression
        </Button>
        <Button
          component={NavLink}
          to="/docs"
          style={linkStyle}
          color="inherit"
          sx={{ opacity: 0.9, "&.active": { opacity: 1, fontWeight: 700 } }}
        >
          Docs
        </Button>
        <Button
          component={NavLink}
          to="/about"
          style={linkStyle}
          color="inherit"
          sx={{ opacity: 0.9, "&.active": { opacity: 1, fontWeight: 700 } }}
        >
          About
        </Button>
        <Button
          component="a"
          href="/tapestry-api/doc/"
          target="_blank"
          rel="noopener noreferrer"
          style={linkStyle()}
          color="inherit"
          sx={{ opacity: 0.9 }}
        >
          API
        </Button>
        <IconButton
          onClick={() => setMode((prev) => (prev === 'light' ? 'dark' : 'light'))}
          color="inherit"
          aria-label="Toggle color scheme"
          sx={{ ml: 1 }}
        >
          {mode === 'light' ? <DarkMode /> : <LightMode />}
        </IconButton>
      </Toolbar>
    </AppBar>
  );
}
