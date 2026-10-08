# tju-code 安全审查报告

审查对象：核心代码（`src/**`，不含 `plugins/pet`、`scripts`、`update/files`、测试脚本）。
审查方式：静态逐文件通读 + 对关键假设写最小探针实证（探针已删除）。
审查范围：本地文件系统访问边界、SSRF、GUI 鉴权与同源、自更新供应链、密钥处理、注入类问题。

---

## 修复进度（全部已修复）

| 编号 | 问题 | 状态 |
|---|---|---|
| H1 | 审批门漏工具（apply_patch / scan） | ✅ 已修复并实测 |
| H2 | fetch 重定向绕过 SSRF | ✅ 已修复并实测 |
| M1 | 插件同源任意 JS | ✅ 已修复（启动快照允许清单 + 转义 + 启动提示） |
| M2 | bash 审批是启发式 | ✅ 已修复（环境变量展开 + 文档写清边界） |
| M3 | 审批授权范围 | ✅ 已修复（`realpath` 规范化；卷根只能单次授权） |
| M4 | 更新源无签名 / 可用 http | ✅ 已修复（强制 https + `safeJoin` 边界断言） |
| M5 | IPv6 判定用字符串前缀 | ✅ 已修复并实测 |
| L1 | relaunch 命令注入 | ✅ 已修复（参数改走环境变量，不再上命令行） |
| L2 | token 出现在 URL | ✅ 已修复（fetch 流式 SSE + 短时票据） |
| L3 | 任意 entryId 写 secrets | ✅ 已修复（校验存在 + 长度/换行限制） |
| L4 | decodeURIComponent 抛异常 | ✅ 已修复（`decodePathSegment`） |
| L5 | 上传 mime 自报 | ✅ 已修复（扩展名白名单 + 服务端定 mime） |
| L6 | 缺安全响应头 | ✅ 已修复（CSP + nosniff + Referrer-Policy + frame-ancestors） |
| L7 | .gitignore 漏 data/ | ✅ 已修复 |

还剩一项未做（非本次范围）：更新源签名（Ed25519/minisign）。目前仍是“TLS + 同源清单校验”，
比原来强在协议已强制 https，但要抵御更新源本身被攻陷，仍需内置公钥的签名校验。

已修复项的改动点：

- `src/core/permission.ts`：不再维护“需要审批的工具”白名单，改为**扫描参数里的路径类键**
  （`path`/`file`/`cwd`/`target` …，递归到 `operations[].path` 这种嵌套结构），
  白名单外的工具因此默认受审查；`bash` 另外做 `%VAR%` / `$VAR` 环境变量展开后取路径；
  卷根目录点“always”只生效一次，避免一次授权覆盖整个盘符。
- `src/core/tools/fetch.ts`：新增 `fetchPublic()`，`redirect: "manual"` 手动跟随、**每一跳都复查 IP**，
  上限 5 跳；`isNonPublicIp()` 改为结构化解析（IPv4 点分 + IPv6 展开成 16 字节后按字节布局判定），
  覆盖 `::ffff:7f00:1`、`::ffff:0:7f00:1`、`64:ff9b::/96` 等嵌入 IPv4 的写法。

实测结果（对构建产物与真实工具函数）：

```
H1  gate: apply_patch -> ASKED D:\outside        (修复前 NO-ASK)
         scan        -> ASKED D:\outside        (修复前 NO-ASK)
         bash        -> ASKED C:\Users\<用户>\.ssh\id_rsa  (修复前 NO-ASK，%USERPROFILE% 已展开)
H2  公网页面 302 -> 127.0.0.1:<port>  = BLOCKED（修复前可拿到内网响应体）
M5  [::ffff:7f00:1] / [::ffff:a9fe:a9fe] / [0:0:0:0:0:ffff:7f00:1] / [64:ff9b::7f00:1]
    / [::ffff:0:7f00:1] 全部 BLOCKED（修复前判为公网）
回归 tsc --noEmit 0 错误；vitest 104 项全通过；npm run build 成功；
    GUI 实拉：/ 200、/app.js 200、无 token 调 /api/state 403、带 token 200 且响应体无 apiKey 字段。
```

---

## 高危

### H1. 审批门对 `apply_patch` 与 `scan` 完全不生效（任意路径读写/删除绕过）—— ✅ 已修复—— ✅ 已修复

> 已修复：`permission.ts` 不再枚举需要审批的工具，改为扫描参数里的路径类键（含嵌套），
> 白名单外的工具默认受审查；并补了环境变量展开与卷根目录的单次授权限制。实测见上方「修复进度」。

`src/core/permission.ts:19` 的工具白名单只有 5 个：

