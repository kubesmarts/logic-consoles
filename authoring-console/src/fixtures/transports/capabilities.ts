/**
 * In-memory fixture CapabilityTransport for a chosen identity.
 */
import type {
  CapabilityResult,
  CapabilityTransport,
  ResourceAttributes,
} from "../../contracts/index.ts";
import { decideCapability, type FixtureIdentity } from "../capabilities.ts";

export const createFixtureCapabilityTransport = (
  identity: FixtureIdentity,
): CapabilityTransport => ({
  async canI(attributes: ResourceAttributes): Promise<CapabilityResult> {
    return decideCapability(identity, attributes);
  },
  async canIBatch(attributes: readonly ResourceAttributes[]): Promise<readonly CapabilityResult[]> {
    return attributes.map((a) => decideCapability(identity, a));
  },
});
