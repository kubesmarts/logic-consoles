import { createFetchGatewayTransport as createTransport } from "../connection/gateway-transport.ts";

export const GATEWAY_BASE_URL = "http://gateway.local";
export const createFetchGatewayTransport = (baseUrl = GATEWAY_BASE_URL) => createTransport(baseUrl);
