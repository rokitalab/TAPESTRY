import { createTheme } from "@mui/material/styles";

const dark = {
  primary: { main: "#57b4e9" },
  secondary: { main: "#e79f01" },
  tertiary: { main: "#0172b2" },
  background: { default: "#1e2228", paper: "#262c35" },
  text: { primary: "#e8edf2", secondary: "#9eaab8" },
};

const light = {
  primary: { main: "#0172b2" },
  secondary: { main: "#e79f01" },
  tertiary: { main: "#57b4e9" },
  background: { default: "#fff", paper: "#fff" },
};

export function makeTheme(mode) {
  return createTheme({
    palette: {
      mode,
      ...(mode === "dark" ? dark : light),
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
