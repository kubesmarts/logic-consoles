/**
 * Default navigation adapter backed by react-router.
 *
 * This is the ONLY place in the view layer allowed to import react-router hooks. The
 * shell integrates the router (Router ancestor + FeatureRoute routes); views consume
 * navigation through the injected NavigationPort so a non-react-router host can supply
 * its own adapter.
 */
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { NavigationPort } from "../contracts/index.ts";

export const useReactRouterNavigation = (): NavigationPort => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  return {
    navigate: (to: string) => navigate(to),
    currentPath: location.pathname,
    params,
  };
};