```ts
const FILE_TOOLS = new Set(["read", "write", "edit", "grep", "glob"]);
```

`candidateDirs()` 只处理 `FILE_TOOLS` 和 `bash`，其它工具直接 `return []`（`permission.ts:115`），
于是主循环里 `for (const dir of …)` 一次都不进，`ask()` 永不调用（`permission.ts:134-135`）。

而这两个漏掉的工具都能改/读任意路径：

- `apply_patch`：`src/core/tools/index.ts:34` 注册，`apply-patch.ts:89` 用 `resolvePath(cwd, op.path)`，
  绝对路径原样透传，`add`/`edit`/`delete` 三个动作都能打绝对路径（`apply-patch.ts:91-117`）。
- `scan`：`scan.ts:57-60,336-337` 的 `path` 参数可为任意绝对目录，结果把命中行内容回显给模型。
  注意 `grep`/`glob` 的**同一个** `path` 参数是有审批的，`scan` 属于漏加，基本可确定是实现遗漏。

实证（探针调用真实 `createApprovalGate`）：

```
ASKED    read (in FILE_TOOLS)          -> D:\somewhere-else\id_rsa
ASKED    write (in FILE_TOOLS)         -> D:\somewhere-else
ASKED    bash (heuristic regex)        -> D:\somewhere-else\id_rsa
NO-ASK   bash (variable indirection)
NO-ASK   apply_patch (NOT in FILE_TOOLS)
NO-ASK   scan (NOT in FILE_TOOLS)
ASKED    glob (in FILE_TOOLS)          -> D:\somewhere-else
```

利用路径：本工具会 `fetch` 网页、读仓库里的 `AGENTS.md`/注释/依赖说明，
这些内容都是不可信输入；一次成功的提示注入即可让模型在**没有任何弹窗**的情况下
写 `~/.ssh/authorized_keys`、写启动目录 `…\Startup\evil.bat` 做持久化，或删除用户文件。

修复建议：把 `apply_patch`（逐个 operation 的 `path`）和 `scan` 的 `path` 补进 `candidateDirs`。
更稳的做法是**反转默认值**：不再枚举“需要审批的工具”，而是约定
“除只读且限域的工具（read/grep/glob）外，任何携带路径类参数的工具一律先审批”，
这样以后新增工具不会再静默漏掉。

### H2. `fetch` 的 SSRF 防护只校验初始 URL，重定向后不复查 —— ✅ 已修复 —— ✅ 已修复

> 已修复：`fetchPublic()` 手动跟随重定向（`redirect: "manual"`），每一跳都重新校验目标 IP。
> 注意：`allowPrivate` 仍是模型可自填的参数，若把它当安全边界需另做处理（未改）。

`fetch.ts:224` 只对传入的 URL 做一次 `assertPublicTarget`，随后
`fetch.ts:239` 直接 `fetch(url, { redirect: "follow" })` —— 跳转目标由 Node 自行跟随，
不再经过任何 IP 检查。

实证：初始 URL 指向攻击者控制的公网地址，该地址返回 `302 Location: http://127.0.0.1:<port>/`：

```
2) fetch(url, {redirect:"follow"}) final url: http://127.0.0.1:60128/latest/meta-data/
   status=200 body="SECRET-METADATA-OR-ADMIN-API"
   => 重定向目标（内网地址）被访问，且没有任何二次检查
```

危害不仅是内网探测，还有一个具体的升级路径：GUI 的 `/` 与 `/app.js` 是**无鉴权**的
（`server.ts:325-338`），且二者都把会话 token 内联进了响应体
（`server.ts:177-182` 的 `__AGENT_TOKEN__` 替换，`ui.ts:9` 的 `<meta name="agent-token">`、
`ui.ts:1081` 的 `var AGENT_TOKEN`）。因此一次 302 到 `http://127.0.0.1:9399/`
就能让模型把**会话 token 原文**回显出来，拿到 token 后即可通过 API 完全接管本机 agent
（发指令、**代替用户批准任意目录访问**、导出全部会话）。

顺带说明：`allowPrivate` 是模型可自行填写的参数（`fetch.ts:24`、`160-161`），
也就是说该防护对“已被注入的模型”本来就是可选的。若把 SSRF 防护当作安全边界，
需要去掉这个开关或把它移到用户侧配置。

修复建议：`redirect: "manual"` 自行跟随（上限 3 跳），每跳都调用 `assertPublicTarget`；
或给 undici 传自定义 `lookup`，在建连时校验真实 IP（同时消除 DNS rebinding 的 TOCTOU）。

---

## 中危

### M1. 插件目录无白名单 + 目录名未转义 → GUI 同源任意 JS —— ✅ 已修复

