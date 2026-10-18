import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import AppBoundary from "./components/AppBoundary";
import "@fontsource-variable/manrope";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found");
}

ReactDOM.createRoot(root).render(<AppBoundary><App /></AppBoundary>);
