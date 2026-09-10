/**
 * tju-code - a self-extensible coding agent framework.
 *
 * Public API mirroring the layering of the pi agent harness:
 *  core (agent runtime + tools) and ai (unified provider layer).
 */
export * from "./core/index.ts";
export { createAgent, type CreateAgentOptions } from "./create-agent.ts";
export {
	DEFAULT_SYSTEM_PROMPT,
	modelFromConfig,
	resolveConfig,
	PROVIDER_PROFILES,
	type ProviderProfile,
	type CliFlags,
	type RunConfig,
} from "./config.ts";