`server.ts:184` 的 `pluginsDir = join(process.cwd(), "plugins")`，而 `cwd` 正是 agent 的工作目录
（`server.ts:58`）——**同一个 agent 对这个目录有写权限**。启动时扫描每个子目录中的 `pet.js`
并注入 `<script src="/plugins/<name>/pet.js">`（`server.ts:187-200`），`/plugins/*` 路由又无鉴权
（`server.ts:363-383`）。

因此“写一个文件”就等于“在 GUI 源里执行 JS”：该脚本与主页面同源，可读取
`meta[name=agent-token]`（或直接用页面内的 `AGENT_TOKEN`），进而调用全部 `/api/*`——
包括 `/api/approve` 替用户批准任意目录访问、把整个工作区源码与会话导出到外网。
这是 H1（可任意写文件）之后最直接的持久化/外泄通道。

另外 `server.ts:195` 把 `entry.name` 直接插进 HTML 属性且未转义：

```ts
tags.push(`<script src="/plugins/${entry.name}/pet.js"></script>`);
```

在 Linux/macOS 上目录名可以含 `"`，即可闭合属性注入任意 HTML/JS（Windows 受文件名限制）。

修复建议：插件改为显式白名单（用户设置里勾选）或校验签名；目录名至少过 `esc()`；
`/plugins/` 也纳入 token 鉴权。

### M2. `bash` 审批是“正则找路径”的启发式，可稳定绕过 —— ✅ 已修复（部分：加固 + 文档）

`permission.ts:26-27`、`105-113`：靠 `WIN_PATH`/`UNIX_PATH` 正则从命令串里抠路径。
实测 `type %USERPROFILE%\.ssh\id_rsa`（以及 `$HOME/.ssh/id_rsa`）不命中正则 → 不弹窗，
但 cmd/sh 会把变量展开成真实家目录，命令照常执行。同类手法：
`python -c "open(chr(47)+'etc')"`、`subst`、`net use`、把路径拆成变量拼接等。

修复建议：要么在 README 明确写清“审批只覆盖常见的字面路径写法，不是沙箱”，
要么把 `bash` 单独处理为“本工具不受路径约束”，首次使用时让用户显式确认。

### M3. 审批的授权范围比用户直觉大 —— ✅ 已修复

`toDir()` 对 `D:\dir\x.txt` 取 `dirname` → 记入 `approvedDirs` 的是 `D:\dir`
（`permission.ts:87-92`、`144-145`），点一次“always”等于永久放开整个目录；
路径末段不含 `.` 时（如 `D:\dir\secret`）会被当成目录，同样放大范围。

### M4. 自更新只依赖 TLS + 清单自带的 sha256，无签名 —— ✅ 已修复（https 强制 + 路径边界；签名仍未做）

`update.ts:147-164` 用 `latest.json` 里的 `sha256` 校验下载文件，而 `latest.json` 本身
就是从同一来源拉取的（`update.ts:92-106`）——校验值与被校验内容同源，无法抵御更新源被篡改。
`normalizeBaseUrl`（`update.ts:58-60`）不限制协议，`UPDATE_URL` 若被改成 `http://` 即可被中间人投毒并 RCE。

另：路径校验只发生在 `checkManifestShape`（`update.ts:78`），而 `stageRelease` 是导出函数，
其 `safeJoin`（`update.ts:143-145`）不做根目录隔离。实测 Windows 下
`join("D:\app\dist.new", "C:/x")` → `D:\app\dist.new\C:\x`（`:` 是非法文件名字符），
`mkdirSync` 会失败，因此**当前不可利用**；但这是偶然的安全性，建议在 `stageRelease` 内
再做一次“解析后必须仍在 staging 目录内”的断言。

修复建议：强制 `https:` schema；发布清单加签名（Ed25519/minisign，公钥内置），
或至少把清单与文件的校验值分离（清单签名、文件哈希由签名清单背书）。

### M5. SSRF 守卫的 IPv6 判定用字符串前缀，覆盖有洞 —— ✅ 已修复 —— ✅ 已修复

> 已修复：改为结构化解析（IPv6 展开为 16 字节后按字节布局判定），
> `::ffff:7f00:1` / `::ffff:0:7f00:1` / `64:ff9b::/96` 等现已全部拦住（实测见上方）。

`fetch.ts:105-122` 用 `startsWith("::ffff:")` + 拼接判断。实测以下形态被判为“公网”：

```
"::ffff:7f00:1"       nonPublic= false
"::ffff:a9fe:a9fe"    nonPublic= false
"::ffff:0:7f00:1"     nonPublic= false
```

