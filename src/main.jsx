import React from "react";
import { createRoot } from "react-dom/client";
import App from "../sportsbook.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode><App /></React.StrictMode>
);
