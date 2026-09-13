import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { applyAppTheme, resolveAppTheme } from "./lib/appTheme";
import "./i18n";
import { runE2eBootstrap } from "./e2eBootstrap";

applyAppTheme(resolveAppTheme());
runE2eBootstrap();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
