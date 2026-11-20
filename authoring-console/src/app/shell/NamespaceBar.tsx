/**
 * Namespace scope indicator for namespaced pages (DESIGN.md "Scope"). The active
 * namespace stays visible while navigating. A full editable selector (including
 * entering a known namespace when listing is forbidden) is layered on by the
 * connection packet; here it shows the session's active namespace.
 */
import type { ReactNode } from "react";
import { Toolbar, ToolbarContent, ToolbarItem } from "@patternfly/react-core";
import { useConsole } from "../ConsoleContext.tsx";

export const NamespaceBar = (): ReactNode => {
  const { session } = useConsole();
  return (
    <Toolbar>
      <ToolbarContent>
        <ToolbarItem>
          <label>
            Namespace <strong>{session.namespace ?? "—"}</strong>
          </label>
        </ToolbarItem>
      </ToolbarContent>
    </Toolbar>
  );
};
