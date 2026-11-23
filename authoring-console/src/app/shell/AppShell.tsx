/**
 * The PatternFly shell frame (DESIGN.md "The shell").
 *
 * Masthead: nav toggle + product name "Authoring Console" at the start; the active
 * kubeconfig context (or "Disconnected") at the end. Sidebar nav in the required
 * order: Platform, Runtimes, Workflows, Topology, Compatibility. Single main landmark
 * + skip link. Light/dark toggle. The routed content is supplied as children.
 */
import type { ReactNode } from "react";
import {
  Button,
  Masthead,
  MastheadBrand,
  MastheadContent,
  MastheadLogo,
  MastheadMain,
  MastheadToggle,
  Nav,
  NavItem,
  NavList,
  Page,
  PageSidebar,
  PageSidebarBody,
  PageToggleButton,
  SkipToContent,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from "@patternfly/react-core";
import BarsIcon from "@patternfly/react-icons/dist/esm/icons/bars-icon";
import MoonIcon from "@patternfly/react-icons/dist/esm/icons/moon-icon";
import SunIcon from "@patternfly/react-icons/dist/esm/icons/sun-icon";
import { useConsole, useNavigation } from "../ConsoleContext.tsx";
import { useTheme } from "../theme.tsx";

const MAIN_ID = "main-content";

export interface NavEntry {
  readonly to: string;
  readonly label: string;
}

/** Sidebar order is fixed by DESIGN.md. Packets B–H add routes, not reorder these. */
export const PRIMARY_NAV: readonly NavEntry[] = [
  { to: "/platform", label: "Platform" },
  { to: "/runtimes", label: "Runtimes" },
  { to: "/workflows", label: "Workflows" },
  { to: "/topology", label: "Topology" },
  { to: "/compatibility", label: "Compatibility" },
];

export const AppShell = ({ children }: { readonly children: ReactNode }): ReactNode => {
  const { session } = useConsole();
  const { resolved, toggle } = useTheme();
  const { navigate, currentPath } = useNavigation();

  const contextLabel = session.context.contextName || "Disconnected";

  const masthead = (
    <Masthead>
      <MastheadMain>
        <MastheadToggle>
          <PageToggleButton variant="plain" aria-label="Global navigation" id="nav-toggle">
            <BarsIcon />
          </PageToggleButton>
        </MastheadToggle>
        <MastheadBrand>
          <MastheadLogo component="a" href="#/workflows">
            Authoring Console
          </MastheadLogo>
        </MastheadBrand>
      </MastheadMain>
      <MastheadContent>
        <Toolbar isFullHeight isStatic>
          <ToolbarContent>
            <ToolbarGroup align={{ default: "alignEnd" }}>
              <ToolbarItem>
                <Button
                  variant="plain"
                  aria-label={resolved === "dark" ? "Switch to light theme" : "Switch to dark theme"}
                  onClick={toggle}
                  icon={resolved === "dark" ? <SunIcon /> : <MoonIcon />}
                />
              </ToolbarItem>
              <ToolbarItem>
                <Button variant="secondary" aria-label="Active cluster context" onClick={() => navigate("/connection")}>
                  {contextLabel}
                </Button>
              </ToolbarItem>
            </ToolbarGroup>
          </ToolbarContent>
        </Toolbar>
      </MastheadContent>
    </Masthead>
  );

  const sidebar = (
    <PageSidebar>
      <PageSidebarBody>
        <Nav aria-label="Primary navigation">
          <NavList>
            {PRIMARY_NAV.map((entry) => (
              <NavItem
                key={entry.to}
                to={`#${entry.to}`}
                isActive={currentPath === entry.to || currentPath.startsWith(`${entry.to}/`)}
                onClick={(event) => {
                  event.preventDefault();
                  navigate(entry.to);
                }}
              >
                {entry.label}
              </NavItem>
            ))}
          </NavList>
        </Nav>
      </PageSidebarBody>
    </PageSidebar>
  );

  return (
    <Page
      masthead={masthead}
      sidebar={sidebar}
      isManagedSidebar
      mainContainerId={MAIN_ID}
      skipToContent={<SkipToContent href={`#${MAIN_ID}`}>Skip to content</SkipToContent>}
    >
      {children}
    </Page>
  );
};
