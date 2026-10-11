import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { applyAppTheme, resolveAppTheme } from "./lib/appTheme";
import { installTextEntryGuard } from "./lib/textEntryCase";
import "./i18n";
import { runE2eBootstrap } from "./e2eBootstrap";

applyAppTheme(resolveAppTheme());
installTextEntryGuard();
runE2eBootstrap();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
