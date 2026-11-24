import { useQuery } from "@tanstack/react-query";
import { useConsole } from "../app/ConsoleContext.tsx";
import { LOGIC_GROUP, LOGIC_VERSION, LogicKinds } from "../contracts/index.ts";
import type { ClusterLogicPlatformCRSpec, ClusterLogicPlatformCRStatus } from "./buildPlatformCR.ts";

export function usePlatform() {
  const { session, kubernetes } = useConsole();
  return useQuery({
    queryKey: [session.sessionId, session.context.contextName, "platform-discovery"],
    queryFn: async ({ signal }) => {
      const result = await kubernetes.list<ClusterLogicPlatformCRSpec, ClusterLogicPlatformCRStatus>(
        { group: LOGIC_GROUP, version: LOGIC_VERSION, kind: LogicKinds.ClusterLogicPlatform },
        { limit: 2 }, signal,
      );
      if (result.items.length > 1) throw new Error("Multiple ClusterLogicPlatforms found. Resolve the singleton conflict before editing.");
      return result.items[0] ?? null;
    },
  });
}
