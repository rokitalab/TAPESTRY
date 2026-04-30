import { Routes, Route } from "react-router-dom";
import { Container } from "@mui/material";
import NavBar from "./components/NavBar";

import Home from "./pages/Home";
import Explore from "./pages/Explore";
import Docs from "./pages/Docs";
import About from "./pages/About";

export default function App({ mode, setMode }) {
  return (
    <>
      <NavBar mode={mode} setMode={setMode} />
      <Container maxWidth="lg" sx={{ position: "relative", top: 50, py: 4 }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/explore" element={<Explore />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </Container>
    </>
  );
}
