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
        <Typography
          variant="h6"
          component={NavLink}
          to="/"
          color="primary"
          style={{ textDecoration: "none"}}
          sx={{ fontWeight: 700, letterSpacing: 0.5 }}
        >
          TAPESTRY
        </Typography>

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
          style={linkStyle}
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
