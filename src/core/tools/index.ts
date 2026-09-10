import type { AgentTool } from "../types.ts";
import { createApplyPatchTool } from "./apply-patch.ts";
import { createBashTool, type BashToolOptions } from "./bash.ts";
import { createEditTool } from "./edit.ts";
import { createFetchTool } from "./fetch.ts";
import { createGrepTool } from "./grep.ts";
import { createReadTool } from "./read.ts";
import { createScanTool } from "./scan.ts";
import { createWriteTool } from "./write.ts";

export { applyPatchSchema, createApplyPatchTool, type ApplyPatchInput } from "./apply-patch.ts";
export { bashSchema, createBashTool, type BashInput, type BashToolOptions } from "./bash.ts";
export { subAgentSchema, createSubAgentTool, type SubAgentInput, type SubAgentToolOptions } from "./subagent.ts";
export { editSchema, createEditTool, type EditInput } from "./edit.ts";
export { createFetchTool, fetchSchema, type FetchInput } from "./fetch.ts";
export { grepSchema, createGrepTool, type GrepInput } from "./grep.ts";
export { readSchema, createReadTool, type ReadInput } from "./read.ts";
export { scanSchema, createScanTool, type ScanInput } from "./scan.ts";
export { writeSchema, createWriteTool, type WriteInput } from "./write.ts";

/**
 * Create the full set of bundled coding tools bound to a working directory.
 */
export function createAllTools(cwd: string, options?: BashToolOptions): AgentTool[] {
	return [
		createReadTool(cwd) as unknown as AgentTool,
		createBashTool(cwd, options) as unknown as AgentTool,
		createGrepTool(cwd) as unknown as AgentTool,
		createEditTool(cwd) as unknown as AgentTool,
		createWriteTool(cwd) as unknown as AgentTool,
		createApplyPatchTool(cwd) as unknown as AgentTool,
		createFetchTool() as unknown as AgentTool,
		createScanTool(cwd) as unknown as AgentTool,
	];
}