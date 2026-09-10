# Tju Code Agent 自定义 Skills（工具）创建方法

本文档介绍如何在 tju-code-agent 项目中添加自定义工具（skills）。

## 概述

tju-code-agent 支持通过实现 `AgentTool` 接口来扩展自定义工具。工具使用 **Zod** 进行参数校验，确保 AI 调用时参数合法。

## AgentTool 接口定义

接口位于 `src/core/types.ts`：

```typescript
export interface AgentTool<TParams extends z.ZodType = z.ZodTypeAny> {
  name: string;           // 工具名称（唯一标识）
  label: string;          // 显示标签
  description: string;    // 工具描述（AI 会读取此描述来理解工具用途）
  parameters: TParams;    // Zod schema 定义的参数结构
  promptSnippet?: string; // 可选：注入到系统提示的简短说明
  execute: (args: ToolCallArgs, params: z.output<TParams>) => Promise<AgentToolResult>;
}
```

相关类型：

```typescript
export interface ToolCallArgs {
  toolCallId: string;
  signal?: AbortSignal;
  onupdate?: (partial: ToolPartialUpdate) => void;
}

export interface AgentToolResult<T = unknown> {
  content: string;  // 返回给 AI 的文本内容
  details?: T;      // 可选的详细信息（用于 UI 展示等）
}
```

## 创建自定义工具步骤

### 1. 创建工具文件

在 `src/core/tools/` 目录下创建新文件，例如 `my-tool.ts`：

```typescript
import { z } from "zod";
import type { AgentTool, AgentToolResult, ToolCallArgs } from "../types.ts";

// 定义参数 schema
const myToolSchema = z.object({
  input: z.string().describe("输入参数描述"),
  option: z.number().int().positive().optional().describe("可选参数描述"),
});

export type MyToolInput = z.infer<typeof myToolSchema>;

// 创建工具工厂函数
export function createMyTool(cwd: string): AgentTool<typeof myToolSchema> {
  return {
    name: "my_tool",
    label: "my_tool",
    description: "这是一个自定义工具，用于实现某某功能。详细描述工具的作用和使用场景。",
    parameters: myToolSchema,
    promptSnippet: "使用 my_tool 来执行某某操作",
    async execute(
      _ctx: ToolCallArgs,
      params: MyToolInput
    ): Promise<AgentToolResult> {
      const { input, option } = params;

      // 实现工具逻辑
      try {
        const result = doSomething(input, option);

        return {
          content: `执行成功: ${result}`,
          details: {
            input,
            option,
            result,
          },
        };
      } catch (error) {
        return {
          content: `执行失败: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}
```

### 2. 注册工具

在 `src/core/tools/index.ts` 中导入并注册：

```typescript
import { createMyTool } from "./my-tool.ts";

export function createAllTools(cwd: string, options?: BashToolOptions): AgentTool[] {
  return [
    createReadTool(cwd) as unknown as AgentTool,
    createBashTool(cwd, options) as unknown as AgentTool,
    createGrepTool(cwd) as unknown as AgentTool,
    createEditTool(cwd) as unknown as AgentTool,
    createWriteTool(cwd) as unknown as AgentTool,
    createFetchTool() as unknown as AgentTool,
    createScanTool(cwd) as unknown as AgentTool,
    // 添加自定义工具
    createMyTool(cwd) as unknown as AgentTool,
  ];
}
```

## 参考示例：内置 read 工具

以下是 `src/core/tools/read.ts` 的简化实现，可作为参考：

```typescript
import { z } from "zod";
import type { AgentTool } from "../types.ts";

const readSchema = z.object({
  path: z.string().describe("Path to the file to read, relative to the working directory or absolute"),
  offset: z.number().int().positive().optional().describe("Optional 1-based line number to start reading from"),
  limit: z.number().int().positive().optional().describe("Optional maximum number of lines to read"),
});

export function createReadTool(cwd: string): AgentTool<typeof readSchema> {
  return {
    name: "read",
    label: "read",
    description: "Read a text file. Returns the file content with line numbers.",
    parameters: readSchema,
    promptSnippet: "read a file",
    async execute(_ctx, { path, offset, limit }) {
      // 读取文件逻辑...
      const content = await readFileContent(path, offset, limit);
      return {
        content,
        details: { path, startLine: offset, endLine: offset + limit },
      };
    },
  };
}
```

## 其他扩展点

除了自定义工具，项目还支持以下扩展：

| 扩展点 | 文件位置 | 说明 |
|--------|----------|------|
| 添加 Provider | `src/ai/types.ts`, `src/ai/index.ts` | 实现 `ProviderAdapter` 接口 |
| beforeToolCall 钩子 | `src/core/types.ts` → `AgentLoopConfig` | 工具执行前的拦截/校验 |
| afterToolCall 钩子 | `src/core/types.ts` → `AgentLoopConfig` | 工具执行后的结果转换 |
| transformContext | `src/core/types.ts` → `AgentLoopConfig` | 上下文压缩/截断/注入 |
| 自定义消息类型 | `src/core/types.ts` → `CustomAgentMessages` | 通过声明合并扩展消息类型 |

## 最佳实践

1. **参数描述要清晰**：AI 会根据 `description` 理解参数用途，描述越清晰，AI 调用越准确。
2. **使用 Zod 校验**：充分利用 Zod 的类型校验能力，如 `.int()`, `.positive()`, `.optional()` 等。
3. **错误处理**：在 `execute` 中捕获异常，返回友好的错误信息给 AI。
4. **返回结构化 details**：除了 `content` 文本，可通过 `details` 返回结构化数据供 UI 使用。
5. **工具粒度适中**：工具功能要单一明确，避免过于复杂或过于细碎。

## 相关文件

- `src/core/types.ts` - 核心类型定义
- `src/core/tools/` - 内置工具实现目录
- `src/core/tools/index.ts` - 工具注册入口
- `src/core/agent.ts` - Agent 类，管理工具集合
- `src/core/agent-loop.ts` - Agent 运行循环，调用工具执行
