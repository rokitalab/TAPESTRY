import { createTheme } from "@mui/material/styles";

export function makeTheme(mode) {
  return createTheme({
    palette: {
      mode, // "light" or "dark"
      primary: { main: "#1F6F78" },
      secondary: { main: "#f4c984" },
      background: {light: "#fff"}
    },
    typography: {
      fontFamily: [
        "Roboto",
        "system-ui",
        "-apple-system",
        "Segoe UI",
        "Helvetica",
        "Arial",
        "sans-serif",
      ].join(","),
    },
  });
}
