import { createRoot } from "react-dom/client";
import { App } from "./App";
import "katex/dist/katex.min.css";
import "@fontsource/gaegu/400.css";
import "@fontsource/gaegu/700.css";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<App />);
