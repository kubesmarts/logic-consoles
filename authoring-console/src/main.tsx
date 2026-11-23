import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";
import "@patternfly/react-core/dist/styles/base.css";
import { ConnectionHost } from "./connection/ConnectionHost.tsx";

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element");
const router = createHashRouter([{path: "*", element: <ConnectionHost />}]);
createRoot(container).render(<StrictMode><RouterProvider router={router} /></StrictMode>);
