import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
import "@fontsource/cormorant-garamond/400-italic.css";
import "@fontsource/cormorant-garamond/500.css";
import { App } from "./App.jsx";
import "./styles.css";
import "./natural-scene.css";
import "./memory-experience.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App initialView={new URLSearchParams(location.search).get('view') === 'wallpaper' ? 'wallpaper' : 'memory'} />
  </React.StrictMode>,
);