**当前不可利用**：`dns.lookup(url.hostname)` 通常会把 `[::ffff:127.0.0.1]` 规范化成
`::ffff:127.0.0.1`，正好落进 `startsWith("::ffff:")` → slice 后是合法 IPv4 点分式，判 private。
但这条通路依赖“本机解析器返回什么形态”，换个解析器/hosts/Node 版本就可能漏。
建议改成结构化解析：`net.isIP` 判版本 + 手工展开成 8 组 16 位整数后按数值区间判定。

---

## 低危

- **L1 `escapeCmdArg` 对含空格/引号的参数不转义**（`update.ts`）—— ✅ 已修复：不再走 cmd 解析层，参数改经
  `TJU_CODE_RELAUNCH_ARGV` 环境变量以 JSON 传递，命令行只剩两个可信绝对路径（`cli.ts:takeRelaunchArgs` 读取）。
  补充发现：原计划“改 argv 直传”并不成立——实测 Node 对不含空格的参数不加引号，`x&y` 仍被 cmd 当分隔符。
- **L2 token 出现在 URL query**（`server.ts:173`，`ui.ts:2128` 的附件 `?token=`）—— ✅ 已修复：
  事件流改为 `fetch` + `ReadableStream` 自解析 SSE（带 `x-agent-token` 头），附件改短时票据 `?t=`；
  服务端不再从 query 读会话 token。实测旧写法全部 403、票据正常生效且不能跨路由复用。
- **L3 /api/providers/key 不校验 entryId 是否存在** —— ✅ 已修复（校验条目存在 + key 长度/换行限制）。
- **L4 `decodeURIComponent(providerDeleteMatch[1])`** —— ✅ 已修复（`decodePathSegment`，不抛异常）。
- **L5 上传 mime 由 query 自报** —— ✅ 已修复（扩展名白名单 png/jpg/gif/webp，存储时改写为服务端决定的 mime，排除 SVG）。
- **L6 缺少安全响应头** —— ✅ 已修复（全站 CSP + nosniff + `referrer-policy: no-referrer` + `x-frame-options: DENY`）。
  改前已核实页面无内联事件处理器、无内联 `<style>` 块，CSP 不会破坏现有 UI。
- **L7 `.gitignore` 未忽略便携模式的 `data/`** —— ✅ 已修复。

---

## 已确认没有问题的部分

- **密钥不出后端**：`Agent.state` 返回体不含 `apiKey`（`agent.ts:113-123`）；
  `/api/providers` 只回 `hasKey` 布尔（`server.ts:616-637`），不下发 key 原文。
  `Model` 里刻意不放 key，因此 `work-item.json` 与 `/api/works` 不含明文密钥。
- **路径穿越已覆盖**：`SessionStore.load/remove` 用 `basename` 比对 + 拒 `.` 前缀
  （`session-store.ts:63,82`）；`isSafeRunId` 挡 `/`、`\`、`..`、`\0`（`event-log.ts:345-350`）；
  附件 `readBytes` 挡 id 里的 `..`/`/`/`\`（`attachment-store.ts:76`）；`/plugins/` 挡 `..`
  （`server.ts:365`）。实测 URL 解析会把 `%2e%2e`、反斜杠都归一化成路径分隔后解析掉，
  未发现可绕过的穿越写法。
- **无存储型 XSS**：前端 markdown 先 `esc()` 再套格式，外链只允许 `http(s)`/`#`
  （`ui.ts:1291-1293`、`1846-1852`）；会话与接口列表都用 `createElement`/`textContent` 构造
  （如 `buildProviderItem`、`addNotice`）。逐个检查了 `ui.ts` 中全部 `innerHTML =` 赋值点，
  数据来源要么是常量、要么已过 `md()`。
- **CSRF 防护有效**：`/api/*` 要求 token 且校验 Origin（`server.ts:160-176`、`385-388`），
  服务仅绑 `127.0.0.1`（`server.ts:994,1004`）；跨站页面既读不到 token 也伪造不了 Origin。
- **`secrets.json` 写后 `chmod 0600`**（`providers.ts:565`，Windows 上为 best-effort）。
- **依赖面极窄**：运行时只有 `zod` 与 `zod-to-json-schema`。
- **`scan` 的 `npm audit` 调用无注入**：参数固定为 `["audit","--json"]`，未开 shell（`scan.ts:253-266`）。

---

## 修复优先级建议

1. H1（审批门漏工具）—— 一行白名单就能堵，且它是 H2/M1 提权的关键前置。
2. H2（重定向绕过 SSRF）—— 顺带处理 `allowPrivate` 谁来给的问题。
3. M1（插件同源执行）—— 与 H1 组合后危害最大。
4. M4（更新源无签名）+ L7（`.gitignore` 漏 `data/`）—— 供应链与密钥泄漏。
5. M5 / M2 / M3 —— 加固与文档澄清。
