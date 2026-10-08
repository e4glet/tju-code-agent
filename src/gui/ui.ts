export const VIEW_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Tju code GUI</title>
<link rel="stylesheet" href="/style.css" />
<link rel="icon" href="/favicon.ico" />
<meta name="agent-token" content="__AGENT_TOKEN__" />
</head>
<body>
<main class="layout">
  <div class="drawer-backdrop" id="drawer-backdrop"></div>
  <aside class="sidebar">
    <div class="side-brand">
      <span class="brand"><img class="brand-logo" src="/logo-2026.png" alt="logo" /><span>Tju code</span></span>
      <button id="btn-theme" class="theme-btn" title="切换主题">深色</button>
    </div>
    <div class="panel-title">本轮</div>
    <div class="stat-card">
      <div class="stat-row"><span>工具调用</span><b id="stat-tools">0</b></div>
      <div class="stat-row"><span>耗时</span><b id="stat-time">-</b></div>
      <div class="stat-row"><span>词元数</span><b id="stat-run">0</b></div>
      <div class="stat-row"><span>缓存命中</span><b id="stat-cache-run">-</b></div>
    </div>
    <div class="panel-title">会话</div>
    <button id="btn-clear" class="side-btn">清空会话</button>
    <button id="btn-reset-stats" class="side-btn danger">重置统计</button>
    <div class="panel-title works-title">
      <span>工作项</span>
      <span class="works-count" id="works-count">0</span>
    </div>
    <div class="works-list" id="works-list"></div>
    <button id="btn-new-work" class="side-btn work-new-btn">
      <svg class="icon-plus" width="13" height="13" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 2V12M2 7H12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
      新建工作项
    </button>
  </aside>
  <div class="main-col">
    <header class="topbar">
      <button id="btn-menu" class="menu-btn" title="菜单"><span></span><span></span><span></span></button>
      <div class="tab-switch">
        <button id="tab-chat-btn" class="tab-btn active">对话</button>
        <button id="tab-traj-btn" class="tab-btn">轨迹</button>
      </div>
      <div class="model-wrap">
        <span class="model" id="model-label" title="点击修改模型">-</span>
        <input class="model-input" id="model-input" placeholder="模型 ID" hidden />
      </div>
      <div class="top-stats">
        <span class="stat-chip" id="stat-cache" title="缓存命中率">缓存命中 -</span>
        <span class="stat-chip" id="stat-total" title="累计词元数">词元数 -</span>
      </div>
      <span class="dot" id="status" title="status"></span>
      <button id="btn-settings" class="settings-btn" title="设置" aria-label="设置">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill="currentColor" d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/></svg>
      </button>
    </header>
    <div class="progress" id="progress" hidden></div>
    <div class="tab-panel tab-chat" id="tab-chat">
      <section class="conversation" id="conversation">
        <div class="conv-inner" id="conv-inner">
          <div class="empty-card" id="empty-card">
            <img class="empty-logo" src="/logo-2026.png" alt="logo" />
            <div class="empty-title">Tju code</div>
            <div class="empty-sub">自研 coding agent · 输入消息开始对话</div>
            <div class="empty-chips">
              <button class="chip" data-quick="请用 read 工具读取项目根目录下的 README.md 文件，并基于其内容介绍这个项目">项目概览</button>
              <button class="chip" data-quick="读取当前目录文件并总结">总结目录</button>
              <button class="chip" data-quick="用 bash 查看当前目录内容">跑命令</button>
            </div>
          </div>
        </div>
      </section>
      <section class="composer">
        <div class="todo-dock" id="todo-dock" hidden></div>
        <div class="chat-box">
          <div class="attach-strip" id="attach-strip" hidden></div>
          <div class="steer-strip" id="steer-strip" hidden></div>
          <textarea id="input" rows="3" placeholder="输入消息，按 Ctrl/Cmd+Enter 发送..."></textarea>
          <input type="file" id="attach-file" accept="image/*" multiple hidden />
          <div class="effort-bar">
            <button id="attach-btn" class="attach-btn" title="添加图片附件" type="button">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><g><path d="M14 4c-1.66 0-3 1.34-3 3v8c0 .55.45 1 1 1s1-.45 1-1V8h2v7c0 1.66-1.34 3-3 3s-3-1.34-3-3V7c0-2.76 2.24-5 5-5s5 2.24 5 5v8c0 3.87-3.13 7-7 7s-7-3.13-7-7V8h2v7c0 2.76 2.24 5 5 5s5-2.24 5-5V7c0-1.66-1.34-3-3-3z"></path></g></svg>
            </button>
            <span class="effort-label" title="推理强度：影响思考深度与速度">推理</span>
            <div class="effort-seg" id="effort-seg">
              <button class="effort-opt" data-effort="none" title="none：关闭思考模式">none</button>
              <button class="effort-opt" data-effort="low" title="low：开启思考模式，强度 low">low</button>
              <button class="effort-opt" data-effort="high" title="high：开启思考模式，强度 high（默认）">high</button>
              <button class="effort-opt" data-effort="max" title="max：开启思考模式，强度 max">max</button>
            </div>
            <select id="provider-select" class="provider-select"></select>
          </div>
          <button id="steer-btn" class="steer-btn" title="注入引导（Enter）" type="button" hidden>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 8H10.5M10.5 8L7 4.5M10.5 8L7 11.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M13.5 3V13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          </button>
          <button id="send" class="send-btn" title="发送">
            <svg class="icon-send" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 13V3M4.5 6.5L8 3L11.5 6.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <svg class="icon-stop" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 3H13V13H3Z" fill="currentColor"/></svg>
          </button>
        </div>
      </section>
      <div class="user-nav" id="user-nav" hidden>
        <div class="user-nav-scroll" id="user-nav-scroll">
          <div class="user-nav-clip" id="user-nav-clip">
            <div class="user-nav-list" id="user-nav-list"></div>
          </div>
        </div>
      </div>
      <div class="scroll-col">
        <button id="btn-scroll-bottom" class="scroll-bottom" title="回到最新位置" hidden>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z" fill="currentColor"></path></svg>
        </button>
      </div>
    </div>
    <div class="tab-panel tab-trajectory" id="tab-trajectory" hidden>
      <div class="traj-toolbar">
        <span id="traj-count">暂无历史 run</span>
        <span class="traj-toolbar-spacer"></span>
        <button id="traj-cleanup" class="traj-tool-btn" title="批量清理历史轨迹">清理…</button>
      </div>
      <div class="traj-runs" id="traj-runs">
        <div class="traj-run open" id="traj-live">
          <div class="traj-run-head" id="traj-live-head">
            <span class="caret">›</span>
            <span class="traj-run-badge">实时</span>
            <div class="traj-run-mini" id="traj-live-mini"></div>
            <span class="traj-run-meta" id="traj-live-meta">当前会话</span>
          </div>
          <div class="traj-run-body">
            <div class="traj-overview" id="traj-live-overview"><div class="traj-overview-empty">--</div></div>
            <div class="traj-turns" id="traj-live-turns">
              <div class="traj-empty" id="traj-empty">本轮的工具调用轨迹将显示在这里</div>
            </div>
          </div>
        </div>
        <div class="traj-history" id="traj-history"></div>
      </div>
    </div>
  </div>
</main>
<div class="approval" id="approval" hidden>
  <div class="approval-text" id="approval-text"></div>
  <div class="approval-actions">
    <button id="approval-once" class="approval-btn ok-btn">允许一次</button>
    <button id="approval-always" class="approval-btn always-btn">总是允许</button>
    <button id="approval-parent" class="approval-btn always-btn" hidden>上级</button>
    <button id="approval-no" class="approval-btn">拒绝</button>
  </div>
</div>
<div class="modal-backdrop" id="question-backdrop" hidden>
  <div class="modal question-modal" role="dialog" aria-modal="true" aria-labelledby="question-title">
    <div class="modal-title" id="question-title">需要你确认</div>
    <div class="modal-text" id="question-text"></div>
    <div id="question-options"></div>
    <input class="modal-input" id="question-input" placeholder="或直接输入你的选择…" autocomplete="off" />
    <div class="modal-actions">
      <button class="modal-btn primary" id="question-submit" type="button">确定</button>
    </div>
  </div>
</div>
<div class="traj-menu" id="traj-menu" hidden>
  <button id="traj-menu-delete" class="traj-menu-item danger">删除该 run</button>
  <button id="traj-menu-delete-earlier" class="traj-menu-item danger" hidden>删除更早的全部 run</button>
  <button id="traj-menu-retention" class="traj-menu-item danger">清理 N 天前的轨迹</button>
  <button id="traj-menu-all" class="traj-menu-item danger">清空全部历史 run</button>
</div>
<div class="modal-backdrop" id="settings-backdrop" hidden>
  <div class="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
    <div class="modal-title" id="settings-title">设置</div>
    <div class="tab-switch settings-tabs">
      <button id="settings-tab-general" class="tab-btn active">通用</button>
      <button id="settings-tab-providers" class="tab-btn">接口</button>
      <button id="settings-tab-update" class="tab-btn">更新</button>
    </div>
    <div id="settings-pane-general">
      <label class="settings-row" for="opt-enter-send">
        <span class="settings-label">
          <span class="settings-name">Enter 发送</span>
          <span class="settings-hint">勾选后按 Enter 直接发送，Shift+Enter 换行；不勾选则 Ctrl/Cmd+Enter 发送</span>
        </span>
        <input type="checkbox" id="opt-enter-send" class="settings-check" />
      </label>
      <div class="settings-row">
        <span class="settings-label">
          <span class="settings-name">当前接口 <span class="update-ver" id="provider-current">-</span></span>
          <span class="settings-hint" id="provider-current-detail">加载中…</span>
        </span>
      </div>
    </div>
    <div id="settings-pane-providers" hidden>
      <div class="provider-help" id="provider-help">内置接口只读；编辑内置接口会生成一条同 id 的自定义覆盖，删除该覆盖即恢复内置默认。key 保存在本机数据目录（<span class="provider-help-code" id="provider-help-data-dir">~/.tju-code</span>）下的 <span class="provider-help-code">secrets.json</span>。</div>
      <div id="provider-list"></div>
      <div class="settings-row provider-form" id="provider-form" hidden>
        <span class="settings-label">
          <span class="settings-name" id="provider-form-title">新增接口</span>
          <input class="modal-input provider-input" id="provider-f-id" placeholder="id（英文字母/数字/横线，如 my-gateway）" />
          <input class="modal-input provider-input" id="provider-f-label" placeholder="显示名（如 自建中转）" />
          <div class="provider-api-row">
            <button class="modal-btn provider-api-btn" data-api="openai-completions">OpenAI 兼容</button>
            <button class="modal-btn provider-api-btn" data-api="anthropic-messages">Anthropic</button>
          </div>
          <input class="modal-input provider-input" id="provider-f-baseUrl" placeholder="接口地址，如 https://xxx/v1" />
          <input class="modal-input provider-input" id="provider-f-model" placeholder="默认模型 ID" />
          <input class="modal-input provider-input" id="provider-f-keyEnv" placeholder="key 的环境变量名（可选，如 MY_API_KEY）" />
          <input class="modal-input provider-input" id="provider-f-key" type="password" placeholder="API key（可选，只写不显；留空则用环境变量）" autocomplete="off" />
          <span class="settings-hint" id="provider-form-status"></span>
          <span class="provider-form-actions">
            <button class="modal-btn" id="provider-f-test" type="button">测试连接</button>
            <button class="modal-btn primary" id="provider-f-save" type="button">保存</button>
            <button class="modal-btn" id="provider-f-cancel" type="button">取消</button>
          </span>
        </span>
      </div>
      <div class="update-actions">
        <button id="btn-provider-add" class="modal-btn">新增接口</button>
      </div>
    </div>
    <div id="settings-pane-update" hidden>
      <div class="settings-row">
        <span class="settings-label">
          <span class="settings-name">当前版本 <span class="update-ver" id="update-ver">-</span></span>
          <span class="settings-hint" id="update-status">点击“检查更新”查看是否有新版本</span>
        </span>
      </div>
      <div class="update-actions">
        <button id="btn-update-check" class="modal-btn">检查更新</button>
        <button id="btn-update-apply" class="modal-btn primary" hidden>立即更新</button>
        <button id="btn-update-rollback" class="modal-btn" hidden>回滚上一版</button>
        <button id="btn-update-restart" class="modal-btn primary" hidden>重启服务</button>
        <button id="btn-update-reload" class="modal-btn primary" hidden>刷新页面</button>
      </div>
    </div>
    <div class="modal-actions">
      <button id="settings-close" class="modal-btn primary">完成</button>
    </div>
  </div>
</div>
<div class="modal-backdrop" id="modal-backdrop" hidden>
  <div class="modal" role="dialog" aria-modal="true">
    <div class="modal-title" id="modal-title"></div>
    <div class="modal-text" id="modal-text"></div>
    <input class="modal-input" id="modal-input" type="text" autocomplete="off" spellcheck="false" hidden />
    <div class="modal-actions">
      <button id="modal-cancel" class="modal-btn" hidden>取消</button>
      <button id="modal-ok" class="modal-btn">确定</button>
    </div>
  </div>
</div>
<div class="img-viewer" id="img-viewer" hidden>
  <button class="img-viewer-x" id="img-viewer-x" type="button" title="关闭">×</button>
  <img id="img-viewer-img" alt="preview" />
</div>
<div class="modal-backdrop" id="work-backdrop" hidden>
  <div class="modal work-modal" role="dialog" aria-modal="true" aria-labelledby="work-modal-title">
    <div class="modal-title" id="work-modal-title">新建工作项</div>
    <div class="work-field">
      <div class="work-label">名称</div>
      <input class="modal-input" id="work-f-title" placeholder="例如：重构登录模块" autocomplete="off" />
    </div>
    <div class="work-field">
      <div class="work-label">工作目录</div>
      <div class="work-cwd-row">
        <input class="modal-input" id="work-f-cwd" placeholder="留空使用当前目录" autocomplete="off" spellcheck="false" />
        <button class="modal-btn" id="work-f-browse" type="button">设置</button>
      </div>
      <div class="work-recent" id="work-recent" hidden><span class="work-recent-label">上次使用：</span></div>
    </div>
    <div class="work-browser" id="work-browser" hidden>
      <div class="work-cwd-row">
        <input class="modal-input" id="work-b-path" autocomplete="off" spellcheck="false" />
        <button class="modal-btn" id="work-b-up" type="button" title="上级目录">↑</button>
      </div>
      <div class="work-drives" id="work-drives" hidden></div>
      <div class="work-b-status" id="work-b-status"></div>
      <div class="work-b-list" id="work-b-list"></div>
      <div class="modal-actions work-b-foot">
        <button class="modal-btn primary" id="work-b-pick" type="button">选择当前目录</button>
      </div>
    </div>
    <div class="modal-actions">
      <button class="modal-btn" id="work-cancel" type="button">取消</button>
      <button class="modal-btn primary" id="work-ok" type="button">确定</button>
    </div>
  </div>
</div>
__PLUGIN_SCRIPTS__
<script src="/app.js"></script>
</body>
</html>`;

export const STYLE_CSS = `:root {
  --bg: #f9fafb; --panel: #ffffff; --code: #f2f4f7;
  --border: rgba(15, 17, 21, 0.09); --border-strong: rgba(15, 17, 21, 0.15);
  --text: #1b1b1c; --muted: #6b7076; --faint: #9aa0a8;
  --accent: #4176e6; --accent-hover: #2f66e0; --accent-soft: rgba(65, 118, 230, 0.09);
  --user-bubble: #edf3fe; --err: #e5484d; --ok: #22a06b; --warn: #d9822b;
  --nav-bar: rgba(15, 17, 21, 0.22);
  --shadow: 0 4px 12px 0 rgba(0, 0, 0, 0.02), 0 2px 8px 0 rgba(0, 0, 0, 0.05);
}
html { color-scheme: light; }
html[data-theme="dark"] {
  --bg: #141417; --panel: #212124; --code: #1b1b1e;
  --border: rgba(255, 255, 255, 0.09); --border-strong: rgba(255, 255, 255, 0.16);
  --text: #e8e8ea; --muted: #a0a4aa; --faint: #7c8087;
  --accent: #679efe; --accent-hover: #86acff; --accent-soft: rgba(103, 158, 254, 0.16);
  --user-bubble: #2c2c2e; --err: #f07178; --ok: #4ecb8d; --warn: #e0a458;
  --nav-bar: rgba(255, 255, 255, 0.3);
  --shadow: 0 4px 16px 0 rgba(0, 0, 0, 0.42), 0 2px 8px 0 rgba(0, 0, 0, 0.26);
  color-scheme: dark;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; }
body {
  background: var(--bg); color: var(--text);
  font: 14px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif;
  display: flex; flex-direction: column;
}
button { font: inherit; }
[hidden] { display: none !important; }
a { color: var(--accent); }
code {
  font-family: "SF Mono", "JetBrains Mono", "Fira Code", Consolas, "Liberation Mono", Menlo, Courier, "Microsoft YaHei", monospace;
  background: var(--code); border: 1px solid var(--border);
  border-radius: 5px; padding: 0 4px; font-size: 12px;
}
pre {
  font-family: "SF Mono", "JetBrains Mono", "Fira Code", Consolas, "Liberation Mono", Menlo, Courier, "Microsoft YaHei", monospace;
  font-size: 12.5px; background: var(--code); border: 1px solid var(--border);
  border-radius: 8px; padding: 10px 12px; overflow-x: auto; line-height: 1.5;
}
blockquote { border-left: 3px solid var(--border-strong); padding-left: 10px; color: var(--muted); margin: 6px 0; }
h1, h2, h3, h4 { margin: 8px 0 4px; line-height: 1.3; }
hr { border: 0; border-top: 1px solid var(--border); margin: 10px 0; }
table { border-collapse: collapse; margin: 6px 0; font-size: 13px; }
th, td { border: 1px solid var(--border); padding: 4px 10px; text-align: left; }
th { background: var(--code); font-weight: 600; }
p { margin: 8px 0; }
ul, ol { margin: 8px 0; padding-left: 24px; }
li { margin: 4px 0; }
.topbar {
  display: flex; align-items: center; gap: 12px;
  height: 54px; padding: 0 16px; background: var(--panel);
  border-bottom: 1px solid var(--border); flex-shrink: 0;
}
.tab-switch { display: flex; gap: 2px; background: var(--code); border: 1px solid var(--border); border-radius: 10px; padding: 2px; }
.tab-btn { border: 0; background: transparent; color: var(--muted); padding: 5px 14px; border-radius: 8px; font-size: 13px; cursor: pointer; }
.tab-btn:hover { color: var(--accent); }
.tab-btn.active { background: var(--panel); color: var(--accent); font-weight: 600; box-shadow: var(--shadow); }
.brand { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 15px; color: var(--accent); letter-spacing: .3px; }
.brand .brand-logo { width: 22px; height: 22px; border-radius: 6px; object-fit: contain; }
.side-brand { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
.model-wrap { margin-left: auto; }
.model {
  color: var(--text); font-size: 13px; cursor: text;
  border-bottom: 1px dashed transparent; padding: 2px 4px; border-radius: 6px;
}
.model:hover { background: var(--accent-soft); border-bottom-color: var(--accent); }
.model-input {
  width: 200px; border: 1px solid var(--accent); background: var(--panel);
  color: var(--text); padding: 4px 10px; border-radius: 8px; font-size: 13px; outline: none;
}
.model-input:focus { box-shadow: 0 0 0 3px var(--accent-soft); }
.top-stats { margin-left: auto; display: flex; gap: 6px; align-items: center; }
.stat-chip {
  font-size: 11px; color: var(--muted); background: var(--code);
  border: 1px solid var(--border); border-radius: 999px; padding: 2px 10px;
  font-family: "SF Mono", "JetBrains Mono", "Fira Code", Consolas, monospace;
}
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--faint); flex-shrink: 0; }
.dot.busy { background: var(--accent); animation: pulse 1.2s infinite; }
.dot.err { background: var(--err); }
.dot.idle { background: var(--ok); }
@keyframes pulse { 50% { opacity: .35; } }
.settings-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; flex-shrink: 0;
  border: 1px solid var(--border); background: var(--panel); color: var(--muted);
  border-radius: 8px; cursor: pointer; padding: 0;
}
.settings-btn:hover { color: var(--accent); border-color: var(--accent); background: var(--accent-soft); }
.settings-btn svg { display: block; }
.menu-btn {
  display: none; flex-direction: column; gap: 3px; padding: 6px;
  border: 1px solid var(--border); background: var(--panel); border-radius: 8px; cursor: pointer;
}
.menu-btn span { display: block; width: 16px; height: 2px; background: var(--muted); border-radius: 2px; }
.menu-btn:hover span { background: var(--accent); }
.theme-btn {
  border: 1px solid var(--border); background: var(--panel); color: var(--muted);
  border-radius: 8px; padding: 5px 12px; font-size: 12px; cursor: pointer;
}
.theme-btn:hover { color: var(--accent); border-color: var(--accent); }
.progress { height: 2px; overflow: hidden; background: transparent; flex-shrink: 0; }
.progress::after {
  content: ""; display: block; height: 100%; width: 40%;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
  animation: slide 1.1s infinite linear;
}
@keyframes slide { from { margin-left: -40%; } to { margin-left: 100%; } }
.layout { flex: 1; display: flex; min-height: 0; }
.sidebar {
  width: 210px; flex-shrink: 0; background: var(--panel);
  border-right: 1px solid var(--border); padding: 14px;
  display: flex; flex-direction: column; gap: 8px;
}
.panel-title { color: var(--faint); font-size: 11px; letter-spacing: 1px; margin-top: 8px; }
.stat-card {
  background: var(--code); border: 1px solid var(--border); border-radius: 10px;
  padding: 6px 12px; font-size: 12px;
}
.stat-row { display: flex; justify-content: space-between; padding: 3px 0; color: var(--muted); }
.stat-row b { color: var(--text); font-weight: 600; font-family: "SF Mono", "JetBrains Mono", "Fira Code", Consolas, monospace; }
.side-btn {
  width: 100%; border: 1px solid var(--border); background: var(--panel);
  color: var(--text); padding: 8px 12px; border-radius: 8px; font-size: 13px; cursor: pointer;
}
.side-btn:hover { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
.side-btn.danger { color: var(--warn); }
.side-btn.danger:hover { background: transparent; border-color: var(--err); color: var(--err); }
.side-btn.danger.armed { background: var(--err); border-color: var(--err); color: #fff; }
.work-new-btn { display: flex; align-items: center; justify-content: center; gap: 6px; }
.works-title { display: flex; align-items: center; justify-content: space-between; }
.works-count {
  font-size: 10px; color: var(--faint); background: var(--code);
  border: 1px solid var(--border); border-radius: 999px;
  padding: 0 7px; line-height: 16px;
  font-family: "SF Mono", "JetBrains Mono", "Fira Code", Consolas, monospace;
}
.works-list {
  flex: 1; min-height: 0; overflow-y: auto;
  display: flex; flex-direction: column; gap: 4px;
  margin: 0 -4px; padding: 0 4px;
}
.work-item {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 8px; border-radius: 8px; cursor: pointer;
  border: 1px solid transparent; color: var(--text); font-size: 12px;
  background: transparent; text-align: left; width: 100%; box-sizing: border-box;
}
.work-item:hover { background: var(--accent-soft); border-color: var(--border); }
.work-item.active { background: var(--accent-soft); border-color: var(--accent); }
.work-item .work-title {
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.work-item .work-badge {
  flex: none; width: 7px; height: 7px; border-radius: 50%;
  background: var(--faint); flex-shrink: 0;
}
.work-item.active .work-badge { background: var(--accent); }
.work-item .work-actions {
  display: none; flex: none; align-items: center; gap: 2px;
}
.work-item:hover .work-actions, .work-item.active .work-actions { display: flex; }
.work-act {
  border: 0; background: transparent; color: var(--faint);
  width: 20px; height: 20px; border-radius: 5px; cursor: pointer;
  display: flex; align-items: center; justify-content: center; font-size: 12px;
  padding: 0;
}
.work-act:hover { background: var(--code); color: var(--accent); }
.work-act.danger:hover { color: var(--err); }
.works-empty { color: var(--faint); font-size: 12px; text-align: center; padding: 8px; }
.main-col { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.conversation { flex: 1; overflow-y: auto; padding: 24px 20px 8px; }
.conv-inner { width: 100%; max-width: 788px; margin: 0 auto; min-height: 100%; display: flex; flex-direction: column; gap: 14px; }
.conv-inner > * { flex-shrink: 0; }
.sys-notice {
  align-self: center;
  max-width: 100%;
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
  text-align: center;
}
.sys-notice.warn { background: rgba(217, 130, 43, 0.1); border-color: rgba(217, 130, 43, 0.32); color: var(--warn); }
.empty-card {
  position: relative; align-self: center; text-align: center; margin: auto; color: var(--muted);
  max-width: 440px; padding: 32px 24px;
}
.empty-card::before {
  content: ""; position: absolute; top: 30%; left: 50%; transform: translate(-50%, -50%);
  width: 420px; height: 300px; background: radial-gradient(closest-side, var(--accent-soft), transparent 72%);
  border-radius: 50%; z-index: -1;
}
.empty-card .empty-title { font-size: 30px; font-weight: 700; color: var(--text); letter-spacing: .5px; }
.empty-card .empty-logo { width: 72px; height: 72px; border-radius: 18px; object-fit: contain; margin-bottom: 14px; box-shadow: var(--shadow); }
.empty-card .empty-sub { margin-top: 8px; font-size: 13px; }
.empty-chips { margin-top: 24px; display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
.chip {
  border: 1px solid var(--border); background: var(--panel); color: var(--text);
  border-radius: 999px; padding: 7px 16px; font-size: 13px; cursor: pointer;
}
.chip:hover { border-color: var(--accent); color: var(--accent); }
.bubble {
  position: relative; max-width: 86%; border-radius: 18px; word-break: break-word;
  display: flex; flex-direction: column;
}
.bubble.user { align-self: flex-end; background: var(--user-bubble); color: var(--text); }
.bubble.user .body { padding: 10px 14px; font-size: 15px; line-height: 1.6; white-space: pre-wrap; }
.bubble.assistant { align-self: flex-start; background: transparent; width: 100%; max-width: 100%; }
.bubble.assistant .body { padding: 0 0 0 14px; font-size: 15px; line-height: 1.75; }
.bubble.error {
  align-self: flex-start; color: var(--err); font-size: 13px; max-width: 100%;
  background: rgba(229, 72, 77, 0.07); border: 1px solid rgba(229, 72, 77, 0.28); border-radius: 10px;
}
.bubble.error .body { padding: 8px 12px; }
.bubble .body { min-width: 0; }
.bubble.user .attachments { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; padding: 8px 14px 0; }
.bubble.user .attachments.n1 { grid-template-columns: auto; justify-content: start; }
.bubble.user .attachments.n1 .att-img { width: 320px; max-width: 100%; }
.bubble.user .attachments.n2 { grid-template-columns: auto auto; justify-content: start; }
.bubble.user .attachments.n2 .att-img { width: 220px; max-width: 100%; }
.copy.user-copy { align-self: flex-end; margin: 4px 0 0 0; }
.user-actions { align-self: flex-end; display: flex; align-items: center; gap: 6px; margin: 4px 0 0 0; }
.user-actions .copy { margin: 0; align-self: auto; }
.copy.revert { width: 26px; height: 26px; padding: 0; font-size: 15px; line-height: 1; }
.work-modal { width: min(560px, 100%); }
.work-field { margin-top: 12px; }
.work-field .modal-input { margin-top: 0; }
.work-label { font-size: 12px; color: var(--muted); margin-bottom: 6px; }
.work-cwd-row { display: flex; gap: 8px; }
.work-cwd-row .modal-input { flex: 1; min-width: 0; margin-top: 0; }
.work-recent { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; align-items: center; }
.work-recent[hidden] { display: none; }
.work-recent-label { font-size: 12px; color: var(--faint); flex: none; }
.work-recent-item { border: 1px solid var(--border); background: var(--bg); color: var(--muted); border-radius: 999px; padding: 3px 12px; font-size: 12px; cursor: pointer; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.work-recent-item:hover { border-color: var(--accent); color: var(--accent); }
.work-browser { margin-top: 12px; border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; background: var(--bg); }
.work-browser[hidden] { display: none; }
.work-b-status { font-size: 12px; color: var(--faint); margin: 8px 0 4px; min-height: 17px; }
.work-drives { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 0; }
.work-drives[hidden] { display: none; }
.work-drive { border: 1px solid var(--border); background: var(--panel); color: var(--text); border-radius: 6px; padding: 2px 10px; font-size: 12px; cursor: pointer; }
.work-drive:hover { border-color: var(--accent); color: var(--accent); }
.work-b-status.err { color: var(--err); }
.work-b-list { max-height: 220px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
.work-b-row { display: block; width: 100%; text-align: left; border: 1px solid transparent; background: transparent; border-radius: 8px; padding: 6px 8px; cursor: pointer; }
.work-b-row:hover { background: var(--accent-soft); border-color: var(--accent); }
.work-b-name { color: var(--text); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.work-b-path { color: var(--faint); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 1px; }
.work-b-empty { color: var(--faint); font-size: 12px; padding: 8px; text-align: center; }
.work-b-foot { margin-top: 10px; }
.bubble .att-img {
  width: 100%; height: auto; aspect-ratio: 16 / 10; border-radius: 10px; cursor: zoom-in;
  border: 1px solid var(--border); object-fit: cover; display: block;
}
.bubble .att-img:hover { opacity: .92; }
.img-viewer {
  position: fixed; inset: 0; z-index: 90;
  background: rgba(0, 0, 0, 0.72);
  display: flex; align-items: center; justify-content: center;
  padding: 32px;
}
.img-viewer[hidden] { display: none; }
.img-viewer img {
  max-width: min(92vw, 1100px); max-height: 88vh;
  border-radius: 12px; object-fit: contain;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
  background: #fff;
}
.img-viewer .img-viewer-x {
  position: fixed; top: 18px; right: 22px;
  width: 36px; height: 36px; border: 0; border-radius: 50%;
  background: rgba(255, 255, 255, 0.92); color: #333;
  font-size: 20px; line-height: 1; cursor: pointer;
}
.img-viewer .img-viewer-x:hover { background: #fff; }
.copy-toast {
  position: fixed; z-index: 95;
  background: var(--panel); color: var(--text);
  border: 1px solid var(--border-strong); border-radius: 10px;
  box-shadow: var(--shadow);
  font-size: 13px; font-weight: 500; padding: 6px 14px;
  pointer-events: none; white-space: nowrap;
}
.copy {
  align-self: flex-start; display: inline-flex; margin-top: 6px; margin-left: 14px;
  border: 1px solid var(--border); background: var(--panel); color: var(--muted);
  border-radius: 8px; padding: 4px; cursor: pointer; box-shadow: var(--shadow);
  align-items: center; justify-content: center;
}
.copy svg { flex-shrink: 0; display: block; }
.copy:hover { color: var(--accent); border-color: var(--accent); }
.thinking { margin-bottom: 10px; }
.thinking summary {
  display: flex; align-items: center; gap: 6px; width: fit-content; padding: 3px 10px 3px 4px;
  cursor: pointer; color: var(--muted); font-size: 13px; user-select: none;
  border-radius: 8px; list-style: none;
}
.thinking summary::-webkit-details-marker { display: none; }
.thinking summary:hover { background: var(--accent-soft); }
.thinking summary svg { color: var(--accent); flex-shrink: 0; }
.thinking summary .caret { color: var(--faint); transition: transform .15s ease; }
.thinking[open] summary .caret { transform: rotate(180deg); }
.thinking .thinking-body {
  margin: 6px 0 2px; padding: 10px 12px;
  background: var(--code); border: 1px solid var(--border); border-radius: 10px;
  color: var(--muted); font-size: 13.5px; line-height: 1.7; white-space: pre-wrap;
}
.tool-block {
  align-self: flex-start; width: calc(100% - 20px); background: var(--panel);
  border: 1px solid var(--border); border-radius: 12px; overflow: hidden;
  font-family: "SF Mono", "JetBrains Mono", "Fira Code", Consolas, "Microsoft YaHei", monospace;
  font-size: 12px; color: var(--muted);
}
.tool-block summary { padding: 8px 12px; cursor: pointer; user-select: none; color: var(--text); display: flex; align-items: center; gap: 8px; list-style: none; }
.tool-block summary::-webkit-details-marker { display: none; }
.tool-block summary .name { color: var(--accent); font-weight: 600; }
.tool-block summary .brief { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; color: var(--muted); }
.tool-block pre { padding: 8px 12px; border-top: 1px solid var(--border); max-height: 260px; overflow: auto; white-space: pre-wrap; color: var(--text); background: var(--code); margin: 0; }
.tool-block .badge { font-size: 11px; border-radius: 999px; padding: 1px 8px; color: #fff; flex-shrink: 0; }
.badge.running { background: var(--accent); }
.badge.ok { background: var(--ok); }
.badge.err { background: var(--err); }
.todo-card {
  background: var(--panel); border: 1px solid var(--border); border-radius: 12px;
  overflow: hidden; font-size: 13px;
}
.todo-card.live {
  border-color: var(--accent); box-shadow: var(--shadow);
}
.todo-dock { max-width: 788px; margin: 0 auto 8px; }
.todo-dock .todo-list { max-height: 28vh; overflow-y: auto; }
.todo-head {
  display: flex; align-items: center; gap: 8px;
  padding: 9px 12px; cursor: pointer; user-select: none; font-weight: 600;
}
.todo-head .caret { color: var(--faint); transition: transform .15s ease; }
.todo-card:not(.collapsed) .todo-head .caret { transform: rotate(90deg); }
.todo-badge {
  flex: none; font-size: 11px; border-radius: 999px; padding: 1px 8px; color: #fff;
}
.todo-badge.running { background: var(--accent); }
.todo-badge.ok { background: var(--ok); }
.todo-count {
  margin-left: auto; font-size: 12px; color: var(--muted); font-weight: 500;
  font-family: "SF Mono", "JetBrains Mono", "Fira Code", Consolas, monospace;
}
.todo-body { padding: 2px 0 4px; }
.todo-card.collapsed .todo-body { display: none; }
.todo-bar { height: 4px; margin: 0 12px 8px; background: var(--code); border-radius: 2px; overflow: hidden; }
.todo-bar > i { display: block; height: 100%; width: 0; background: var(--accent); border-radius: 2px; transition: width .3s ease; }
.todo-list { list-style: none; margin: 0; padding: 0 12px 10px; display: flex; flex-direction: column; gap: 6px; max-height: 40vh; overflow-y: auto; }
.todo-list li { display: flex; align-items: baseline; gap: 8px; line-height: 1.5; }
.todo-list li.todo-active { background: var(--accent-soft); border-radius: 8px; padding: 3px 8px; margin: 0 -8px; }
.todo-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.todo-mark { flex: none; width: 16px; text-align: center; }
.todo-done .todo-mark { color: var(--ok); }
.todo-active .todo-mark { color: var(--accent); }
.todo-pending .todo-mark { color: var(--faint); }
.todo-done .todo-text { color: var(--muted); text-decoration: line-through; }
.todo-text { flex: 1; min-width: 0; }
.todo-pri {
  flex: none; font-size: 11px; color: var(--faint);
  border: 1px solid var(--border); border-radius: 999px; padding: 0 7px;
}
.cursor { display: inline-block; width: 2px; height: 1em; background: var(--accent); vertical-align: text-bottom; margin-left: 2px; animation: blink 0.9s infinite; }
@keyframes blink { 50% { opacity: 0; } }
.composer { flex-shrink: 0; padding: 6px 20px 18px; }
.chat-box {
  position: relative; max-width: 788px; margin: 0 auto;
  background: var(--panel); border: 1px solid var(--border); border-radius: 20px;
  box-shadow: var(--shadow); padding: 12px 14px 10px;
}
.chat-box textarea {
  width: 100%; resize: none; border: none; outline: none; background: transparent;
  color: var(--text); padding: 4px 48px 4px 0; font: inherit; font-size: 15px; line-height: 1.5;
  max-height: 220px;
}
.chat-box textarea::placeholder { color: var(--faint); }
.chat-box .send-btn {
  position: absolute; right: 12px; bottom: 12px; width: 32px; height: 32px;
  border: 0; border-radius: 50%; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  background: var(--accent-soft); color: var(--accent);
  transition: background .15s ease, color .15s ease, opacity .15s ease;
}
.chat-box .send-btn:hover:not(.can-send):not(.stop) { opacity: 0.85; }
.chat-box .send-btn.can-send { background: var(--accent); color: #fff; }
.chat-box .send-btn.can-send:hover { background: var(--accent-hover); }
.chat-box .send-btn svg { position: absolute; }
.chat-box .send-btn .icon-stop { display: none; }
.chat-box .send-btn.stop { background: var(--accent); color: #fff; }
.chat-box .send-btn.stop:hover { background: var(--err); }
.chat-box .send-btn.stop .icon-send { display: none; }
.chat-box .send-btn.stop .icon-stop { display: block; }
.chat-box .steer-btn {
  position: absolute; right: 50px; bottom: 12px;
  width: 32px; height: 32px; border: 0; border-radius: 50%; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  background: var(--accent-soft); color: var(--accent);
  transition: background .15s ease, color .15s ease;
}
.chat-box .steer-btn:hover { background: var(--accent); color: #fff; }
.chat-box .steer-btn svg { display: block; }
.effort-bar { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.attach-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; padding: 0; border: 0; border-radius: 6px;
  background: transparent; color: var(--faint); cursor: pointer;
  transition: background .15s ease, color .15s ease;
}
.attach-btn:hover { background: var(--accent-soft); color: var(--accent); }
.attach-strip {
  display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;
  max-height: 140px; overflow-y: auto;
}
.attach-chip {
  position: relative; width: 56px; height: 56px; border-radius: 10px;
  overflow: hidden; border: 1px solid var(--border); background: var(--code);
  flex-shrink: 0;
}
.attach-chip img {
  width: 100%; height: 100%; object-fit: cover; display: block;
}
.attach-chip .attach-name {
  position: absolute; left: 0; right: 0; bottom: 0;
  font-size: 9px; line-height: 1.1; color: #fff; background: rgba(0,0,0,.55);
  padding: 1px 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.attach-chip .attach-x {
  position: absolute; top: 2px; right: 2px; width: 16px; height: 16px;
  border: 0; border-radius: 50%; background: rgba(0,0,0,.55); color: #fff;
  font-size: 10px; line-height: 1; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.attach-chip .attach-x:hover { background: var(--err); }
.attach-count { font-size: 11px; color: var(--faint); user-select: none; }
.steer-strip { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.steer-chip {
  display: inline-flex; align-items: center; gap: 6px; min-width: 0;
  padding: 3px 10px; border-radius: 999px;
  background: var(--accent-soft); color: var(--accent);
  border: 1px solid var(--accent); font-size: 12px;
}
.steer-chip .steer-spin {
  flex: none; width: 10px; height: 10px;
  border: 2px solid currentColor; border-top-color: transparent;
  border-radius: 50%; animation: steer-spin .8s linear infinite;
}
@keyframes steer-spin { to { transform: rotate(360deg); } }
.steer-chip .steer-text {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 340px;
}
.effort-label { font-size: 11px; color: var(--faint); user-select: none; }
.effort-seg {
  display: inline-flex; gap: 2px; padding: 2px;
  background: var(--bg); border: 1px solid var(--border); border-radius: 9px;
}
.effort-opt {
  border: 0; background: transparent; color: var(--faint);
  font: inherit; font-size: 11px; line-height: 1; padding: 4px 8px;
  border-radius: 7px; cursor: pointer;
  transition: background .15s ease, color .15s ease;
}
.effort-opt:hover { color: var(--text); background: var(--accent-soft); }
.effort-opt.active { background: var(--accent); color: #fff; }
.tab-panel { flex: 1; display: flex; flex-direction: column; min-height: 0; position: relative; }
.scroll-col {
  position: absolute; bottom: 164px; left: 20px; right: 20px; margin: 0 auto;
  max-width: 788px; display: flex; justify-content: flex-end;
  pointer-events: none; z-index: 3;
}
.user-nav {
  position: absolute; top: 50%; right: 10px; z-index: 4;
  transform: translateY(-50%);
  background: transparent; border: 1px solid transparent; border-radius: 14px;
  overflow: hidden; cursor: pointer;
  transition: width .22s ease, background .22s ease, border-color .22s ease, box-shadow .22s ease;
}
.user-nav.open {
  background: var(--panel); border-color: var(--border);
  box-shadow: var(--shadow);
}
.user-nav-scroll { overflow: hidden; padding: 10px 0; box-sizing: content-box; scrollbar-width: none; -ms-overflow-style: none; }
.user-nav-scroll::-webkit-scrollbar { display: none; }
.user-nav.open .user-nav-scroll { overflow-y: auto; }
.user-nav-scroll.can-down {
  -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 14px), transparent);
  mask-image: linear-gradient(to bottom, #000 calc(100% - 14px), transparent);
}
.user-nav-scroll.can-up {
  -webkit-mask-image: linear-gradient(to bottom, transparent, #000 14px);
  mask-image: linear-gradient(to bottom, transparent, #000 14px);
}
.user-nav-scroll.can-up.can-down {
  -webkit-mask-image: linear-gradient(to bottom, transparent, #000 14px, #000 calc(100% - 14px), transparent);
  mask-image: linear-gradient(to bottom, transparent, #000 14px, #000 calc(100% - 14px), transparent);
}
.user-nav-clip {
  position: relative; width: 100%; min-height: 30px;
}
.user-nav-item {
  position: absolute; left: 0; right: 0; height: 30px;
  display: flex; align-items: center;
  padding: 6px 8px 6px 16px;
  color: var(--muted); font-size: 13px; line-height: 1.3;
  box-sizing: border-box; user-select: none; cursor: pointer;
  transition: color .15s ease, padding .15s ease;
}
.user-nav.open .user-nav-item { padding: 6px 34px 6px 16px; }
.user-nav-item:hover { color: var(--text); }
.user-nav-text {
  flex: 0 1 auto; min-width: 0; max-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  opacity: 0;
  transition: opacity .18s ease, max-width .22s ease;
}
.user-nav.open .user-nav-text { opacity: 1; max-width: 230px; }
.user-nav-item::after {
  content: ""; position: absolute; right: 6px; top: 50%; z-index: 1;
  width: 12px; height: 3px; margin-top: -1.5px;
  border-radius: 2px; background: var(--nav-bar);
  transition: width .15s ease, height .15s ease, margin .15s ease, background .15s ease;
}
.user-nav-item:hover::after { background: var(--muted); }
.user-nav-item.active { color: var(--accent); }
.user-nav-item.active::after {
  width: 24px; height: 4px; margin-top: -2px;
  background: var(--accent);
}
.user-nav.open .user-nav-item.active { font-weight: 600; }
.scroll-bottom {
  width: 36px; height: 36px; border-radius: 50%;
  border: 1px solid var(--border); background: var(--panel); color: var(--muted);
  display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: var(--shadow);
  pointer-events: auto; transition: opacity .15s ease, color .15s ease, border-color .15s ease;
}
.scroll-bottom:hover { color: var(--accent); border-color: var(--accent); }
.tab-trajectory { padding: 0 14px; }
.traj-toolbar { display: flex; align-items: center; gap: 8px; padding: 12px 2px 0; font-size: 11px; color: var(--faint); }
.traj-toolbar-spacer { flex: 1; }
.traj-tool-btn {
  border: 1px solid var(--border); background: var(--panel); color: var(--muted);
  border-radius: 6px; padding: 3px 10px; font-size: 11px; cursor: pointer;
}
.traj-tool-btn:hover { color: var(--accent); border-color: var(--accent); background: var(--accent-soft); }
.traj-runs {
  flex: 1; overflow-y: auto; min-height: 0; padding: 12px 2px 16px;
  display: flex; flex-direction: column; gap: 10px;
}
.traj-run { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; }
.traj-run.open { border-color: var(--border-strong); }
.traj-run-head {
  display: flex; align-items: center; gap: 10px;
  min-height: 40px; padding: 8px 12px;
  cursor: pointer; user-select: none;
  font-size: 12px; color: var(--muted);
}
.traj-run-head .caret { color: var(--faint); transition: transform .15s ease; flex-shrink: 0; }
.traj-run.open .traj-run-head .caret { transform: rotate(90deg); }
.traj-run-badge {
  flex: none; font-size: 10px; letter-spacing: .4px; color: var(--accent); font-weight: 600;
  border: 1px solid var(--accent); border-radius: 999px; padding: 1px 8px;
}
.traj-run-badge.hist { color: var(--faint); border-color: var(--border-strong); font-weight: 500; }
.traj-run-mini {
  flex: 1; min-width: 0; position: relative; height: 10px;
  background: var(--code); border: 1px solid var(--border); border-radius: 3px; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
}
.traj-run-meta {
  flex: none; max-width: 42%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--faint); font-size: 11px; text-align: right;
}
.traj-run-body { display: none; }
.traj-run.open .traj-run-body { display: block; }
.traj-history { display: flex; flex-direction: column; gap: 10px; }
.traj-history-empty { color: var(--faint); font-size: 12px; text-align: center; padding: 20px 8px; }
.traj-mini-empty { font-size: 10px; color: var(--faint); }
.traj-overview {
  position: relative; height: 46px; margin: 10px 12px 4px; flex-shrink: 0;
  background: var(--code); border: 1px solid var(--border); border-radius: 8px; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
}
.traj-overview-bar {
  position: absolute; top: 6px; bottom: 6px; border-radius: 3px; min-width: 2px;
  background: var(--warn);
}
.traj-mini-seg {
  position: absolute; top: 1px; bottom: 1px; border-radius: 2px; min-width: 2px;
  background: var(--warn);
}
.traj-overview-bar.err, .traj-mini-seg.err { background: var(--err); }
.traj-overview-bar.msg, .traj-mini-seg.msg { background: var(--accent); }
.traj-overview-bar.user, .traj-mini-seg.user { background: var(--ok); }
.traj-overview-empty { font-size: 11px; color: var(--faint); }
.traj-turns { flex: 1; overflow: visible; padding: 0 10px 12px; min-height: 0; }
.traj-menu {
  position: fixed; z-index: 60; min-width: 140px;
  max-width: calc(100vw - 8px); box-sizing: border-box;
  background: var(--panel); border: 1px solid var(--border-strong);
  border-radius: 8px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  padding: 4px; overflow: hidden;
}
.traj-menu-item {
  display: block; width: 100%; box-sizing: border-box;
  text-align: left; padding: 8px 10px; font-size: 12px;
  color: var(--text); background: transparent; border: 0; border-radius: 6px;
  cursor: pointer;
}
.traj-menu-item:hover { background: var(--accent-soft); }
.traj-menu-item[hidden] { display: none; }
.traj-menu-item.danger { color: var(--err); }
.traj-menu-item.danger:hover { background: rgba(214, 69, 69, 0.12); }
.modal-backdrop {
  position: fixed; inset: 0; z-index: 80;
  background: rgba(0, 0, 0, 0.45);
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
}
.modal {
  width: min(400px, 100%);
  background: var(--panel); border: 1px solid var(--border-strong);
  border-radius: 14px; padding: 20px 22px 18px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.28);
  animation: modal-in .16s ease;
}
@keyframes modal-in { from { opacity: 0; transform: translateY(6px) scale(.98); } to { opacity: 1; transform: none; } }
.modal-title {
  display: flex; align-items: center; gap: 8px;
  font-size: 15px; font-weight: 700; color: var(--text);
}
.modal-title::before {
  content: ""; width: 8px; height: 8px; border-radius: 50%; flex: none;
  background: var(--accent);
}
.modal-backdrop.danger .modal-title::before { background: var(--err); }
.modal-text { margin-top: 8px; font-size: 13px; line-height: 1.6; color: var(--muted); white-space: pre-wrap; word-break: break-word; }
.modal-input {
  width: 100%; box-sizing: border-box; margin-top: 14px;
  border: 1px solid var(--border-strong); background: var(--bg); color: var(--text);
  border-radius: 9px; padding: 9px 12px; font-size: 13px; outline: none;
  transition: border-color .15s ease, box-shadow .15s ease;
}
.modal-input::placeholder { color: var(--faint); }
.modal-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.modal-input.invalid { border-color: var(--err); box-shadow: 0 0 0 3px rgba(229, 72, 77, 0.12); animation: shake .2s ease; }
@keyframes shake { 0%, 100% { transform: none; } 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
.modal-btn {
  border: 1px solid var(--border); background: var(--bg); color: var(--text);
  padding: 7px 16px; border-radius: 8px; cursor: pointer; font-size: 13px;
}
.modal-btn:hover { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
.modal-btn:disabled { opacity: .55; cursor: not-allowed; }
.modal-btn:disabled:hover { background: var(--bg); border-color: var(--border); color: var(--text); }
.modal-btn.primary:disabled:hover { background: var(--accent); border-color: var(--accent); color: #fff; }
.modal-btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
.modal-btn.primary:hover { background: var(--accent-hover); border-color: var(--accent-hover); color: #fff; }
.modal-btn.danger { background: var(--err); border-color: var(--err); color: #fff; font-weight: 600; }
.modal-btn.danger:hover { filter: brightness(1.05); color: #fff; }
.settings-modal { width: min(660px, 100%); }
.settings-tabs { margin-top: 14px; align-self: flex-start; }
.settings-row {
  display: flex; align-items: flex-start; gap: 14px; cursor: pointer;
  margin-top: 16px; padding: 12px 14px;
  border: 1px solid var(--border); border-radius: 10px; background: var(--bg);
}
.settings-row:hover { border-color: var(--accent); }
.settings-label { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.settings-name { font-size: 13px; font-weight: 600; color: var(--text); }
.settings-hint { font-size: 12px; line-height: 1.55; color: var(--muted); }
.settings-check { flex: none; width: 17px; height: 17px; margin-top: 2px; accent-color: var(--accent); cursor: pointer; }
.update-ver {
  font-family: "SF Mono", "JetBrains Mono", "Fira Code", Consolas, monospace;
  font-size: 12px; color: var(--muted); font-weight: 500;
}
.update-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.provider-help { margin-top: 12px; font-size: 12px; line-height: 1.6; color: var(--muted); }
.provider-help-code {
  font-family: "SF Mono", "JetBrains Mono", "Fira Code", Consolas, monospace;
  font-size: 11px; color: var(--text); background: var(--code); padding: 1px 4px; border-radius: 4px;
}
#provider-list {
  display: flex; flex-direction: column; gap: 8px; margin-top: 12px;
  max-height: min(46vh, 420px); overflow-y: auto; padding-right: 2px;
}
.provider-warn {
  font-size: 12px; line-height: 1.55; color: var(--warn); background: rgba(217, 130, 43, 0.1);
  border: 1px solid rgba(217, 130, 43, 0.32); border-radius: 8px; padding: 8px 10px;
}
.provider-empty { color: var(--faint); font-size: 12px; text-align: center; padding: 14px 8px; }
.provider-item {
  display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px;
  border: 1px solid var(--border); border-radius: 10px; background: var(--bg);
}
.provider-item:hover { border-color: var(--accent); }
.provider-item.current { border-color: var(--accent); background: var(--accent-soft); }
.provider-item-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.provider-item-title { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; font-size: 13px; font-weight: 600; color: var(--text); }
.provider-item-id {
  font-family: "SF Mono", "JetBrains Mono", "Fira Code", Consolas, monospace;
  font-size: 11px; font-weight: 500; color: var(--faint);
}
.provider-item-meta { font-size: 11px; line-height: 1.5; color: var(--muted); word-break: break-all; }
.provider-item-actions { flex: none; display: flex; flex-direction: column; gap: 6px; align-items: stretch; }
.provider-item-actions .modal-btn { padding: 3px 10px; font-size: 12px; }
.provider-tag {
  font-size: 10px; font-weight: 500; padding: 1px 7px; border-radius: 999px; white-space: nowrap;
  border: 1px solid var(--border); background: var(--panel); color: var(--muted);
}
.provider-tag.ok { color: var(--ok); border-color: rgba(34, 160, 107, 0.35); }
.provider-tag.warn { color: var(--warn); border-color: rgba(217, 130, 43, 0.35); }
.provider-form .provider-input { width: 100%; }
.provider-api-row { display: flex; gap: 6px; }
.provider-api-btn.active { background: var(--accent); border-color: var(--accent); color: #fff; }
.provider-form-actions { display: flex; flex-wrap: wrap; gap: 8px; }
#provider-form-status { min-height: 17px; }
#provider-form-status.err { color: var(--err); }
#provider-form-status.ok { color: var(--ok); }
.provider-select {
  flex: 1 1 auto; min-width: 0; max-width: 250px; height: 30px;
  padding: 0 28px 0 12px; border-radius: 999px;
  border: 1px solid var(--border); color: var(--text);
  font-size: 12px; font-family: inherit; cursor: pointer;
  appearance: none; -webkit-appearance: none;
  text-overflow: ellipsis; white-space: nowrap; overflow: hidden;
  background-color: var(--bg);
  background-image: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'><path d='M2.5 4.5 6 8l3.5-3.5' fill='none' stroke='%236f7683' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/></svg>");
  background-repeat: no-repeat; background-position: right 10px center; background-size: 12px 12px;
  transition: border-color .15s ease, box-shadow .15s ease;
}
html[data-theme="dark"] .provider-select {
  background-image: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'><path d='M2.5 4.5 6 8l3.5-3.5' fill='none' stroke='%23aab4c8' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/></svg>");
}
.provider-select:hover { border-color: var(--accent); }
.provider-select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.settings-modal.wide { width: min(660px, 100%); max-height: calc(100vh - 40px); overflow-y: auto; }
.traj-row-detail {
  margin: 0 10px 0 18px; padding: 8px 10px;
  border: 1px solid var(--border-strong); border-radius: 6px;
  background: var(--panel);
  font-family: "SF Mono", "JetBrains Mono", "Fira Code", Consolas, "Microsoft YaHei", monospace;
  font-size: 11px; line-height: 1.5; color: var(--text);
  white-space: pre-wrap; word-break: break-all;
  max-height: 320px; overflow: auto; user-select: text;
}
.traj-empty { color: var(--faint); font-size: 12px; text-align: center; padding: 20px 8px; }
.traj-turn { background: var(--bg); }
.traj-turn-head {
  position: sticky; top: 0; z-index: 2;
  display: flex; align-items: center; gap: 10px;
  height: 40px; padding: 0 10px;
  cursor: pointer; user-select: none;
  font-size: 12px; color: var(--muted);
  background: var(--panel); border-bottom: 1px solid var(--border);
}
.traj-turn-head .caret { color: var(--faint); transition: transform .15s ease; }
.traj-turn.open .traj-turn-head .caret { transform: rotate(90deg); }
.traj-turn-head .tno { color: var(--accent); font-weight: 600; font-size: 13px; letter-spacing: .3px; }
.traj-turn-head .tspacer { flex: 1; }
.traj-turn-head .ttrail { flex: none; display: flex; align-items: center; gap: 12px; }
.traj-turn-head .tcol {
  flex: none; width: 71px; text-align: left;
  font-family: "SF Mono", "JetBrains Mono", "Fira Code", Consolas, monospace;
  font-size: 10px; letter-spacing: .5px; color: var(--faint);
}
.traj-records { display: none; }
.traj-turn.open .traj-records { display: block; }
.traj-summary { display: none; }
.traj-turn:not(.open) .traj-summary { display: flex; }
.traj-summary-row {
  display: flex; align-items: center; gap: 8px;
  height: 34px; padding: 0 10px 0 18px;
  color: var(--faint); font-size: 12px; cursor: pointer;
  border-top: 1px solid var(--border);
}
.traj-summary-row:hover { color: var(--muted); }
.traj-row {
  display: flex; align-items: center; gap: 14px;
  height: 38px; padding: 0 10px 0 18px;
  border-top: 1px solid var(--border); font-size: 12px;
}
.traj-row:first-child { border-top: 0; }
.traj-row.turn-start { border-top: 2px solid var(--border-strong); }
.traj-row.turn-start:first-child { border-top: 0; }
.traj-idx { flex: none; width: 26px; color: var(--faint); font-family: "SF Mono", "JetBrains Mono", "Fira Code", Consolas, monospace; font-size: 11px; text-align: right; }
.traj-tag { flex: none; width: 76px; height: 22px; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; letter-spacing: .4px; border-radius: 6px; }
.traj-tag.user { color: var(--ok); background: rgba(34, 160, 107, 0.12); }
.traj-tag.message { color: var(--accent); background: var(--accent-soft); }
.traj-tag.tool { color: var(--warn); background: rgba(217, 130, 43, 0.14); }
.traj-row.err .traj-tag { color: var(--err); background: rgba(214, 69, 69, 0.12); }
.traj-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--faint); font-family: "SF Mono", "JetBrains Mono", "Fira Code", Consolas, "Microsoft YaHei", monospace; font-size: 11px; }
.traj-text .tname { color: var(--text); font-weight: 600; }
.traj-text .targs { margin-left: 6px; }
.traj-text .tres { margin-left: 8px; color: var(--faint); }
.traj-text .tres.ok { color: var(--ok); }
.traj-text .tres.err { color: var(--err); }
.traj-text .tres.running { color: var(--accent); }
.traj-trail { flex: none; display: flex; align-items: center; justify-content: flex-end; width: 320px; gap: 12px; }
.traj-metric,
.traj-time {
  flex: none; width: 71px; text-align: left;
  font-family: "SF Mono", "JetBrains Mono", "Fira Code", Consolas, monospace;
  font-size: 11px; color: var(--faint); white-space: nowrap;
}
.traj-metric.in { color: var(--muted); }
.approval {
  position: fixed; bottom: 96px; left: 50%; transform: translateX(-50%);
  width: min(620px, calc(100% - 40px));
  background: var(--panel); border: 1px solid var(--accent); border-top-width: 3px;
  border-radius: 12px; padding: 14px 16px;
  box-shadow: 0 8px 30px rgba(47, 107, 255, .18); z-index: 10;
}
.approval-text { margin-bottom: 10px; white-space: pre-wrap; word-break: break-word; color: var(--text); }
.approval-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.approval-btn { border: 1px solid var(--border); background: var(--bg); color: var(--text); padding: 6px 18px; border-radius: 8px; cursor: pointer; font-size: 13px; }
.approval-btn.ok-btn { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
.approval-btn.always-btn { border-color: var(--accent); color: var(--accent); }
#approval-parent { max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.approval-btn:hover { filter: brightness(1.05); }
.question-modal { width: min(480px, 100%); }
.question-opt { display: block; width: 100%; box-sizing: border-box; text-align: left; margin-top: 8px; }
#question-input { margin-top: 10px; }
.drawer-backdrop { display: none; }
*::-webkit-scrollbar { width: 8px; height: 8px; }
*::-webkit-scrollbar-track { background: transparent; }
*::-webkit-scrollbar-thumb { background: rgba(127, 130, 135, 0.32); border-radius: 4px; }
*::-webkit-scrollbar-thumb:hover { background: rgba(127, 130, 135, 0.5); }
@media (max-width: 720px) {
  .menu-btn { display: flex; }
  .sidebar {
    position: fixed; top: 54px; bottom: 0; left: 0; width: 240px; z-index: 6;
    transform: translateX(-100%); transition: transform .18s ease;
  }
  .layout.drawer-open .sidebar { transform: translateX(0); }
  .layout.drawer-open .drawer-backdrop {
    display: block; position: fixed; inset: 54px 0 0 0;
    background: rgba(0, 0, 0, .25); z-index: 5;
  }
  .bubble { max-width: 96%; }
  .chat-box { border-radius: 16px; }
  .user-nav { display: none; }
}`;

export const APP_JS = `"use strict";
var conversation = document.getElementById("conversation");
var convInner = document.getElementById("conv-inner");
var sendBtn = document.getElementById("send");
var steerBtn = document.getElementById("steer-btn");
var steerStrip = document.getElementById("steer-strip");
var statusDot = document.getElementById("status");
var modelLabel = document.getElementById("model-label");
var modelInput = document.getElementById("model-input");
var ta = document.getElementById("input");
var attachBtn = document.getElementById("attach-btn");
var attachFile = document.getElementById("attach-file");
var attachStrip = document.getElementById("attach-strip");
var settingsBtn = document.getElementById("btn-settings");
var settingsBackdrop = document.getElementById("settings-backdrop");
var settingsClose = document.getElementById("settings-close");
var optEnterSend = document.getElementById("opt-enter-send");
var progressEl = document.getElementById("progress");
var statTools = document.getElementById("stat-tools");
var statTime = document.getElementById("stat-time");
var statRun = document.getElementById("stat-run");
var statCacheRun = document.getElementById("stat-cache-run");
var statCache = document.getElementById("stat-cache");
var statTotal = document.getElementById("stat-total");
var menuBtn = document.getElementById("btn-menu");
var drawerBackdrop = document.getElementById("drawer-backdrop");
var themeBtn = document.getElementById("btn-theme");
var scrollBtn = document.getElementById("btn-scroll-bottom");
var userNav = document.getElementById("user-nav");
var userNavScroll = document.getElementById("user-nav-scroll");
var userNavClip = document.getElementById("user-nav-clip");
var userNavList = document.getElementById("user-nav-list");
var emptyCard = document.getElementById("empty-card");
var liveWs = makeWorkspace(document.getElementById("traj-live"));
var historyWs = {};
var trajNow = null;
var trajMenuRunId = null;
// Summaries from the last /api/runs load, newest first. Kept so batch deletes
// can update the count without re-fetching (and without collapsing open runs).
var trajRuns = [];
// Retention window mirrored from the server; drives the "清理 N 天前" label.
var retentionDays = 7;
var currentRunId = null;
var trajDetailOpen = null;
var EMPTY_CARD = '<div class="empty-card">' +
  '<img class="empty-logo" src="/logo-2026.png" alt="logo" />' +
  '<div class="empty-title">Tju code</div>' +
  '<div class="empty-sub">自研 coding agent · 输入消息开始对话</div>' +
  '<div class="empty-chips">' +
  '<button class="chip" data-quick="请用 read 工具读取项目根目录下的 README.md 文件，并基于其内容介绍这个项目">项目概览</button>' +
  '<button class="chip" data-quick="读取当前目录文件并总结">总结目录</button>' +
  '<button class="chip" data-quick="用 bash 查看当前目录内容">跑命令</button>' +
  '</div></div>';
var modelApi = "openai-completions";
var AGENT_TOKEN = "__AGENT_TOKEN__";
// Short-lived ticket for URLs that cannot carry a header (attachment images).
var attachmentTicket = "";
function refreshAttachmentTicket() {
  return fetch("/api/ticket", { method: "POST", headers: { "x-agent-token": AGENT_TOKEN } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) { if (data && data.ticket) attachmentTicket = data.ticket; })
    .catch(function () {});
}
var cwdNonce = "";
function readFragmentSecrets() {
  try {
    var hash = window.location.hash || "";
    var nm = /[#;]n=([0-9a-f]+)/.exec(hash);
    if (nm) {
      cwdNonce = nm[1];
      try { sessionStorage.setItem("tju.gui.nonce", cwdNonce); } catch (e) {}
    } else {
      try { cwdNonce = sessionStorage.getItem("tju.gui.nonce") || ""; } catch (e) {}
    }
    try { history.replaceState(null, "", window.location.pathname); } catch (e) {}
  } catch (e) {}
}
function attImgUrl(workId, id) {
  var url = "/api/attachments/" + encodeURIComponent(workId) + "/" + encodeURIComponent(id);
  if (attachmentTicket) url += "?t=" + encodeURIComponent(attachmentTicket);
  return url;
}
function paintAttachmentImages(root) {
  var scope = root || document;
  var imgs = scope.querySelectorAll ? scope.querySelectorAll("img.att-img") : [];
  for (var i = 0; i < imgs.length; i++) {
    var img = imgs[i];
    var wid = img.getAttribute("data-work") || currentWorkId;
    var aid = img.getAttribute("data-aid");
    if (!aid) {
      var raw = "";
      try { raw = img.getAttribute("src") || img.src || ""; } catch (e) { raw = ""; }
      var m = raw.match(/\\/api\\/attachments\\/([^\\/\\?]+)\\/([^\\/\\?]+)/);
      if (m) {
        try {
          wid = decodeURIComponent(m[1]);
          aid = decodeURIComponent(m[2]);
        } catch (e) { wid = m[1]; aid = m[2]; }
        img.setAttribute("data-work", wid);
        img.setAttribute("data-aid", aid);
      }
    }
    if (wid && aid) {
      img._attRetried = false;
      img.src = attImgUrl(wid, aid);
    }
  }
}
function retryAttachmentImage(img) {
  if (!img || img._attRetried) return;
  img._attRetried = true;
  refreshAttachmentTicket().then(function () { paintAttachmentImages(img.parentElement || document); });
}
function openImageViewer(src, alt) {
  var viewer = document.getElementById("img-viewer");
  var big = document.getElementById("img-viewer-img");
  if (!viewer || !big || !src) return;
  big.src = src;
  big.alt = alt || "preview";
  viewer.hidden = false;
}
function closeImageViewer() {
  var viewer = document.getElementById("img-viewer");
  var big = document.getElementById("img-viewer-img");
  if (!viewer) return;
  viewer.hidden = true;
  if (big) big.removeAttribute("src");
}
function showCopyToast(anchor) {
  try {
    var old = document.querySelector(".copy-toast");
    if (old) old.remove();
    var tip = document.createElement("div");
    tip.className = "copy-toast";
    tip.textContent = "已复制！";
    document.body.appendChild(tip);
    var x = window.innerWidth / 2;
    var y = window.innerHeight / 2;
    if (anchor && anchor.getBoundingClientRect) {
      var r = anchor.getBoundingClientRect();
      x = r.left + r.width / 2;
      y = r.top - 12;
    }
    tip.style.left = Math.max(8, Math.min(x, window.innerWidth - 8)) + "px";
    tip.style.top = Math.max(8, y) + "px";
    tip.style.transform = "translate(-50%, -100%)";
    setTimeout(function () { tip.remove(); }, 1200);
  } catch (e) {}
}
var isBusy = false;

var stickToBottom = true;
function nearBottom() {
  return conversation.scrollHeight - conversation.scrollTop - conversation.clientHeight < 40;
}
function scrollDown() {
  if (stickToBottom) conversation.scrollTop = conversation.scrollHeight;
}
conversation.addEventListener("scroll", function () {
  stickToBottom = nearBottom();
  if (scrollBtn) scrollBtn.hidden = nearBottom();
  onConversationScroll();
});
scrollBtn.addEventListener("click", function () {
  stickToBottom = true;
  conversation.scrollTop = conversation.scrollHeight;
});

// ---- 右侧对话快速导航（用户提问列表：当前项高亮 + 点击跳转） ----
// 与 DeepSeek 官网的右侧导航同语义：收起时只有一排短条，鼠标经过展开成提问列表，
// 当前可见项高亮、点击滚到该条；面板高度随条目数伸缩（上限 52vh）。
// 消息量大时只渲染视口内的条目（虚拟列表），行高固定 USER_NAV_ITEM_H。
var USER_NAV_ITEM_H = 30;
var USER_NAV_PAD = 10;
var USER_NAV_MIN = 2;
var USER_NAV_LINE = 16;
var USER_NAV_COLLAPSED_W = 48;
var USER_NAV_STRIP_W = 34;
var USER_NAV_TEXT_W = 230;
var USER_NAV_COLLAPSED_ROWS = 9;
var userNavEls = [];
var userNavOpen = false;
var userNavHoverOpen = false;
var userNavActive = -1;
var userNavNodes = [];
var userNavRaf = 0;
var userNavCloseTimer = null;

function isUserMsg(el) {
  return !!el && typeof el.className === "string" && el.className.indexOf("bubble user") === 0;
}
function collectUserMsgs() {
  var out = [];
  var nodes = convInner.children;
  for (var i = 0; i < nodes.length; i++) if (isUserMsg(nodes[i])) out.push(nodes[i]);
  return out;
}
function navMaxH() {
  return Math.max(USER_NAV_ITEM_H * 4 + USER_NAV_PAD * 2, Math.round(window.innerHeight * 0.52));
}
function navFullH() {
  return userNavEls.length * USER_NAV_ITEM_H + USER_NAV_PAD * 2;
}
function applyUserNavSize() {
  if (!userNavScroll) return;
  userNavScroll.style.maxHeight = Math.min(navMaxH(), USER_NAV_PAD * 2 + USER_NAV_COLLAPSED_ROWS * USER_NAV_ITEM_H) + "px";
  userNav.style.width = (userNavHoverOpen ? USER_NAV_TEXT_W + USER_NAV_COLLAPSED_W : USER_NAV_STRIP_W) + "px";
}
function navRender() {
  if (!userNav || !userNavList) return;
  userNavEls = collectUserMsgs();
  var show = tabChat && !tabChat.hidden && userNavEls.length >= USER_NAV_MIN;
  if (!show) userNavHoverOpen = false;
  userNav.hidden = !show;
  userNav.classList.toggle("open", show && userNavHoverOpen);
  userNavOpen = show;
  if (!show) {
    userNavActive = -1;
    userNavList.replaceChildren();
    return;
  }
  applyUserNavSize();
  paintUserNav();
}
function paintUserNav() {
  if (!userNavOpen || !userNavList) return;
  var total = userNavEls.length;
  var viewH = userNavScroll.clientHeight;
  var scrollTop = userNavScroll.scrollTop;
  var first = Math.max(0, Math.floor((scrollTop - USER_NAV_PAD) / USER_NAV_ITEM_H));
  var count = Math.ceil(viewH / USER_NAV_ITEM_H) + 1;
  var last = Math.min(total, first + count);
  var frag = document.createDocumentFragment();
  userNavNodes = [];
  for (var i = first; i < last; i++) {
    var item = document.createElement("div");
    item.className = "user-nav-item";
    item.setAttribute("data-i", String(i));
    item.style.top = (USER_NAV_PAD + i * USER_NAV_ITEM_H) + "px";
    var txt = document.createElement("div");
    txt.className = "user-nav-text";
    var full = String(userNavEls[i].textContent || "").replace(/\\s+/g, " ").trim();
    txt.textContent = full;
    item.appendChild(txt);
    frag.appendChild(item);
    userNavNodes.push({ i: i, el: item });
  }
  userNavClip.style.minHeight = (total * USER_NAV_ITEM_H + USER_NAV_PAD * 2) + "px";
  userNavList.replaceChildren(frag);
  paintUserNavMask();
  computeUserNavActive();
}
function paintUserNavMask() {
  if (!userNavScroll) return;
  var st = userNavScroll.scrollTop;
  userNavScroll.classList.toggle("can-up", st > 1);
  userNavScroll.classList.toggle("can-down", st + userNavScroll.clientHeight < userNavScroll.scrollHeight - 1);
}
function paintUserNavActive() {
  for (var k = 0; k < userNavNodes.length; k++) {
    userNavNodes[k].el.classList.toggle("active", userNavNodes[k].i === userNavActive);
  }
}
function setUserNavActive(i) {
  var changed = i !== userNavActive;
  userNavActive = i;
  paintUserNavActive();
  if (changed) scrollNavToActive();
  return changed;
}
function computeUserNavActive() {
  if (!userNavOpen || !userNavEls.length) { setUserNavActive(-1); return; }
  var convTop = conversation.getBoundingClientRect().top;
  var viewH = conversation.clientHeight || 0;
  var best = -1;
  var bestDist = Infinity;
  var bestAny = 0;
  var bestAnyDist = Infinity;
  for (var i = 0; i < userNavEls.length; i++) {
    var r = userNavEls[i].getBoundingClientRect();
    var d = Math.abs(r.top - convTop);
    if (d < bestAnyDist) { bestAnyDist = d; bestAny = i; }
    if (r.bottom > convTop && r.top < convTop + viewH && d < bestDist) { bestDist = d; best = i; }
  }
  setUserNavActive(best >= 0 ? best : bestAny);
}
function scrollNavToActive() {
  if (userNavActive < 0 || !userNavOpen) return;
  var viewH = userNavScroll.clientHeight;
  var fullH = navFullH();
  if (!viewH || fullH <= viewH) {
    if (userNavScroll.scrollTop !== 0) userNavScroll.scrollTop = 0;
    return;
  }
  var top = USER_NAV_PAD + userNavActive * USER_NAV_ITEM_H + USER_NAV_ITEM_H / 2 - viewH / 2;
  top = Math.max(0, Math.min(fullH - viewH, top));
  if (top !== userNavScroll.scrollTop) userNavScroll.scrollTop = top;
}
function setUserNavHover(open) {
  if (userNavCloseTimer) {
    clearTimeout(userNavCloseTimer);
    userNavCloseTimer = null;
  }
  if (open === userNavHoverOpen || !userNavOpen) return;
  userNavHoverOpen = open;
  if (open) {
    applyUserNavSize();
    userNav.classList.add("open");
    var perView = Math.max(1, Math.floor((userNavScroll.clientHeight - USER_NAV_PAD * 2) / USER_NAV_ITEM_H));
    if (userNavActive >= Math.max(0, userNavEls.length - perView)) {
      var max = navFullH() - userNavScroll.clientHeight;
      if (max > 0) userNavScroll.scrollTop = max;
      else if (userNavScroll.scrollTop !== 0) userNavScroll.scrollTop = 0;
    } else {
      scrollNavToActive();
    }
    paintUserNav();
    return;
  }
  userNav.classList.remove("open");
  userNavCloseTimer = setTimeout(function () {
    userNavCloseTimer = null;
    applyUserNavSize();
    paintUserNav();
  }, 260);
}
function onConversationScroll() {
  if (userNavRaf || !userNavOpen) return;
  userNavRaf = requestAnimationFrame(function () {
    userNavRaf = 0;
    computeUserNavActive();
  });
}
function navSelect(i) {
  var el = userNavEls[i];
  if (!el || !convInner.contains(el)) return;
  setUserNavActive(i);
  var top = el.getBoundingClientRect().top - conversation.getBoundingClientRect().top + conversation.scrollTop;
  conversation.scrollTop = Math.max(0, top - USER_NAV_LINE / 2);
}
userNav.addEventListener("mouseenter", function () { setUserNavHover(true); });
userNav.addEventListener("mouseleave", function () { setUserNavHover(false); });
userNav.addEventListener("focusin", function () { setUserNavHover(true); });
userNav.addEventListener("focusout", function () { setUserNavHover(false); });
userNavList.addEventListener("click", function (ev) {
  var item = ev.target.closest ? ev.target.closest(".user-nav-item") : null;
  if (!item) return;
  navSelect(parseInt(item.getAttribute("data-i"), 10));
});
userNavScroll.addEventListener("scroll", function () {
  if (!userNavOpen) return;
  paintUserNav();
});
window.addEventListener("resize", function () {
  if (!userNavOpen) return;
  applyUserNavSize();
  paintUserNav();
});
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function argsHtml(args) {
  try { return JSON.stringify(args, null, 2); } catch (e) { return String(args); }
}
function fmtTokens(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}
function fmtDur(ms) {
  if (ms < 1000) return ms + "ms";
  var s = ms / 1000;
  if (s < 60) return s.toFixed(1) + "s";
  var m = Math.floor(s / 60);
  return m + "m" + Math.round(s % 60) + "s";
}
function tnow() {
  return trajNow !== null ? trajNow : Date.now();
}

// ---- trajectory panel ----
function makeWorkspace(runEl) {
  return {
    wrap: runEl,
    headEl: runEl.querySelector(".traj-run-head"),
    bodyEl: runEl.querySelector(".traj-run-body"),
    overviewEl: runEl.querySelector(".traj-overview"),
    container: runEl.querySelector(".traj-turns"),
    miniEl: runEl.querySelector(".traj-run-mini"),
    metaEl: runEl.querySelector(".traj-run-meta"),
    turnSerial: 0,
    recSerial: 0,
    currentTurn: null,
    currentMessageRec: null,
    turnFromUserPrompt: false,
    turns: [],
    overviewRecords: [],
    overviewStart: 0,
    emptyEl: null
  };
}
function resetTrajectory(ws) {
  ws.turnSerial = 0;
  ws.recSerial = 0;
  ws.currentTurn = null;
  ws.currentMessageRec = null;
  ws.turnFromUserPrompt = false;
  ws.turns = [];
  ws.overviewRecords = [];
  ws.overviewStart = tnow();
  ws.container.replaceChildren();
  trajDetailOpen = null;
  var hint = document.createElement("div");
  hint.className = "traj-empty";
  hint.textContent = "本轮的执行轨迹将显示在这里";
  ws.container.appendChild(hint);
  ws.emptyEl = hint;
  redrawOverview(ws);
}
function briefText(s) {
  s = String(s || "").replace(/\\s+/g, " ").trim();
  if (s.length > 48) s = s.slice(0, 48) + "...";
  return s;
}
function colorForKind(k, st) {
  if (st === "err") return "err";
  if (k === "tool" || k === "t") return "";
  if (k === "message" || k === "m") return "msg";
  return "user";
}
function overviewBarColor(rec) { return colorForKind(rec.kind, rec.status); }
function overviewBarTitle(rec) {
  var label = rec.kind === "tool" ? "TOOL " + rec.name : rec.kind === "message" ? "ASSISTANT" : "USER";
  var st = rec.status === "err" ? " · ERR" : (rec.kind === "tool" && rec.status === "ok" ? " · OK" : "");
  return label + st + (rec.durMs ? " · " + fmtDur(rec.durMs) : "");
}
function recordsToSegs(ws) {
  var now = tnow();
  return ws.overviewRecords.map(function (r) {
    return {
      k: r.kind === "user" ? "u" : r.kind === "message" ? "m" : "t",
      off: r.startedAt - ws.overviewStart,
      dur: r.endedAt !== null ? (r.endedAt - r.startedAt) : (now - r.startedAt),
      st: r.status || undefined,
      rec: r
    };
  });
}
function drawBars(el, segs, start, barCls, emptyCls) {
  el.replaceChildren();
  if (!segs.length) {
    var ph = document.createElement("div");
    ph.className = emptyCls;
    ph.textContent = "--";
    el.appendChild(ph);
    return;
  }
  var maxEnd = start;
  for (var i = 0; i < segs.length; i++) {
    var e2 = start + segs[i].off + segs[i].dur;
    if (e2 > maxEnd) maxEnd = e2;
  }
  var total = maxEnd - start;
  if (total <= 0) total = 1;
  for (var j = 0; j < segs.length; j++) {
    var sg = segs[j];
    var bar = document.createElement("div");
    bar.className = barCls + " " + colorForKind(sg.k, sg.st);
    bar.style.left = Math.max(0, sg.off / total * 100) + "%";
    bar.style.width = Math.max(0.5, sg.dur / total * 100) + "%";
    if (sg.rec) bar.title = overviewBarTitle(sg.rec);
    el.appendChild(bar);
  }
}
function redrawOverview(ws) {
  var segs = recordsToSegs(ws);
  drawBars(ws.overviewEl, segs, ws.overviewStart, "traj-overview-bar", "traj-overview-empty");
  if (ws.miniEl) drawBars(ws.miniEl, segs, ws.overviewStart, "traj-mini-seg", "traj-mini-empty");
}
function renderRowText(rec) {
  if (rec.el) rec.el.classList.toggle("err", rec.status === "err");
  if (rec.kind === "tool") {
    rec.textEl.replaceChildren();
    var name = document.createElement("span");
    name.className = "tname";
    name.textContent = rec.name;
    rec.textEl.appendChild(name);
    if (rec.brief) {
      var ar = document.createElement("span");
      ar.className = "targs";
      ar.textContent = rec.brief;
      rec.textEl.appendChild(ar);
    }
    if (rec.status === "running") {
      var run = document.createElement("span");
      run.className = "tres running";
      run.textContent = "→ 运行中…";
      rec.textEl.appendChild(run);
    } else if (rec.status === "err") {
      var err = document.createElement("span");
      err.className = "tres err";
      err.textContent = "→ " + (rec.result || "ERR");
      rec.textEl.appendChild(err);
    } else if (rec.result) {
      var res = document.createElement("span");
      res.className = "tres ok";
      res.textContent = "→ " + rec.result;
      rec.textEl.appendChild(res);
    }
  } else {
    rec.textEl.replaceChildren();
    var b = document.createElement("span");
    b.textContent = rec.brief || "";
    rec.textEl.appendChild(b);
    if (rec.status === "err") {
      var e2 = document.createElement("span");
      e2.className = "tres err";
      e2.textContent = "→ " + (rec.result || "ERR");
      rec.textEl.appendChild(e2);
    }
  }
}
function renderRowTail(rec) {
  if (rec.kind === "message") {
    rec.inEl.textContent = rec.tokens > 0 ? fmtTokens(rec.tokens) + " tok" : "";
    rec.inEl.className = "traj-metric in";
    rec.outEl.textContent = rec.output > 0 ? fmtTokens(rec.output) + " tok" : "";
    rec.outEl.className = "traj-metric";
    rec.thEl.textContent = "";
    rec.timeEl.textContent = rec.durMs > 0 ? fmtDur(rec.durMs) : "";
    rec.timeEl.className = "traj-time";
  } else {
    rec.inEl.textContent = "";
    rec.outEl.textContent = "";
    rec.thEl.textContent = "";
    rec.timeEl.textContent = rec.status === "running" ? "" : (rec.durMs > 0 ? fmtDur(rec.durMs) : "");
    rec.timeEl.className = "traj-time";
  }
}
function updateRow(rec) {
  renderRowText(rec);
  renderRowTail(rec);
}
function trajDetailText(rec) {
  if (rec.kind === "tool") {
    var s = rec.name || "";
    if (rec.fullArgs) s += "  " + rec.fullArgs;
    if (rec.fullResult) s += "\\n→ " + rec.fullResult;
    else if (rec.result) s += "\\n→ " + rec.result;
    return s;
  }
  var t = rec.fullText || rec.brief || "";
  if (rec.status === "err" && rec.result) t += "\\n→ " + rec.result;
  return t;
}
function toggleTrajDetail(rec, rowEl) {
  if (!rowEl) return;
  if (rec.detailEl) {
    rec.detailEl.remove();
    rec.detailEl = null;
    if (trajDetailOpen === rec) trajDetailOpen = null;
    return;
  }
  if (trajDetailOpen && trajDetailOpen.detailEl) {
    trajDetailOpen.detailEl.remove();
    trajDetailOpen.detailEl = null;
  }
  var pre = document.createElement("pre");
  pre.className = "traj-row-detail";
  pre.textContent = trajDetailText(rec) || "(无内容)";
  rowEl.parentNode.insertBefore(pre, rowEl.nextSibling);
  rec.detailEl = pre;
  trajDetailOpen = rec;
}
function buildRow(rec) {
  var row = document.createElement("div");
  row.className = "traj-row";
  var idx = document.createElement("span");
  idx.className = "traj-idx";
  idx.textContent = "#" + rec.n;
  var tag = document.createElement("span");
  tag.className = "traj-tag " + rec.kind;
  tag.textContent = rec.kind === "message" ? "ASSISTANT" : rec.kind === "user" ? "USER" : "TOOL";
  var text = document.createElement("span");
  text.className = "traj-text";
  var trail = document.createElement("span");
  trail.className = "traj-trail";
  var inEl = document.createElement("span");
  inEl.className = "traj-metric in";
  var outEl = document.createElement("span");
  outEl.className = "traj-metric";
  var thEl = document.createElement("span");
  thEl.className = "traj-metric";
  var timeEl = document.createElement("span");
  timeEl.className = "traj-time";
  trail.appendChild(inEl);
  trail.appendChild(outEl);
  trail.appendChild(thEl);
  trail.appendChild(timeEl);
  row.appendChild(idx);
  row.appendChild(tag);
  row.appendChild(text);
  row.appendChild(trail);
  rec.el = row;
  rec.textEl = text;
  rec.inEl = inEl;
  rec.outEl = outEl;
  rec.thEl = thEl;
  rec.timeEl = timeEl;
  updateRow(rec);
  row.addEventListener("click", function () { toggleTrajDetail(rec, row); });
  return row;
}
function addRecordRow(ws, turn, rec) {
  var row = buildRow(rec);
  if (!turn.bodyEl.firstElementChild) row.classList.add("turn-start");
  turn.bodyEl.appendChild(row);
  ws.overviewRecords.push(rec);
  updateTurnHeader(turn);
}
function updateTurnHeader(turn) {
  var toolCount = 0;
  for (var i = 0; i < turn.records.length; i++) {
    if (turn.records[i].kind === "tool") toolCount++;
  }
  turn.sumEl.textContent = toolCount ? "… " + toolCount + " 个工具调用" : "… 无工具调用";
}
function makeTurn(ws, turn) {
  if (ws.emptyEl) { ws.emptyEl.remove(); ws.emptyEl = null; }
  var wrap = document.createElement("div");
  wrap.className = "traj-turn";
  var head = document.createElement("div");
  head.className = "traj-turn-head";
  var caret = document.createElement("span");
  caret.className = "caret";
  caret.textContent = "›";
  var no = document.createElement("span");
  no.className = "tno";
  no.textContent = "Turn " + turn.n;
  var spacer = document.createElement("span");
  spacer.className = "tspacer";
  var trail = document.createElement("span");
  trail.className = "ttrail";
  var labels = ["Input", "Output", "Think", "Time"];
  for (var li = 0; li < labels.length; li++) {
    var col = document.createElement("span");
    col.className = "tcol";
    col.textContent = labels[li];
    trail.appendChild(col);
  }
  head.appendChild(caret);
  head.appendChild(no);
  head.appendChild(spacer);
  head.appendChild(trail);
  var body = document.createElement("div");
  body.className = "traj-records";
  var summary = document.createElement("div");
  summary.className = "traj-summary traj-summary-row";
  wrap.appendChild(head);
  wrap.appendChild(body);
  wrap.appendChild(summary);
  function toggle() { wrap.classList.toggle("open"); }
  head.addEventListener("click", toggle);
  summary.addEventListener("click", toggle);
  ws.container.appendChild(wrap);
  turn.el = wrap;
  turn.headEl = head;
  turn.bodyEl = body;
  turn.sumEl = summary;
  for (var i = 0; i < turn.records.length; i++) {
    var row = buildRow(turn.records[i]);
    if (!body.firstElementChild) row.classList.add("turn-start");
    body.appendChild(row);
    ws.overviewRecords.push(turn.records[i]);
  }
  wrap.classList.add("open");
  updateTurnHeader(turn);
  return turn;
}
function createTurn(ws) {
  ws.turnSerial++;
  var turn = { n: ws.turnSerial, records: [], tokensIn: 0, startedAt: tnow(), endedAt: null };
  ws.currentTurn = makeTurn(ws, turn);
  return ws.currentTurn;
}
function endTurn(ws) {
  if (!ws.currentTurn) return;
  ws.currentTurn.endedAt = tnow();
  updateTurnHeader(ws.currentTurn);
  ws.turns.push(ws.currentTurn);
  ws.currentTurn = null;
  if (ws === liveWs) saveTraj(ws);
}
function trajUserStart(ws, msg) {
  if (!ws.currentTurn) { ws.turnFromUserPrompt = true; createTurn(ws); }
  var rec = {
    kind: "user",
    n: ++ws.recSerial,
    name: "",
    brief: briefText(typeof msg.content === "string" ? msg.content : ""),
    fullText: typeof msg.content === "string" ? msg.content : "",
    status: null,
    startedAt: tnow(),
    endedAt: null,
    durMs: 0,
    tokens: 0,
    output: 0
  };
  ws.currentTurn.records.push(rec);
  addRecordRow(ws, ws.currentTurn, rec);
  ws.currentMessageRec = rec;
}
function trajMessageStart(ws, msg) {
  if (!ws.currentTurn) createTurn(ws);
  var rec = {
    kind: "message",
    n: ++ws.recSerial,
    name: "",
    brief: briefText(assistantText(msg)),
    fullText: assistantText(msg),
    status: null,
    startedAt: tnow(),
    endedAt: null,
    durMs: 0,
    tokens: 0,
    output: 0
  };
  ws.currentTurn.records.push(rec);
  addRecordRow(ws, ws.currentTurn, rec);
  ws.currentMessageRec = rec;
}
function trajMessageUpdate(ws, msg) {
  if (!ws.currentMessageRec || ws.currentMessageRec.kind !== "message") return;
  ws.currentMessageRec.fullText = assistantText(msg);
  ws.currentMessageRec.brief = briefText(ws.currentMessageRec.fullText);
  updateRow(ws.currentMessageRec);
}
function trajMessageEnd(ws, msg) {
  if (!ws.currentMessageRec) return;
  ws.currentMessageRec.endedAt = tnow();
  ws.currentMessageRec.durMs = ws.currentMessageRec.endedAt - ws.currentMessageRec.startedAt;
  if (ws.currentMessageRec.kind === "message") {
    ws.currentMessageRec.tokens = (msg.usage && typeof msg.usage.input === "number") ? msg.usage.input : 0;
    if (msg.usage && typeof msg.usage.totalTokens === "number") {
      ws.currentMessageRec.output = Math.max(0, msg.usage.totalTokens - ws.currentMessageRec.tokens);
    }
    ws.currentMessageRec.fullText = assistantText(msg);
    ws.currentMessageRec.brief = briefText(ws.currentMessageRec.fullText);
    if (msg.stopReason === "error" || msg.errorMessage) {
      ws.currentMessageRec.status = "err";
      ws.currentMessageRec.result = msg.errorMessage || "assistant error";
    }
  } else {
    ws.currentMessageRec.fullText = typeof msg.content === "string" ? msg.content : "";
    ws.currentMessageRec.brief = briefText(ws.currentMessageRec.fullText);
  }
  updateRow(ws.currentMessageRec);
  redrawOverview(ws);
  ws.currentMessageRec = null;
}
function addToolToTurn(ws, turn, e) {
  var rec = {
    id: e.toolCallId,
    kind: "tool",
    n: ++ws.recSerial,
    name: e.toolName,
    brief: argBrief(e.args) || "",
    fullArgs: e.toolName === "todowrite" ? todoListText(e.args) : argsHtml(e.args),
    fullResult: "",
    status: "running",
    startedAt: tnow(),
    endedAt: null,
    durMs: 0,
    tokens: 0,
    result: ""
  };
  turn.records.push(rec);
  addRecordRow(ws, turn, rec);
  redrawOverview(ws);
  return rec;
}
function finishTool(ws, rec, isError, resultText, resultFull) {
  rec.endedAt = tnow();
  rec.durMs = rec.endedAt - rec.startedAt;
  rec.status = isError ? "err" : "ok";
  if (resultText) rec.result = resultText;
  if (resultFull) rec.fullResult = resultFull;
  updateRow(rec);
  redrawOverview(ws);
}
function saveTraj(ws) {
  try {
    var data = {
      start: ws.overviewStart,
      turns: ws.turns.map(function (t) {
        return {
          n: t.n,
          durMs: Math.max(0, (t.endedAt !== null ? t.endedAt : Date.now()) - t.startedAt),
          tokensIn: t.tokensIn,
          records: t.records.map(function (r) {
            return {
              kind: r.kind,
              name: r.name,
              brief: r.brief,
              status: r.status || undefined,
              off: r.startedAt - ws.overviewStart,
              durMs: Math.max(0, (r.endedAt !== null ? r.endedAt : Date.now()) - r.startedAt),
              tokens: r.tokens,
              output: r.output || 0,
              result: r.result || undefined
            };
          })
        };
      })
    };
    localStorage.setItem("tju.gui.traj", JSON.stringify(data));
  } catch (e) {}
}
function restoreTraj(ws) {
  var raw = null;
  try { raw = localStorage.getItem("tju.gui.traj"); } catch (e) {}
  if (!raw) { resetTrajectory(ws); return; }
  var data;
  try { data = JSON.parse(raw); } catch (e) {}
  if (!data || !Array.isArray(data.turns) || !data.turns.length) { resetTrajectory(ws); return; }
  ws.container.replaceChildren();
  ws.emptyEl = null;
  ws.turns = [];
  ws.overviewRecords = [];
  ws.overviewStart = typeof data.start === "number" ? data.start : Date.now();
  ws.recSerial = 0;
  for (var i = 0; i < data.turns.length; i++) {
    var t = data.turns[i];
    var records = [];
    if (Array.isArray(t.records)) {
      for (var j = 0; j < t.records.length; j++) {
        var rr = t.records[j];
        var off = typeof rr.off === "number" ? rr.off : 0;
        var kind = rr.kind === "user" || rr.kind === "message" ? rr.kind : "tool";
        var done = rr.status === "ok" || rr.status === "err";
        records.push({
          id: rr.id || "",
          kind: kind,
          n: ++ws.recSerial,
          name: rr.name || "",
          brief: rr.brief || "",
          status: done ? rr.status : (kind === "tool" ? "running" : null),
          startedAt: ws.overviewStart + off,
          endedAt: done ? ws.overviewStart + off + (rr.durMs || 0) : null,
          durMs: rr.durMs || 0,
          tokens: rr.tokens || 0,
          output: kind === "message" ? (rr.output || 0) : 0,
          result: rr.result || ""
        });
      }
    }
    ws.turns.push(makeTurn(ws, { n: t.n || (i + 1), records: records, tokensIn: t.tokensIn || 0, startedAt: ws.overviewStart, endedAt: ws.overviewStart + (t.durMs || 0) }));
  }
  redrawOverview(ws);
  if (!ws.container.children.length) resetTrajectory(ws);
}
function clearTrajectory() {
  try { localStorage.removeItem("tju.gui.traj"); } catch (e) {}
  resetTrajectory(liveWs);
}
function handleTrajEvent(ws, e) {
  switch (e.type) {
    case "agent_start":
      resetTrajectory(ws);
      break;
    case "message_start":
      if (e.message.role === "user") trajUserStart(ws, e.message);
      else if (e.message.role === "assistant") trajMessageStart(ws, e.message);
      break;
    case "message_update":
      trajMessageUpdate(ws, e.message);
      break;
    case "message_end":
      trajMessageEnd(ws, e.message);
      break;
    case "tool_start":
      if (!ws.currentTurn) createTurn(ws);
      addToolToTurn(ws, ws.currentTurn, e);
      break;
    case "tool_end":
      if (ws.currentTurn) {
        for (var ti = 0; ti < ws.currentTurn.records.length; ti++) {
          if (ws.currentTurn.records[ti].id === e.toolCallId) {
            var resBrief = "";
            var resFull = e.result && e.result.content ? String(e.result.content) : "";
            if (e.toolName === "fetch") {
              var fd2 = e.result && e.result.details;
              resBrief = "已获取" + (fd2 && fd2.status ? " HTTP " + fd2.status : "");
            } else if (e.result && e.result.content) {
              resBrief = briefText(e.result.content);
            }
            finishTool(ws, ws.currentTurn.records[ti], e.isError, resBrief, resFull);
            break;
          }
        }
      }
      break;
    case "turn_start":
      if (ws.turnFromUserPrompt) { ws.turnFromUserPrompt = false; } else { createTurn(ws); }
      break;
    case "turn_end":
      endTurn(ws);
      break;
    default:
      break;
  }
}

function mdInline(s) {
  s = esc(s);
  s = s.replace(/\`([^\`]+)\`/g, "<code>$1</code>");
  s = s.replace(/\\*\\*([^*]+)\\*\\*/g, "<strong>$1</strong>");
  s = s.replace(/\\*([^*]+)\\*/g, "<em>$1</em>");
  s = s.replace(/\\[([^\\]]+)\\]\\((https?:\\/\\/[^\\s"]+|#[\\w-]+)\\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return s;
}

function md(src) {
  src = String(src || "");
  var lines = src.split("\\n");
  var html = [];
  var para = "";
  var inFence = false;
  var fenceBuf = [];
  var inList = false;
  var tableBuf = [];

  function closeList() {
    if (inList) { html.push("</ul>"); inList = false; }
  }
  function flushPara() {
    if (!para) return;
    html.push("<p>" + para + "</p>");
    para = "";
  }
  function flushTable() {
    if (!tableBuf.length) return;
    var rows = tableBuf.map(function (r) {
      return r.replace(/^\\s*\\|/, "").replace(/\\|\\s*$/, "").split("|").map(function (c) { return c.trim(); });
    });
    tableBuf = [];
    if (rows.length >= 2 && rows[1].every(function (c) { return /^:?-+:?$/.test(c); })) {
      var head = rows[0];
      var h = "<table><thead><tr>" + head.map(function (c) { return "<th>" + mdInline(c) + "</th>"; }).join("") + "</tr></thead><tbody>";
      for (var r = 2; r < rows.length; r++) {
        var cols = [];
        for (var k = 0; k < head.length; k++) cols.push(rows[r][k] || "");
        h += "<tr>" + cols.map(function (c) { return "<td>" + mdInline(c) + "</td>"; }).join("") + "</tr>";
      }
      h += "</tbody></table>";
      html.push(h);
    } else {
      for (var r2 = 0; r2 < rows.length; r2++) html.push("<p>" + mdInline(rows[r2].join("|")) + "</p>");
    }
  }

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (tableBuf.length) {
      if (/^\\s*\\|/.test(line)) { tableBuf.push(line); continue; }
      flushTable();
    }
    if (/^\\s*$/.test(line)) {
      flushPara();
      closeList();
      continue;
    }
    if (/^\`\`\`/.test(line)) {
      flushPara();
      if (inFence) {
        inFence = false;
        var fenceText = fenceBuf.join("\\n");
        if (fenceText.trim()) html.push("<pre><code>" + esc(fenceText) + "</code></pre>");
        fenceBuf = [];
      } else {
        inFence = true;
      }
      continue;
    }
    if (inFence) { fenceBuf.push(line); continue; }
    if (/^\\s*\\|/.test(line)) { flushPara(); closeList(); tableBuf.push(line); continue; }

    var headM = line.match(/^(#{1,4})\\s+(.*)$/);
    if (headM) {
      flushPara(); closeList();
      var lvl = headM[1].length;
      html.push("<h" + lvl + ">" + mdInline(headM[2]) + "</h" + lvl + ">");
      continue;
    }
    if (/^\\s*[-*_]{3,}\\s*$/.test(line)) {
      flushPara(); closeList();
      if (html[html.length - 1] !== "<hr/>") html.push("<hr/>");
      continue;
    }
    if (/^>\\s?/.test(line)) {
      flushPara(); closeList();
      html.push("<blockquote>" + mdInline(line.replace(/^>\\s?/, "")) + "</blockquote>");
      continue;
    }
    if (/^\\s*[-*]\\s+/.test(line)) {
      flushPara();
      if (!inList) { html.push("<ul>"); inList = true; }
      html.push("<li>" + mdInline(line.replace(/^\\s*[-*]\\s+/, "")) + "</li>");
      continue;
    }
    closeList();
    if (para) para += "\\n";
    para += mdInline(line);
  }
  if (inFence) {
    var fenceText2 = fenceBuf.join("\\n");
    if (fenceText2.trim()) html.push("<pre><code>" + esc(fenceText2) + "</code></pre>");
  }
  flushTable();
  flushPara();
  closeList();
  return html.join("\\n");
}

function assistantText(msg) {
  var text = (msg.content || []).filter(function (c) { return c.type === "text"; }).map(function (c) { return c.text; }).join("");
  if (text) return text;
  var calls = (msg.content || []).filter(function (c) { return c.type === "toolCall"; });
  if (!calls.length) return "";
  return "调用 " + calls.map(function (c) {
    var ab = argBrief(c.arguments);
    return ab ? c.name + "(" + ab + ")" : c.name;
  }).join("、");
}

// The formal answer text only (excludes thinking), used to decide whether a
// copy button should appear and what it should copy.
function assistantAnswerText(msg) {
  if (!msg || !Array.isArray(msg.content)) {
    return msg && typeof msg.content === "string" ? msg.content : "";
  }
  var out = "";
  for (var i = 0; i < msg.content.length; i++) {
    var blk = msg.content[i];
    if (blk && blk.type === "text" && blk.text) out += blk.text;
  }
  return out;
}

var THINKING_ICON = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.00192 6.64454C8.75026 6.64454 9.35732 7.25169 9.35739 8.00001C9.35739 8.74838 8.7503 9.35548 8.00192 9.35548C7.25367 9.35533 6.64743 8.74829 6.64743 8.00001C6.6475 7.25178 7.25371 6.64468 8.00192 6.64454Z" fill="currentColor"></path><path fill-rule="evenodd" clip-rule="evenodd" d="M9.97165 1.29981C11.5853 0.718916 13.271 0.642197 14.3144 1.68555C15.3577 2.72902 15.2811 4.41466 14.7002 6.02833C14.4707 6.66561 14.1504 7.32937 13.75 8.00001C14.1504 8.67062 14.4707 9.33444 14.7002 9.97169C15.2811 11.5854 15.3578 13.271 14.3144 14.3145C13.271 15.3579 11.5854 15.2811 9.97165 14.7002C9.3344 14.4708 8.67059 14.1505 7.99997 13.75C7.32933 14.1505 6.66558 14.4708 6.02829 14.7002C4.41461 15.2811 2.72899 15.3578 1.68552 14.3145C0.642155 13.271 0.71887 11.5854 1.29977 9.97169C1.52915 9.33454 1.84865 8.67049 2.24899 8.00001C1.84866 7.32953 1.52915 6.66544 1.29977 6.02833C0.718852 4.41459 0.64207 2.729 1.68552 1.68555C2.72897 0.642112 4.41456 0.718887 6.02829 1.29981C6.66541 1.52918 7.32949 1.8487 7.99997 2.24903C8.67045 1.84869 9.33451 1.52919 9.97165 1.29981ZM12.9404 9.2129C12.4391 9.893 11.8616 10.5681 11.2148 11.2149C10.568 11.8616 9.89296 12.4391 9.21286 12.9404C9.62532 13.1579 10.0271 13.338 10.4121 13.4766C11.9146 14.0174 12.9172 13.8738 13.3955 13.3955C13.8737 12.9173 14.0174 11.9146 13.4765 10.4121C13.3379 10.0271 13.1578 9.62535 12.9404 9.2129ZM3.05856 9.2129C2.84121 9.62523 2.66197 10.0272 2.52341 10.4121C1.98252 11.9146 2.12627 12.9172 2.60446 13.3955C3.08278 13.8737 4.08544 14.0174 5.58786 13.4766C5.97264 13.338 6.37389 13.1577 6.7861 12.9404C6.10624 12.4393 5.43168 11.8614 4.78513 11.2149C4.13823 10.5679 3.55992 9.89313 3.05856 9.2129ZM7.99899 3.792C7.23179 4.31419 6.45306 4.95512 5.70407 5.70411C4.95509 6.45309 4.31415 7.23184 3.79196 7.99903C4.3143 8.76666 4.95471 9.54653 5.70407 10.2959C6.45309 11.0449 7.23271 11.6848 7.99997 12.207C8.76725 11.6848 9.54683 11.0449 10.2959 10.2959C11.0449 9.54686 11.6848 8.76729 12.207 8.00001C11.6848 7.23275 11.0449 6.45312 10.2959 5.70411C9.5465 4.95475 8.76662 4.31434 7.99899 3.792ZM5.58786 2.52344C4.08533 1.98255 3.08272 2.12625 2.60446 2.6045C2.12621 3.08275 1.98252 4.08536 2.52341 5.5879C2.66189 5.97253 2.8414 6.37409 3.05856 6.78614C3.55983 6.10611 4.1384 5.43189 4.78513 4.78516C5.43186 4.13843 6.10606 3.55987 6.7861 3.0586C6.37405 2.84144 5.97249 2.66192 5.58786 2.52344ZM13.3955 2.6045C12.9172 2.12631 11.9146 1.98257 10.4121 2.52344C10.0272 2.66201 9.62519 2.84125 9.21286 3.0586C9.8931 3.55996 10.5679 4.13827 11.2148 4.78516C11.8614 5.43172 12.4392 6.10627 12.9404 6.78614C13.1577 6.37393 13.338 5.97267 13.4765 5.5879C14.0174 4.08549 13.8736 3.08281 13.3955 2.6045Z" fill="currentColor"></path></svg>';

var THINKING_CARET = '<svg class="caret" width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function renderAssistant(msg) {
  var thinking = "";
  var text = "";
  if (!Array.isArray(msg.content)) {
    if (typeof msg.content === "string" && msg.content) text = msg.content;
  } else {
    var blk = msg.content;
    for (var i = 0; i < blk.length; i++) {
      var block = blk[i];
      if (block.type === "thinking" && block.thinking) thinking += block.thinking;
      if (block.type === "text" && block.text) text += block.text;
    }
  }
  var out = "";
  if (thinking) {
    out += '<details class="thinking"><summary>' + THINKING_ICON + "思考过程" + THINKING_CARET + '</summary><div class="thinking-body">' + esc(thinking) + "</div></details>";
  }
  if (text) out += md(text);
  return out;
}
// User's explicit thinking-panel choice while streaming (null = collapsed
// default). Recorded by the delegated summary click so the choice survives the
// high-frequency innerHTML rebuilds of the stream view.
var streamThinkingOpen = null;

// Split an assistant message into its thinking text and answer text.
function splitAssistantMessage(msg) {
  var thinking = "";
  var text = "";
  if (!Array.isArray(msg.content)) {
    if (typeof msg.content === "string" && msg.content) text = msg.content;
    return { thinking: thinking, text: text };
  }
  for (var i = 0; i < msg.content.length; i++) {
    var blk = msg.content[i];
    if (!blk) continue;
    if (blk.type === "thinking" && blk.thinking) thinking += blk.thinking;
    if (blk.type === "text" && blk.text) text += blk.text;
  }
  return { thinking: thinking, text: text };
}

// Incremental streaming renderer. Unlike replacing bd.innerHTML wholesale
// (which destroys the <details>/<summary> nodes so clicks land on elements
// that were just replaced and never fire, and also loses the open state),
// this keeps the thinking <summary> node stable and updates its body text in
// place — so the user can expand/collapse the running thinking panel while
// the answer is still streaming.
function renderStreamBody(bd, msg) {
  if (!bd || !msg) return;
  var parts = splitAssistantMessage(msg);
  var det = bd.querySelector(":scope > .thinking");
  if (parts.thinking) {
    if (!det) {
      det = document.createElement("details");
      det.className = "thinking";
      det.innerHTML = "<summary>" + THINKING_ICON + "思考过程" + THINKING_CARET + "</summary><div class='thinking-body'></div>";
      bd.insertBefore(det, bd.firstChild);
    }
    var tb = det.querySelector(".thinking-body");
    if (tb && tb.textContent !== parts.thinking) tb.textContent = parts.thinking;
  } else if (det) {
    det.remove();
  }
  var txt = bd.querySelector(":scope > .stream-text");
  var textHtml = parts.text ? md(parts.text) : "";
  if (parts.text) {
    if (!txt) {
      txt = document.createElement("div");
      txt.className = "stream-text";
      bd.appendChild(txt);
    }
    if (txt.innerHTML !== textHtml) txt.innerHTML = textHtml;
  } else if (txt) {
    txt.remove();
  }
  if (!bd.querySelector(":scope > .cursor")) {
    var cursor = document.createElement("span");
    cursor.className = "cursor";
    bd.appendChild(cursor);
  }
  if (streamThinkingOpen) {
    var t2 = bd.querySelector(".thinking");
    if (t2) t2.open = true;
  }
}

// Final (non-streaming) render for message_end: a one-shot full replace is
// fine here because no further deltas will rebuild the DOM.
function renderFinalBody(bd, html) {
  if (!bd) return;
  bd.innerHTML = html;
  if (streamThinkingOpen) {
    var t2 = bd.querySelector(".thinking");
    if (t2) t2.open = true;
  }
}

// Coalesce stream renders into one DOM update per tick: full body rebuilds on
// every delta both jank scrolling and replace the thinking <summary> node
// mid-gesture (so its click never fires). The incremental updater keeps the
// summary node stable so clicks work while streaming.
var streamRenderTimer = null;
var streamRenderMsg = null;

function flushStreamRender() {
  streamRenderTimer = null;
  if (!pendingAssistant) return;
  var bd = pendingAssistant.querySelector(".body");
  if (bd) renderStreamBody(bd, streamRenderMsg);
  scrollDown();
}

function scheduleStreamRender() {
  if (streamRenderTimer) return;
  streamRenderTimer = setTimeout(flushStreamRender, 16);
}

function cancelStreamRender() {
  if (streamRenderTimer) {
    clearTimeout(streamRenderTimer);
    streamRenderTimer = null;
  }
}

function bubble(cls, textOrHtml, isHtml, attachments, ts) {
  var el = document.createElement("div");
  el.className = "bubble " + cls;
  if (ts !== undefined && ts !== null && ts !== "") el.setAttribute("data-ts", String(ts));
  var body = document.createElement("div");
  body.className = "body";
  if (isHtml) body.innerHTML = textOrHtml;
  else body.textContent = textOrHtml;
  if (attachments && attachments.length) {
    var imgWrap = document.createElement("div");
    imgWrap.className = "attachments";
    var picCount = 0;
    for (var ai = 0; ai < attachments.length; ai++) {
      var att = attachments[ai];
      if (!att || att.kind !== "image" || !att.id) continue;
      var pic = document.createElement("img");
      pic.className = "att-img";
      pic.loading = "lazy";
      pic.alt = att.name || "image";
      pic.setAttribute("data-aid", att.id);
      if (currentWorkId) {
        pic.setAttribute("data-work", currentWorkId);
        pic.src = attImgUrl(currentWorkId, att.id);
        if (!attachmentTicket) {
          (function (el) {
            refreshAttachmentTicket().then(function () { paintAttachmentImages(el.parentElement || document); });
          })(pic);
        }
      }
      pic.addEventListener("error", function () { retryAttachmentImage(pic); });
      imgWrap.appendChild(pic);
      picCount++;
    }
    if (imgWrap.childNodes.length) {
      imgWrap.className = "attachments n" + (picCount > 3 ? 3 : picCount);
      el.appendChild(imgWrap);
    }
  }
  var copyBtn = document.createElement("button");
  copyBtn.className = "copy";
  copyBtn.title = "复制";
  if (cls === "user") {
    el._answerText = String(textOrHtml == null ? "" : textOrHtml).trim();
  }
  copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6.14929 4.02032C7.11197 4.02032 7.87983 4.02016 8.49597 4.07598C9.12128 4.13269 9.65792 4.25188 10.1415 4.53106C10.7202 4.8653 11.2008 5.3459 11.535 5.92462C11.8142 6.40818 11.9334 6.94481 11.9901 7.57012C12.0459 8.18625 12.0458 8.95419 12.0458 9.9168C12.0458 10.8795 12.0459 11.6473 11.9901 12.2635C11.9334 12.8888 11.8142 13.4254 11.535 13.909C11.2008 14.4877 10.7202 14.9683 10.1415 15.3025C9.65792 15.5817 9.12128 15.7009 8.49597 15.7576C7.87984 15.8134 7.11196 15.8133 6.14929 15.8133C5.18667 15.8133 4.41874 15.8134 3.80261 15.7576C3.1773 15.7009 2.64067 15.5817 2.1571 15.3025C1.5784 14.9683 1.09778 14.4877 0.76355 13.909C0.484366 13.4254 0.365184 12.8888 0.308472 12.2635C0.252649 11.6473 0.252808 10.8795 0.252808 9.9168C0.252808 8.95418 0.252664 8.18625 0.308472 7.57012C0.365184 6.94481 0.484366 6.40818 0.76355 5.92462C1.09777 5.34589 1.57839 4.86529 2.1571 4.53106C2.64067 4.25188 3.1773 4.13269 3.80261 4.07598C4.41874 4.02017 5.18666 4.02032 6.14929 4.02032ZM6.14929 5.37774C5.16181 5.37774 4.46634 5.37761 3.92566 5.42657C3.39434 5.47472 3.07859 5.56574 2.83582 5.70587C2.4632 5.92106 2.15354 6.2307 1.93835 6.60333C1.79823 6.8461 1.70721 7.16185 1.65906 7.69317C1.6101 8.23385 1.61023 8.92933 1.61023 9.9168C1.61023 10.9043 1.61009 11.5998 1.65906 12.1404C1.70721 12.6717 1.79823 12.9875 1.93835 13.2303C2.15356 13.6029 2.46321 13.9126 2.83582 14.1277C3.07859 14.2679 3.39434 14.3589 3.92566 14.407C4.46634 14.456 5.16182 14.4559 6.14929 14.4559C7.13682 14.4559 7.83224 14.456 8.37292 14.407C8.90425 14.3589 9.21999 14.2679 9.46277 14.1277C9.83535 13.9126 10.145 13.6029 10.3602 13.2303C10.5004 12.9875 10.5914 12.6717 10.6395 12.1404C10.6885 11.5998 10.6884 10.9043 10.6884 9.9168C10.6884 8.92934 10.6885 8.23384 10.6395 7.69317C10.5914 7.16185 10.5004 6.8461 10.3602 6.60333C10.1451 6.23071 9.83536 5.92107 9.46277 5.70587C9.21999 5.56574 8.90424 5.47472 8.37292 5.42657C7.83224 5.3776 7.13682 5.37774 6.14929 5.37774ZM9.80164 0.367975C10.7638 0.367975 11.5314 0.36788 12.1473 0.423639C12.7726 0.480307 13.3093 0.598759 13.7928 0.877741C14.3717 1.21192 14.8521 1.69355 15.1864 2.27227C15.4655 2.75574 15.5857 3.29164 15.6425 3.9168C15.6983 4.53301 15.6971 5.3016 15.6971 6.26446V7.82989C15.6971 8.29264 15.6989 8.58993 15.6649 8.84844C15.4668 10.3525 14.401 11.5738 12.9833 11.9988V10.5467C13.6973 10.1903 14.2105 9.49662 14.3192 8.67169C14.3387 8.52347 14.3407 8.3358 14.3407 7.82989V6.26446C14.3407 5.27706 14.3398 4.58149 14.2909 4.04083C14.2428 3.50968 14.1526 3.19372 14.0126 2.95098C13.7974 2.57849 13.4876 2.26869 13.1151 2.05352C12.8724 1.91347 12.5564 1.82237 12.0253 1.77423C11.4847 1.72528 10.7888 1.7254 9.80164 1.7254H7.71472C6.7562 1.72558 5.92665 2.27697 5.52332 3.07891H4.07019C4.54221 1.51132 5.9932 0.368186 7.71472 0.367975H9.80164Z" fill="currentColor"></path></svg>';
  el.appendChild(body);
  if (cls.indexOf("assistant") === 0) el._copyBtn = copyBtn;
  if (currentRunId) el.setAttribute("data-run", currentRunId);
  convInner.appendChild(el);
  if (cls === "user") {
    var actionBar = document.createElement("div");
    actionBar.className = "user-actions";
    var revertBtn = document.createElement("button");
    revertBtn.className = "copy revert";
    revertBtn.title = "回退到这里（只回退对话，文件不动）";
    revertBtn.textContent = "↩";
    revertBtn._host = el;
    copyBtn.classList.add("user-copy");
    copyBtn._host = el;
    if (currentRunId) {
      actionBar.setAttribute("data-run", currentRunId);
      revertBtn.setAttribute("data-run", currentRunId);
      copyBtn.setAttribute("data-run", currentRunId);
    }
    actionBar.appendChild(revertBtn);
    actionBar.appendChild(copyBtn);
    el._actionBar = actionBar;
    convInner.appendChild(actionBar);
  }
  if (cls === "user") navRender();
  scrollDown();
  return el;
}

// Out-of-band status line (turn-budget renewal / hard cap). Rendered as a
// neutral notice instead of a fake user bubble, and stripped before the
// conversation is persisted so a refresh cannot resurrect a stale one.
function addNotice(text, level) {
  var emptyEl = conversation.querySelector(".empty-card");
  if (emptyEl) emptyEl.remove();
  var el = document.createElement("div");
  el.className = "sys-notice" + (level === "warn" ? " warn" : "");
  el.textContent = String(text || "");
  convInner.appendChild(el);
  stickToBottom = true;
  scrollDown();
  scheduleSave();
}

function setStatus(mode) {
  statusDot.className = "dot " + mode;
  progressEl.hidden = mode !== "busy";
  isBusy = mode === "busy";
  applySendMode();
  updateSendState();
}

// ---- theme ----
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  themeBtn.textContent = t === "dark" ? "浅色" : "深色";
  try { localStorage.setItem("tju.gui.theme", t); } catch (e) {}
}
function initTheme() {
  var saved = null;
  try { saved = localStorage.getItem("tju.gui.theme"); } catch (e) {}
  var dark = saved === "dark" || (saved === null && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  applyTheme(dark ? "dark" : "light");
}
themeBtn.addEventListener("click", function () {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});
initTheme();

// ---- tab switch (对话 / 轨迹) ----
var tabChatBtn = document.getElementById("tab-chat-btn");
var tabTrajBtn = document.getElementById("tab-traj-btn");
var tabChat = document.getElementById("tab-chat");
var tabTraj = document.getElementById("tab-trajectory");
function switchTab(name) {
  var chat = name === "chat";
  tabChat.hidden = !chat;
  tabTraj.hidden = chat;
  tabChatBtn.classList.toggle("active", chat);
  tabTrajBtn.classList.toggle("active", !chat);
  if (!chat && liveWs) redrawOverview(liveWs);
  else navRender();
}
tabChatBtn.addEventListener("click", function () { switchTab("chat"); });
tabTrajBtn.addEventListener("click", function () { switchTab("trajectory"); });
restoreTraj(liveWs);
document.getElementById("traj-live-head").addEventListener("click", function () {
  document.getElementById("traj-live").classList.toggle("open");
});
var modalOpen = false;
function showModal(opts) {
  var backdrop = document.getElementById("modal-backdrop");
  if (!backdrop) return;
  document.getElementById("modal-title").textContent = opts.title || "";
  document.getElementById("modal-text").textContent = opts.text || "";
  var okBtn = document.getElementById("modal-ok");
  var cancelBtn = document.getElementById("modal-cancel");
  var inputEl = document.getElementById("modal-input");
  okBtn.textContent = opts.okText || "确定";
  okBtn.className = "modal-btn" + (opts.primary ? " primary" : "") + (opts.danger ? " danger" : "");
  cancelBtn.hidden = !opts.showCancel;
  backdrop.classList.toggle("danger", !!opts.danger);
  // Optional text input (replaces the native window.prompt)
  inputEl.hidden = !opts.input;
  if (opts.input) {
    inputEl.value = opts.input.value != null ? String(opts.input.value) : "";
    inputEl.placeholder = opts.input.placeholder || "";
    inputEl.removeAttribute("aria-label");
    inputEl.setAttribute("aria-label", opts.input.label || opts.title || "输入");
  }
  function getValue() { return inputEl.hidden ? "" : inputEl.value.trim(); }
  function validate() {
    if (!opts.input || !opts.input.required) return true;
    var v = getValue();
    inputEl.classList.toggle("invalid", !v);
    return !!v;
  }
  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); close(false); }
    else if (e.key === "Enter" && !inputEl.hidden) { e.preventDefault(); confirm(); }
  }
  function close(confirm) {
    if (!modalOpen) return;
    modalOpen = false;
    backdrop.hidden = true;
    document.removeEventListener("keydown", onKey);
    inputEl.onkeydown = null;
    if (confirm && opts.onOk) opts.onOk(getValue());
    else if (!confirm && opts.onCancel) opts.onCancel();
  }
  function confirm() {
    if (!validate()) return;
    close(true);
  }
  okBtn.onclick = confirm;
  cancelBtn.onclick = function () { close(false); };
  backdrop.onclick = function (e) { if (e.target === backdrop) close(false); };
  document.addEventListener("keydown", onKey);
  modalOpen = true;
  backdrop.hidden = false;
  if (!inputEl.hidden) {
    inputEl.focus();
    var pre = opts.input.select !== false && opts.input.value != null ? String(opts.input.value) : "";
    if (pre) inputEl.setSelectionRange(0, pre.length);
    else if (opts.input.selectAll) inputEl.select();
  } else {
    (opts.showCancel ? cancelBtn : okBtn).focus();
  }
}
function showPrompt(opts) {
  showModal({
    title: opts.title,
    text: opts.text,
    okText: opts.okText || "确定",
    showCancel: true,
    primary: true,
    input: { value: opts.value, placeholder: opts.placeholder, required: opts.required !== false, selectAll: true },
    onOk: function (v) { if (v || opts.required === false) opts.onOk(v); },
    onCancel: opts.onCancel
  });
}
document.getElementById("traj-menu-delete").addEventListener("click", function () {
  var rid = trajMenuRunId;
  hideTrajMenu();
  if (!rid) return;
  showModal({
    title: "删除该 run",
    text: "确定删除该 run 吗？其轨迹与日志文件将一并删除，不可恢复。",
    okText: "删除",
    danger: true,
    showCancel: true,
    onOk: function () { deleteRun(rid); }
  });
});
document.getElementById("traj-menu-delete-earlier").addEventListener("click", function () {
  var rid = trajMenuRunId;
  hideTrajMenu();
  if (!rid) return;
  var older = runsOlderThan(rid);
  if (!older.length) {
    showModal({ title: "无可删除的轨迹", text: "该 run 之前没有更早的历史 run。", okText: "知道了" });
    return;
  }
  showModal({
    title: "删除更早的 run",
    text: "确定删除该 run 之前的 " + older.length + " 条轨迹吗？日志文件将一并删除，不可恢复。",
    okText: "删除",
    danger: true,
    showCancel: true,
    onOk: function () { runsDeleteRequest({ runIds: older }); }
  });
});
document.getElementById("traj-menu-retention").addEventListener("click", function () {
  hideTrajMenu();
  if (!trajRuns.length) {
    showModal({ title: "无可删除的轨迹", text: "暂无可清理的历史 run。", okText: "知道了" });
    return;
  }
  showModal({
    title: "清理历史轨迹",
    text: "确定删除 " + retentionDays + " 天前的全部轨迹吗？日志文件将一并删除，不可恢复。",
    okText: "清理",
    danger: true,
    showCancel: true,
    onOk: function () { runsDeleteRequest({ olderThanDays: retentionDays }); }
  });
});
document.getElementById("traj-menu-all").addEventListener("click", function () {
  hideTrajMenu();
  if (!trajRuns.length) {
    showModal({ title: "无可删除的轨迹", text: "暂无可清空的历史 run。", okText: "知道了" });
    return;
  }
  // Destructive and unbounded: require a typed confirmation, not just a click.
  confirmTyped("清空", {
    title: "清空全部历史 run",
    text: "将删除全部 " + trajRuns.length + " 条历史 run 的轨迹与日志文件，不可恢复。正在执行的 run 会保留。",
    okText: "全部删除",
    onOk: function () { runsDeleteRequest({ all: true }); }
  });
});
document.addEventListener("click", function () { hideTrajMenu(); });
document.addEventListener("contextmenu", function (e) {
  var t = e.target;
  while (t && !(t.classList && t.classList.contains("traj-run-head"))) t = t.parentElement;
  if (!t) hideTrajMenu();
});
document.addEventListener("keydown", function (e) { if (e.key === "Escape") hideTrajMenu(); });
document.getElementById("traj-menu").addEventListener("contextmenu", function (e) { e.preventDefault(); });

// ---- drawer ----
function setDrawer(open) {
  document.querySelector(".layout").classList.toggle("drawer-open", open);
}
menuBtn.addEventListener("click", function () { setDrawer(true); });
drawerBackdrop.addEventListener("click", function () { setDrawer(false); });

// ---- persistence ----
var saveTimer = null;
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveState, 400);
}
function saveState() {
  saveTimer = null;
  try {
    if (conversation.querySelectorAll(".bubble, .tool-block").length) {
      var clone = convInner.cloneNode(true);
      var notices = clone.querySelectorAll(".sys-notice");
      for (var nix = 0; nix < notices.length; nix++) notices[nix].remove();
      var savedImgs = clone.querySelectorAll("img.att-img");
      for (var six = 0; six < savedImgs.length; six++) savedImgs[six].removeAttribute("src");
      localStorage.setItem("tju.gui.conv", clone.innerHTML);
    } else {
      localStorage.removeItem("tju.gui.conv");
    }
    localStorage.setItem("tju.gui.model", modelLabel.textContent || "");
    localStorage.setItem("tju.gui.cum", JSON.stringify({ in: cumInput, cache: cumCache, total: cumTokens }));
  } catch (e) {}
}
function restoreState() {
  var conv = null, model = null, cum = null;
  try {
    conv = localStorage.getItem("tju.gui.conv");
    model = localStorage.getItem("tju.gui.model");
    var cs = localStorage.getItem("tju.gui.cum");
    if (cs) { try { cum = JSON.parse(cs); } catch (e) {} }
  } catch (e) {}
  if (conv) {
    if (emptyCard) emptyCard.remove();
    convInner.innerHTML = conv;
    settleTodoCards();
    stickToBottom = true;
    scrollDown();
    paintAttachmentImages(convInner);
    if (!attachmentTicket) {
      refreshAttachmentTicket().then(function () { paintAttachmentImages(convInner); });
    }
  }
  if (model) modelLabel.textContent = model;
  navRender();
  if (cum && typeof cum.in === "number") {
    cumInput = cum.in;
    cumCache = cum.cache || 0;
    cumTokens = cum.total || cum.in;
    updateChips();
  }
}

function revertToMessage(ts) {
  fetch("/api/revert", {
    method: "POST",
    headers: { "content-type": "application/json", "x-agent-token": AGENT_TOKEN },
    body: JSON.stringify({ timestamp: ts })
  })
    .then(function (r) { return r.json().then(function (data) { return { status: r.status, data: data }; }); })
    .then(function (ret) {
      if (ret.status === 409) {
        addNotice("任务执行中，请先停止后再回退。", "warn");
        return;
      }
      if (!ret.data || !ret.data.ok) {
        bubble("error", (ret.data && ret.data.error) || "回退失败");
        return;
      }
      renderConversation(ret.data.messages || []);
      if (ret.data.restored) {
        ta.value = ret.data.restored.text || "";
        pendingAttachments = (ret.data.restored.attachments || []).map(function (a) {
          return {
            file: null,
            url: attImgUrl(currentWorkId, a.id),
            uploaded: true,
            id: a.id,
            name: a.name || "image",
            mime: a.mime || "image/png",
            size: a.size || 0
          };
        });
        if (!attachmentTicket) {
          refreshAttachmentTicket().then(function () {
            for (var pi = 0; pi < pendingAttachments.length; pi++) {
              pendingAttachments[pi].url = attImgUrl(currentWorkId, pendingAttachments[pi].id);
            }
            renderAttachStrip();
          });
        }
        renderAttachStrip();
        ta.focus();
      }
      saveState();
      addNotice("已回退到该条消息，内容已放回输入框，可补充后重新发送（文件未改动）。", "info");
    })
    .catch(function (err) { bubble("error", "回退失败：" + String((err && err.message) || err)); });
}

// ---- delegated handlers ----
conversation.addEventListener("click", function (ev) {
  var target = ev.target;
  if (!target || !target.closest) return;
  // Manual thinking-panel toggle while streaming: the native <details> toggle
  // used to be unreliable when the stream view rebuilt its whole DOM (clicks
  // landed on nodes replaced mid-gesture). Now the stream view updates the
  // thinking panel in place (node stays stable), so this just records the
  // user's open/close choice and applies it directly.
  var thinkSum = target.closest(".thinking summary");
  if (thinkSum && pendingAssistant && pendingAssistant.contains(thinkSum)) {
    ev.preventDefault();
    var det = thinkSum.parentElement;
    if (det) {
      streamThinkingOpen = !det.open;
      det.open = streamThinkingOpen;
    }
    return;
  }
  var chip = target.closest(".chip");
  if (chip && chip.dataset && chip.dataset.quick) {
    ta.value = chip.dataset.quick;
    ta.focus();
    updateSendState();
    return;
  }
  var revertBtn = target.closest(".revert");
  if (revertBtn) {
    var rhost = revertBtn._host || revertBtn.parentElement;
    if (rhost && rhost.id === "conv-inner") rhost = revertBtn.previousElementSibling;
    if (rhost && rhost.classList && rhost.classList.contains("user-actions")) rhost = rhost.previousElementSibling;
    var rts = rhost && rhost.getAttribute ? Number(rhost.getAttribute("data-ts")) : NaN;
    if (rts !== rts) {
      bubble("error", "找不到该消息的时间戳，无法回退");
      return;
    }
    revertToMessage(rts);
    return;
  }
  var copyBtn = target.closest(".copy");
  if (copyBtn) {
    var host = copyBtn._host || copyBtn.parentElement;
    if (host && host.id === "conv-inner") host = copyBtn.previousElementSibling;
    if (host && host.classList && host.classList.contains("user-actions")) host = host.previousElementSibling;
    var bodyEl = host && host.querySelector ? host.querySelector(".body") : null;
    var copyText = "";
    if (host && host._answerText) copyText = host._answerText;
    else if (bodyEl) copyText = bodyEl.textContent.trim();
    if (copyText && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(copyText).then(function () { showCopyToast(copyBtn); }).catch(function () {});
    }
    return;
  }
  var attImg = target.closest ? target.closest("img.att-img") : null;
  if (attImg) {
    openImageViewer(attImg.currentSrc || attImg.src, attImg.alt);
    return;
  }
  var todoHead = target.closest(".todo-head");
  if (todoHead) {
    var todoCard = todoHead.parentElement;
    if (todoCard && todoCard.classList.contains("todo-card")) {
      todoCard.classList.toggle("collapsed");
    }
  }
});

var pendingAssistant = null;
var lastTool = null;
var todoLiveCard = null;
var runFirstUser = null;
var todoDock = document.getElementById("todo-dock");
if (todoDock) todoDock.addEventListener("click", function (ev) {
  var t = ev.target;
  if (!t || !t.closest) return;
  var h = t.closest(".todo-head");
  if (h && h.parentElement && h.parentElement.classList.contains("todo-card")) {
    h.parentElement.classList.toggle("collapsed");
  }
});
var toolSerial = 0;
var runStart = null;
var runTimer = null;
var runTools = 0;
var runTokensIn = 0;
var runTokensCache = 0;
var cumTokens = 0;
var cumInput = 0;
var cumCache = 0;

function updateChips() {
  statTotal.textContent = "词元数 " + fmtTokens(cumTokens);
  statCache.textContent = "缓存命中 " + (cumInput > 0 ? Math.round((cumCache / cumInput) * 100) + "%" : "-");
  statCacheRun.textContent = runTokensIn > 0 ? Math.round((runTokensCache / runTokensIn) * 100) + "%" : "-";
  statRun.textContent = fmtTokens(runTokensIn);
}
function tickTime() {
  if (runStart !== null) statTime.textContent = fmtDur(Date.now() - runStart);
}
function countUsage(usage) {
  if (!usage || !usage.input) return;
  cumInput += usage.input;
  cumCache += usage.cacheRead || 0;
  runTokensIn += usage.input;
  runTokensCache += usage.cacheRead || 0;
  cumTokens += usage.totalTokens || usage.input;
  updateChips();
}
function todoBrief(args) {
  var todos = args && Array.isArray(args.todos) ? args.todos : [];
  if (!todos.length) return "清空任务";
  var done = 0;
  for (var i = 0; i < todos.length; i++) if (todos[i] && normalizeTodoStatus(todos[i].status) === "completed") done++;
  return done + "/" + todos.length + " 完成";
}
function todoListText(args) {
  var todos = args && Array.isArray(args.todos) ? args.todos : [];
  if (!todos.length) return "（空任务清单）";
  var lines = [];
  for (var j = 0; j < todos.length; j++) {
    var t = todos[j];
    if (!t) continue;
    var st = normalizeTodoStatus(t.status);
    var mark = st === "completed" ? "[x]" : st === "active" ? "[~]" : "[ ]";
    lines.push("- " + mark + " " + (t.content || "") + (t.priority ? " (" + t.priority + ")" : ""));
  }
  return lines.join("\\n");
}
function todoTodos(args) {
  return args && Array.isArray(args.todos) ? args.todos : [];
}
function normalizeTodoStatus(s) {
  if (typeof s !== "string") return "pending";
  var v = s.toLowerCase();
  if (v === "completed" || v === "complete" || v === "done" || v === "finished") return "completed";
  if (v === "active" || v === "in_progress" || v === "in progress" || v === "doing" || v === "working") return "active";
  return "pending";
}
function paintTodoCard(card, todos) {
  var done = 0;
  var i = 0;
  for (i = 0; i < todos.length; i++) if (todos[i] && normalizeTodoStatus(todos[i].status) === "completed") done++;
  var count = card.querySelector(".todo-count");
  if (count) count.textContent = todos.length ? done + "/" + todos.length + " 完成" : "空清单";
  var bar = card.querySelector(".todo-bar > i");
  if (bar) bar.style.width = todos.length ? Math.round(done / todos.length * 100) + "%" : "0%";
  var title = card.querySelector(".todo-title");
  var cur = null;
  for (i = 0; i < todos.length; i++) {
    if (todos[i] && normalizeTodoStatus(todos[i].status) === "active") { cur = todos[i]; break; }
  }
  if (title) title.textContent = cur && cur.content ? "任务清单 · 正在：" + cur.content : "任务清单";
  var ul = card.querySelector(".todo-list");
  ul.replaceChildren();
  for (i = 0; i < todos.length; i++) {
    var t = todos[i] || {};
    var nst = normalizeTodoStatus(t.status);
    var st = nst === "completed" ? "done" : nst === "active" ? "active" : "pending";
    var li = document.createElement("li");
    li.className = "todo-" + st;
    var mk = document.createElement("span");
    mk.className = "todo-mark";
    mk.textContent = st === "done" ? "✓" : st === "active" ? "▶" : "○";
    li.appendChild(mk);
    var tx = document.createElement("span");
    tx.className = "todo-text";
    tx.textContent = t.content || "";
    li.appendChild(tx);
    if (t.priority) {
      var pr = document.createElement("span");
      pr.className = "todo-pri";
      pr.textContent = t.priority;
      li.appendChild(pr);
    }
    ul.appendChild(li);
  }
  if (!todos.length) {
    var li0 = document.createElement("li");
    li0.className = "todo-pending";
    var tx0 = document.createElement("span");
    tx0.className = "todo-text";
    tx0.textContent = "（空任务清单）";
    li0.appendChild(tx0);
    ul.appendChild(li0);
  }
  var act = ul.querySelector("li.todo-active");
  if (act && ul.scrollHeight > ul.clientHeight + 1) {
    var r = act.getBoundingClientRect();
    var c = ul.getBoundingClientRect();
    if (r.top < c.top) ul.scrollTop += r.top - c.top;
    else if (r.bottom > c.bottom) ul.scrollTop += r.bottom - c.bottom;
  }
}
function makeTodoCard(live) {
  var card = document.createElement("div");
  card.className = "todo-card" + (live ? " live" : " done collapsed");
  var head = document.createElement("div");
  head.className = "todo-head";
  var badge = document.createElement("span");
  badge.className = "todo-badge " + (live ? "running" : "ok");
  badge.textContent = live ? "进行中" : "已完成";
  var title = document.createElement("span");
  title.className = "todo-title";
  title.textContent = "任务清单";
  var count = document.createElement("span");
  count.className = "todo-count";
  var caret = document.createElement("span");
  caret.className = "caret";
  caret.textContent = "›";
  head.appendChild(badge);
  head.appendChild(title);
  head.appendChild(count);
  head.appendChild(caret);
  var body = document.createElement("div");
  body.className = "todo-body";
  var bar = document.createElement("div");
  bar.className = "todo-bar";
  bar.appendChild(document.createElement("i"));
  var ul = document.createElement("ul");
  ul.className = "todo-list";
  body.appendChild(bar);
  body.appendChild(ul);
  card.appendChild(head);
  card.appendChild(body);
  if (typeof currentRunId !== "undefined" && currentRunId) card.setAttribute("data-run", currentRunId);
  return card;
}
function anchorTodoCard(card) {
  var anchor = (runFirstUser && runFirstUser.isConnected) ? runFirstUser : null;
  if (!anchor) {
    var users = convInner.querySelectorAll(".bubble.user");
    anchor = users.length ? users[users.length - 1] : null;
  }
  var refNode = anchor ? anchor.nextSibling : null;
  while (refNode && refNode.classList && (refNode.classList.contains("user-actions") || refNode.classList.contains("user-copy"))) refNode = refNode.nextSibling;
  convInner.insertBefore(card, refNode);
}
function finalizeTodoCard() {
  if (!todoLiveCard) return;
  var card = todoLiveCard;
  todoLiveCard = null;
  card.classList.remove("live");
  card.classList.add("done", "collapsed");
  var badge = card.querySelector(".todo-badge");
  if (badge) { badge.className = "todo-badge ok"; badge.textContent = "已完成"; }
  var bar = card.querySelector(".todo-bar > i");
  if (bar) bar.style.background = "var(--ok)";
  anchorTodoCard(card);
  if (todoDock) todoDock.hidden = true;
}
function settleTodoCards() {
  var stale = convInner.querySelectorAll(".todo-card.live");
  for (var i = 0; i < stale.length; i++) {
    todoLiveCard = stale[i];
    finalizeTodoCard();
  }
}
function argBrief(args) {
  if (!args) return "";
  if (typeof args.url === "string") return args.url;
  if (typeof args.path === "string") return args.path;
  if (typeof args.command === "string") {
    var c = args.command;
    return c.length > 60 ? c.slice(0, 60) + "..." : c;
  }
  if (typeof args.task === "string") {
    var t = args.task;
    return t.length > 60 ? t.slice(0, 60) + "..." : t;
  }
  if (Array.isArray(args.todos)) return todoBrief(args);
  return "";
}

function handleLiveEvent(e) {
  switch (e.type) {
    case "agent_start":
      setStatus("busy");
      runFirstUser = null;
      finalizeTodoCard();
      runStart = Date.now();
      runTools = 0;
      runTokensIn = 0;
      runTokensCache = 0;
      statTools.textContent = "0";
      statTime.textContent = "0s";
      statCacheRun.textContent = "-";
      statRun.textContent = "0";
      if (runTimer) clearInterval(runTimer);
      runTimer = setInterval(tickTime, 1000);
      resetTrajectory(liveWs);
      if (liveWs.metaEl) liveWs.metaEl.textContent = "执行中…";
      loadRuns();
      break;
    case "agent_end":
      if (runTimer) clearInterval(runTimer);
      runTimer = null;
      if (runStart !== null) statTime.textContent = fmtDur(Date.now() - runStart);
      runStart = null;
      setStatus("idle");
      pendingAssistant = null;
      finalizeTodoCard();
      scheduleSave();
      saveTraj(liveWs);
      if (liveWs.metaEl) liveWs.metaEl.textContent = "已完成";
      clearSteerChips();
      loadRuns();
      break;
    case "notice":
      addNotice(e.message, e.level);
      break;
    case "message_start": {
      var emptyEl = conversation.querySelector(".empty-card");
      if (emptyEl) emptyEl.remove();
      if (e.message.role === "assistant") {
        cancelStreamRender();
        streamThinkingOpen = null;
        pendingAssistant = bubble("assistant", renderAssistant(e.message), true);
        trajMessageStart(liveWs, e.message);
      } else if (e.message.role === "user") {
        var nub = bubble("user", e.message.content, false, e.message.attachments, e.message.timestamp);
        if (!runFirstUser || !runFirstUser.isConnected) runFirstUser = nub;
        trajUserStart(liveWs, e.message);
      }
      scheduleSave();
      break;
    }
case "message_update":
      if (pendingAssistant && e.message.role === "assistant") {
        streamRenderMsg = e.message;
        scheduleStreamRender();
      }
      trajMessageUpdate(liveWs, e.message);
      scrollDown();
      break;
    case "message_end":
      if (pendingAssistant && e.message.role === "assistant") {
        cancelStreamRender();
        streamRenderMsg = null;
        var bodyEl = pendingAssistant.querySelector(".body");
        renderFinalBody(bodyEl, renderAssistant(e.message));
        var answerText = assistantAnswerText(e.message).trim();
        if (pendingAssistant._copyBtn && bodyEl && answerText) {
          pendingAssistant._answerText = answerText;
          pendingAssistant.appendChild(pendingAssistant._copyBtn);
          pendingAssistant._copyBtn = null;
        }
      }
      scrollDown();
      if (e.message.role === "assistant") {
        countUsage(e.message.usage);
        if (liveWs.currentTurn && e.message.usage && typeof e.message.usage.input === "number") {
          liveWs.currentTurn.tokensIn += e.message.usage.input;
          updateTurnHeader(liveWs.currentTurn);
        }
        if (e.message.stopReason === "error") {
          bubble("error", e.message.errorMessage || "assistant error");
        }
      }
      trajMessageEnd(liveWs, e.message);
      scheduleSave();
      break;
    case "tool_start": {
      runTools++;
      statTools.textContent = String(runTools);
      toolSerial++;
      if (!liveWs.currentTurn) createTurn(liveWs);
      addToolToTurn(liveWs, liveWs.currentTurn, e);
      if (e.toolName === "todowrite") {
        lastTool = null;
        var todos = todoTodos(e.args);
        if (!todoLiveCard || !todoLiveCard.isConnected) {
          finalizeTodoCard();
          todoLiveCard = makeTodoCard(true);
          if (todoDock) {
            todoDock.appendChild(todoLiveCard);
            todoDock.hidden = false;
          } else {
            anchorTodoCard(todoLiveCard);
          }
        }
        paintTodoCard(todoLiveCard, todos);
        break;
      }
      var brief = argBrief(e.args);
      lastTool = document.createElement("details");
      lastTool.className = "tool-block";
      var sum = document.createElement("summary");
      var badge = document.createElement("span");
      badge.className = "badge running";
      badge.textContent = "运行中";
      var name = document.createElement("span");
      name.className = "name";
      name.textContent = "#" + toolSerial + " " + e.toolName;
      var bf = document.createElement("span");
      bf.className = "brief";
      bf.textContent = brief;
      sum.appendChild(badge);
      sum.appendChild(name);
      sum.appendChild(bf);
      lastTool.appendChild(sum);
      var pre = document.createElement("pre");
      if (e.toolName === "fetch") {
        pre.textContent = "【正在联网查询中】";
      } else {
        pre.textContent = "参数:\\n" + argsHtml(e.args) + "\\n运行中...";
      }
      lastTool.appendChild(pre);
      lastTool._t0 = Date.now();
      lastTool._tcid = e.toolCallId;
      lastTool._badge = badge;
      lastTool._brief = brief;
      lastTool._args = argsHtml(e.args);
      if (currentRunId) lastTool.setAttribute("data-run", currentRunId);
      convInner.appendChild(lastTool);
      scrollDown();
      break;
    }
    case "tool_update":
      if (lastTool && e.toolName !== "fetch" && e.toolName !== "todowrite") {
        lastTool.querySelector("pre").textContent = "参数:\\n" + lastTool._args + "\\n" + (e.partialContent || "");
        scrollDown();
      }
      break;
    case "tool_end":
      if (liveWs.currentTurn) {
        for (var ti = 0; ti < liveWs.currentTurn.records.length; ti++) {
          if (liveWs.currentTurn.records[ti].id === e.toolCallId) {
            var resBrief = "";
            var resFull = e.result && e.result.content ? String(e.result.content) : "";
            if (e.toolName === "fetch") {
              var fd2 = e.result && e.result.details;
              resBrief = "已获取" + (fd2 && fd2.status ? " HTTP " + fd2.status : "");
            } else if (e.result && e.result.content) {
              resBrief = briefText(e.result.content);
            }
            finishTool(liveWs, liveWs.currentTurn.records[ti], e.isError, resBrief, resFull);
            break;
          }
        }
      }
      if (lastTool && lastTool._tcid === e.toolCallId) {
        var dur = fmtDur(Date.now() - lastTool._t0);
        lastTool._badge.textContent = (e.isError ? "ERR " : "OK ") + dur;
        lastTool._badge.className = "badge " + (e.isError ? "err" : "ok");
        var txt;
        if (e.toolName === "fetch") {
          var fd = e.result && e.result.details;
          txt = "已获取页面内容" + (fd && fd.status ? " (HTTP " + fd.status + ")" : "") + (fd && fd.bytes ? ", " + fmtTokens(fd.bytes) + "B" : "");
          lastTool.open = true;
        } else {
          txt = (e.result && e.result.content) || "";
          if (txt.length > 2000) txt = txt.slice(0, 2000) + "...";
          if (e.isError) lastTool.open = true;
        }
        lastTool.querySelector("pre").textContent = txt;
        scrollDown();
        lastTool = null;
      }
      scheduleSave();
      break;
    case "turn_start":
      if (liveWs.turnFromUserPrompt) { liveWs.turnFromUserPrompt = false; } else { createTurn(liveWs); }
      // The server drains the steering queue right after turn_start, so any
      // chip still showing has just been delivered.
      clearSteerChips();
      break;
    case "turn_end":
      endTurn(liveWs);
      break;
    default:
      break;
  }
}

function applyModel() {
  var id = modelInput.value.trim();
  if (!id) return;
  fetch("/api/model", {
    method: "POST",
    headers: { "content-type": "application/json", "x-agent-token": AGENT_TOKEN },
    body: JSON.stringify({ model: id })
  }).then(function () {
    modelLabel.textContent = modelApi + " / " + id;
    modelLabel.hidden = false;
    modelInput.hidden = true;
    scheduleSave();
  });
}
modelLabel.addEventListener("click", function () {
  modelLabel.hidden = true;
  modelInput.hidden = false;
  var cur = String(modelLabel.textContent || "").split("/");
  modelInput.value = (cur.length ? cur[cur.length - 1] : "").trim();
  modelInput.focus();
  modelInput.select();
});
modelInput.addEventListener("keydown", function (ev) {
  if (ev.key === "Enter") { ev.preventDefault(); applyModel(); }
  else if (ev.key === "Escape") { modelInput.hidden = true; modelLabel.hidden = false; }
});
modelInput.addEventListener("blur", function () {
  modelInput.hidden = true;
  modelLabel.hidden = false;
});

var EFFORT_ALIASES = { none: "none", minimal: "low", low: "low", medium: "high", high: "high", xhigh: "high", max: "max", ultra: "max" };
function normalizeEffort(value) {
  return (typeof value === "string" && EFFORT_ALIASES[value.toLowerCase().trim()]) || "";
}
var currentEffort = normalizeEffort(localStorage.getItem("tju.gui.effort")) || "high";
var effortSeg = document.getElementById("effort-seg");
function renderEffort() {
  var opts = effortSeg.querySelectorAll(".effort-opt");
  for (var i = 0; i < opts.length; i++) {
    opts[i].classList.toggle("active", opts[i].dataset.effort === currentEffort);
  }
}
effortSeg.addEventListener("click", function (ev) {
  var btn = ev.target.closest(".effort-opt");
  if (!btn || btn.dataset.effort === currentEffort) return;
  var next = btn.dataset.effort;
  fetch("/api/reasoning", {
    method: "POST",
    headers: { "content-type": "application/json", "x-agent-token": AGENT_TOKEN },
    body: JSON.stringify({ effort: next })
  }).then(function (r) {
    if (!r.ok) return;
    currentEffort = next;
    localStorage.setItem("tju.gui.effort", currentEffort);
    renderEffort();
  });
});
renderEffort();

var enterToSend = false;
try { enterToSend = localStorage.getItem("tju.gui.enterSend") === "1"; } catch (e) {}
function applySendMode() {
  optEnterSend.checked = enterToSend;
  if (isBusy) {
    ta.placeholder = "补充引导：Enter 注入（AI 将在下一步收到），Shift+Enter 换行...";
  } else {
    ta.placeholder = enterToSend
      ? "输入消息，按 Enter 发送，Shift+Enter 换行..."
      : "输入消息，按 Ctrl/Cmd+Enter 发送...";
  }
}
function openSettings() {
  applySendMode();
  switchSettingsTab("general");
  settingsBackdrop.hidden = false;
  optEnterSend.focus();
}
function closeSettings() {
  closeProviderForm();
  switchSettingsTab("general");
  settingsBackdrop.hidden = true;
}
settingsBtn.addEventListener("click", openSettings);
settingsClose.addEventListener("click", closeSettings);
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape" && !settingsBackdrop.hidden) closeSettings();
});
optEnterSend.addEventListener("change", function () {
  enterToSend = !!optEnterSend.checked;
  try { localStorage.setItem("tju.gui.enterSend", enterToSend ? "1" : "0"); } catch (e) {}
  applySendMode();
  ta.focus();
});
applySendMode();

// ---- settings tabs (通用 / 接口 / 更新) + self update ----
var settingsTabGeneral = document.getElementById("settings-tab-general");
var settingsTabUpdate = document.getElementById("settings-tab-update");
var settingsTabProviders = document.getElementById("settings-tab-providers");
var settingsPaneGeneral = document.getElementById("settings-pane-general");
var settingsPaneUpdate = document.getElementById("settings-pane-update");
var settingsPaneProviders = document.getElementById("settings-pane-providers");
var updateVer = document.getElementById("update-ver");
var updateStatus = document.getElementById("update-status");
var btnUpdateCheck = document.getElementById("btn-update-check");
var btnUpdateApply = document.getElementById("btn-update-apply");
var btnUpdateRollback = document.getElementById("btn-update-rollback");
var btnUpdateRestart = document.getElementById("btn-update-restart");
var btnUpdateReload = document.getElementById("btn-update-reload");
var updateApiHeaders = { "x-agent-token": AGENT_TOKEN };
var dataRootPath = document.getElementById("data-root-path");
var dataRootMode = document.getElementById("data-root-mode");
var providerHelpDataDir = document.getElementById("provider-help-data-dir");
function loadDataRoot() {
  fetch("/api/version", { headers: updateApiHeaders })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d || !d.dataRoot) return;
      if (dataRootPath) dataRootPath.textContent = d.dataRoot;
      if (dataRootMode) {
        dataRootMode.textContent = d.dataRootSource === "portable" ? "便携" : d.dataRootSource === "env" ? "自定义" : "本机";
      }
      if (providerHelpDataDir) providerHelpDataDir.textContent = d.dataRoot;
    })
    .catch(function () { if (dataRootPath) dataRootPath.textContent = "读取失败"; });
}
function setUpdateStatus(t) { if (updateStatus) updateStatus.textContent = t; }
function switchSettingsTab(name) {
  settingsTabGeneral.classList.toggle("active", name === "general");
  settingsTabUpdate.classList.toggle("active", name === "update");
  settingsTabProviders.classList.toggle("active", name === "providers");
  settingsPaneGeneral.hidden = name !== "general";
  settingsPaneUpdate.hidden = name !== "update";
  settingsPaneProviders.hidden = name !== "providers";
  if (name === "update") loadUpdateVersion();
  if (name === "providers") loadProviders();
}
settingsTabGeneral.addEventListener("click", function () { switchSettingsTab("general"); });
settingsTabUpdate.addEventListener("click", function () { switchSettingsTab("update"); });
settingsTabProviders.addEventListener("click", function () { switchSettingsTab("providers"); });
function loadUpdateVersion() {
  btnUpdateCheck.hidden = false;
  btnUpdateCheck.disabled = false;
  btnUpdateCheck.textContent = "检查更新";
  btnUpdateApply.hidden = true;
  btnUpdateApply.disabled = false;
  btnUpdateApply.textContent = "立即更新";
  btnUpdateRestart.hidden = true;
  btnUpdateRestart.disabled = false;
  btnUpdateRestart.textContent = "重启服务";
  btnUpdateReload.hidden = true;
  btnUpdateRollback.disabled = false;
  btnUpdateRollback.textContent = "回滚上一版";
  fetch("/api/version", { headers: updateApiHeaders })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d) return;
      updateVer.textContent = "v" + (d.version || "?");
      btnUpdateRollback.hidden = !d.hasBackup;
      if (d.pendingRestart) {
        btnUpdateCheck.hidden = true;
        btnUpdateApply.hidden = true;
        btnUpdateRollback.hidden = true;
        btnUpdateReload.hidden = true;
        btnUpdateRestart.hidden = false;
        setUpdateStatus("新版本已就绪，重启后生效（当前仍在运行旧版本）");
        return;
      }
      if (!d.updateUrl) setUpdateStatus("未配置更新源（TJU_UPDATE_URL / --update-url），请先配置再检查更新");
    })
    .catch(function () { setUpdateStatus("版本信息读取失败"); });
}
btnUpdateCheck.addEventListener("click", function () {
  btnUpdateCheck.disabled = true;
  btnUpdateCheck.textContent = "检查中…";
  btnUpdateApply.hidden = true;
  btnUpdateRestart.hidden = true;
  btnUpdateReload.hidden = true;
  setUpdateStatus("正在检查更新…");
  fetch("/api/update/check", { headers: updateApiHeaders })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      btnUpdateCheck.disabled = false;
      btnUpdateCheck.textContent = "检查更新";
      if (!d) { setUpdateStatus("检查失败"); return; }
      if (d.error) { setUpdateStatus(d.error); return; }
      if (d.available) {
        setUpdateStatus("发现新版本 v" + d.latest + "（当前 v" + d.current + "），点击立即更新");
        btnUpdateApply.hidden = false;
      } else {
        setUpdateStatus("已是最新版本（v" + (d.latest || d.current) + "）");
      }
    })
    .catch(function (err) {
      btnUpdateCheck.disabled = false;
      btnUpdateCheck.textContent = "检查更新";
      setUpdateStatus("检查失败：" + String((err && err.message) || err));
    });
});
function updateNeedRestart(version) {
  btnUpdateCheck.hidden = true;
  btnUpdateApply.hidden = true;
  btnUpdateRollback.hidden = true;
  btnUpdateReload.hidden = true;
  btnUpdateRestart.hidden = false;
  setUpdateStatus("新版本" + (version ? " v" + version : "") + "已下载替换，重启后生效（当前仍在运行旧版本）");
}
function updateRestarting(version) {
  btnUpdateCheck.hidden = true;
  btnUpdateApply.hidden = true;
  btnUpdateRollback.hidden = true;
  btnUpdateRestart.hidden = true;
  btnUpdateReload.hidden = false;
  setUpdateStatus("已开始更新" + (version ? "到 v" + version : "") + "，服务正在重启，稍后请刷新页面");
}
btnUpdateApply.addEventListener("click", function () {
  btnUpdateApply.disabled = true;
  btnUpdateApply.textContent = "更新中…";
  setUpdateStatus("正在下载新版本…");
  fetch("/api/update/apply", { method: "POST", headers: updateApiHeaders })
    .then(function (r) { return r.json().then(function (d) { return { status: r.status, body: d }; }); })
    .then(function (x) {
      if (x.body && x.body.ok) { updateNeedRestart(x.body.version); return; }
      btnUpdateApply.disabled = false;
      btnUpdateApply.textContent = "立即更新";
      if (x.status === 409) { setUpdateStatus((x.body && x.body.error) || "任务执行中，请稍后再试"); return; }
      setUpdateStatus((x.body && (x.body.error || x.body.message)) || "更新失败");
    })
    .catch(function (err) {
      btnUpdateApply.disabled = false;
      btnUpdateApply.textContent = "立即更新";
      setUpdateStatus("更新失败：" + String((err && err.message) || err));
    });
});
btnUpdateRestart.addEventListener("click", function () {
  btnUpdateRestart.disabled = true;
  btnUpdateRestart.textContent = "重启中…";
  setUpdateStatus("正在重启服务…");
  fetch("/api/update/restart", { method: "POST", headers: updateApiHeaders })
    .then(function (r) { return r.json().then(function (d) { return { status: r.status, body: d }; }); })
    .then(function (x) {
      if (x.body && x.body.ok) { updateRestarting(null); return; }
      btnUpdateRestart.disabled = false;
      btnUpdateRestart.textContent = "重启服务";
      if (x.status === 409) { setUpdateStatus((x.body && x.body.error) || "任务执行中，请稍后再试"); return; }
      setUpdateStatus((x.body && x.body.error) || "重启失败");
    })
    .catch(function (err) {
      btnUpdateRestart.disabled = false;
      btnUpdateRestart.textContent = "重启服务";
      setUpdateStatus("重启失败：" + String((err && err.message) || err));
    });
});
btnUpdateRollback.addEventListener("click", function () {
  showModal({
    title: "回滚上一版",
    text: "确定回滚到上一版吗？文件替换后需要手动点“重启服务”生效。",
    okText: "回滚",
    danger: true,
    showCancel: true,
    onOk: function () {
      btnUpdateRollback.disabled = true;
      btnUpdateRollback.textContent = "回滚中…";
      setUpdateStatus("正在回滚…");
      fetch("/api/update/rollback", { method: "POST", headers: updateApiHeaders })
        .then(function (r) { return r.json().then(function (d) { return { status: r.status, body: d }; }); })
        .then(function (x) {
          if (x.body && x.body.ok) { updateNeedRestart(null); return; }
          btnUpdateRollback.disabled = false;
          btnUpdateRollback.textContent = "回滚上一版";
          if (x.status === 409) { setUpdateStatus((x.body && x.body.error) || "任务执行中，请稍后再试"); return; }
          setUpdateStatus((x.body && x.body.error) || "回滚失败");
        })
        .catch(function (err) {
          btnUpdateRollback.disabled = false;
          btnUpdateRollback.textContent = "回滚上一版";
          setUpdateStatus("回滚失败：" + String((err && err.message) || err));
        });
    }
  });
});
btnUpdateReload.addEventListener("click", function () { location.reload(); });
applySendMode();

// ---- provider interfaces (设置 → 接口) ----
var providerListEl = document.getElementById("provider-list");
var providerFormEl = document.getElementById("provider-form");
var providerHelpEl = document.getElementById("provider-help");
var providerFormTitle = document.getElementById("provider-form-title");
var providerFormStatus = document.getElementById("provider-form-status");
var providerFId = document.getElementById("provider-f-id");
var providerFLabel = document.getElementById("provider-f-label");
var providerFBaseUrl = document.getElementById("provider-f-baseUrl");
var providerFModel = document.getElementById("provider-f-model");
var providerFKeyEnv = document.getElementById("provider-f-keyEnv");
var providerFKey = document.getElementById("provider-f-key");
var providerFTest = document.getElementById("provider-f-test");
var providerFSave = document.getElementById("provider-f-save");
var providerFCancel = document.getElementById("provider-f-cancel");
var btnProviderAdd = document.getElementById("btn-provider-add");
var providerCurrentEl = document.getElementById("provider-current");
var providerCurrentDetail = document.getElementById("provider-current-detail");
var providerSelect = document.getElementById("provider-select");
var providerApiBtns = document.querySelectorAll(".provider-api-btn");
var providerState = { entries: [], current: { entryId: null, modelId: "" }, warnings: [] };
var providerEditing = null;
var providerFormApi = "openai-completions";
var providerHintShown = false;

function providerApiLabel(api) { return api === "anthropic-messages" ? "Anthropic" : "OpenAI 兼容"; }

function providerEntryById(id) {
  for (var i = 0; i < providerState.entries.length; i++) {
    if (providerState.entries[i].id === id) return providerState.entries[i];
  }
  return null;
}

function providerHasAnyKey() {
  for (var i = 0; i < providerState.entries.length; i++) {
    if (providerState.entries[i].hasKey) return true;
  }
  return false;
}

function setProviderFormStatus(text, kind) {
  providerFormStatus.textContent = text || "";
  providerFormStatus.classList.toggle("err", kind === "err");
  providerFormStatus.classList.toggle("ok", kind === "ok");
}

function renderProviderApiButtons() {
  for (var i = 0; i < providerApiBtns.length; i++) {
    providerApiBtns[i].classList.toggle("active", providerApiBtns[i].dataset.api === providerFormApi);
  }
}

function providerActionBtn(text, kind, onClick) {
  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "modal-btn" + (kind ? " " + kind : "");
  btn.textContent = text;
  btn.addEventListener("click", onClick);
  return btn;
}

function buildProviderItem(item) {
  var row = document.createElement("div");
  row.className = "provider-item" + (item.id === providerState.current.entryId ? " current" : "");
  var body = document.createElement("div");
  body.className = "provider-item-body";
  var title = document.createElement("div");
  title.className = "provider-item-title";
  var name = document.createElement("span");
  name.textContent = item.label || item.id;
  title.appendChild(name);
  var idEl = document.createElement("span");
  idEl.className = "provider-item-id";
  idEl.textContent = item.id;
  title.appendChild(idEl);
  var srcTag = document.createElement("span");
  srcTag.className = "provider-tag";
  srcTag.textContent = item.source === "user" ? "自定义" : "内置";
  title.appendChild(srcTag);
  var keyTag = document.createElement("span");
  keyTag.className = "provider-tag " + (item.hasKey ? "ok" : "warn");
  keyTag.textContent = item.hasKey ? "key 已配置" : "未配置 key";
  title.appendChild(keyTag);
  body.appendChild(title);
  var meta = document.createElement("div");
  meta.className = "provider-item-meta";
  meta.textContent = providerApiLabel(item.api) + " · " + (item.baseUrl || "-") + " · 默认模型 " + (item.defaultModel || "-");
  body.appendChild(meta);
  row.appendChild(body);
  var acts = document.createElement("div");
  acts.className = "provider-item-actions";
  if (item.id !== providerState.current.entryId) {
    acts.appendChild(providerActionBtn("使用", "primary", function () { useProvider(item.id); }));
  }
  acts.appendChild(providerActionBtn("编辑", "", function () { openProviderForm(item); }));
  if (item.source === "user") {
    acts.appendChild(providerActionBtn("删除", "danger", function () { confirmDeleteProvider(item); }));
  }
  row.appendChild(acts);
  return row;
}

function renderProviderCurrent() {
  var found = providerEntryById(providerState.current.entryId);
  if (!found) {
    providerCurrentEl.textContent = providerState.current.entryId || "未选择";
    providerCurrentDetail.textContent = "未选择可用的接口，请到“接口”页添加";
    return;
  }
  providerCurrentEl.textContent = found.label || found.id;
  providerCurrentDetail.textContent = providerApiLabel(found.api) + " · " + (found.baseUrl || "-") + " · "
    + (providerState.current.modelId || found.defaultModel)
    + (found.hasKey ? "" : "（未配置 key，无法调用）");
}

function renderProviderSelect() {
  providerSelect.replaceChildren();
  if (!providerState.current.entryId) {
    var placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "选择接口…";
    providerSelect.appendChild(placeholder);
  }
  for (var i = 0; i < providerState.entries.length; i++) {
    var item = providerState.entries[i];
    var opt = document.createElement("option");
    opt.value = item.id;
    var optModel = (item.id === providerState.current.entryId && providerState.current.modelId)
      ? providerState.current.modelId
      : (item.defaultModel || "");
    var optLabel = item.label || item.id;
    if (optModel && optLabel.indexOf(optModel) === -1) optLabel += " · " + optModel;
    if (!item.hasKey) optLabel += "（无 key）";
    opt.textContent = optLabel;
    providerSelect.appendChild(opt);
  }
  providerSelect.value = providerState.current.entryId || "";
  providerSelect.title = "切换接口：模型会切到该接口的默认模型";
}

function renderProviders() {
  providerListEl.replaceChildren();
  var warnings = providerState.warnings || [];
  for (var w = 0; w < warnings.length; w++) {
    var line = document.createElement("div");
    line.className = "provider-warn";
    line.textContent = warnings[w];
    providerListEl.appendChild(line);
  }
  if (!providerState.entries.length) {
    var empty = document.createElement("div");
    empty.className = "provider-empty";
    empty.textContent = "暂无可用接口";
    providerListEl.appendChild(empty);
  }
  for (var i = 0; i < providerState.entries.length; i++) {
    providerListEl.appendChild(buildProviderItem(providerState.entries[i]));
  }
  renderProviderCurrent();
  renderProviderSelect();
}

function loadProviders(done) {
  fetch("/api/providers", { headers: { "x-agent-token": AGENT_TOKEN } })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data || !data.entries) return;
      providerState = data;
      renderProviders();
      if (typeof done === "function") done();
      if (!providerHintShown && !providerHasAnyKey()) {
        providerHintShown = true;
        addNotice("尚未配置可用的模型接口：请到 设置 → 接口 添加接口并填写 key，然后再发送消息。", "warn");
        openSettings();
        switchSettingsTab("providers");
      }
    })
    .catch(function () {});
}

function useProvider(id, note) {
  fetch("/api/provider", {
    method: "POST",
    headers: { "content-type": "application/json", "x-agent-token": AGENT_TOKEN },
    body: JSON.stringify({ entryId: id })
  })
    .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, body: d }; }); })
    .then(function (x) {
      if (!x.ok) {
        addNotice("切换接口失败：" + ((x.body && x.body.error) || "未知错误"), "warn");
        return;
      }
      var entry = providerEntryById(id);
      addNotice(note || ("已切换到接口：" + ((entry && entry.label) || id)), "info");
      loadProviders();
    })
    .catch(function (err) {
      addNotice("切换接口失败：" + String((err && err.message) || err), "warn");
    });
}

function openProviderForm(entry) {
  providerEditing = entry || null;
  providerFormApi = providerEditing ? providerEditing.api : "openai-completions";
  providerFormTitle.textContent = providerEditing ? "编辑接口：" + (providerEditing.label || providerEditing.id) : "新增接口";
  providerFId.value = providerEditing ? providerEditing.id : "";
  providerFId.disabled = !!providerEditing;
  providerFLabel.value = providerEditing ? providerEditing.label || "" : "";
  providerFBaseUrl.value = providerEditing ? providerEditing.baseUrl || "" : "";
  providerFModel.value = providerEditing ? providerEditing.defaultModel || "" : "";
  providerFKeyEnv.value = providerEditing && providerEditing.keyEnv ? providerEditing.keyEnv : "";
  providerFKey.value = "";
  providerFKey.placeholder = providerEditing && providerEditing.hasKey
    ? "API key（留空则不改动已保存的 key）"
    : "API key（只写不显；留空则用环境变量）";
  setProviderFormStatus("");
  renderProviderApiButtons();
  providerListEl.hidden = true;
  providerHelpEl.hidden = true;
  btnProviderAdd.hidden = true;
  providerFormEl.hidden = false;
  var modal = providerFormEl.closest(".modal");
  if (modal) modal.scrollTop = 0;
  providerFId.focus();
}

function closeProviderForm() {
  providerFormEl.hidden = true;
  providerListEl.hidden = false;
  providerHelpEl.hidden = false;
  btnProviderAdd.hidden = false;
  providerEditing = null;
  setProviderFormStatus("");
}

function testProviderConnection() {
  var baseUrl = providerFBaseUrl.value.trim();
  if (!baseUrl) {
    setProviderFormStatus("请先填写接口地址", "err");
    providerFBaseUrl.focus();
    return;
  }
  var keyEnv = providerFKeyEnv.value.trim();
  var entry = { id: providerFId.value.trim() || "test", api: providerFormApi, baseUrl: baseUrl, defaultModel: providerFModel.value.trim() };
  if (keyEnv) entry.keyEnv = keyEnv;
  providerFTest.disabled = true;
  setProviderFormStatus("正在测试连接…");
  fetch("/api/providers/test", {
    method: "POST",
    headers: { "content-type": "application/json", "x-agent-token": AGENT_TOKEN },
    body: JSON.stringify({ entry: entry, key: providerFKey.value })
  })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      providerFTest.disabled = false;
      if (!d) { setProviderFormStatus("测试失败：无响应", "err"); return; }
      if (d.error) { setProviderFormStatus("测试失败：" + d.error, "err"); return; }
      if (d.fallback) {
        setProviderFormStatus("连接成功，" + (d.note || "该接口不支持 /models 列表，模型请手动填写"), "ok");
        return;
      }
      var models = d.models || [];
      if (!models.length) { setProviderFormStatus("连接成功，但 /models 未返回可用模型", "err"); return; }
      if (!providerFModel.value.trim()) providerFModel.value = models[0];
      setProviderFormStatus("连接成功，可用模型 " + models.length + " 个（如 " + models.slice(0, 3).join("、") + "）", "ok");
    })
    .catch(function (err) {
      providerFTest.disabled = false;
      setProviderFormStatus("测试失败：" + String((err && err.message) || err), "err");
    });
}

function afterProviderChange(id, model) {
  if (providerState.current.entryId === id) {
    fetch("/api/provider", {
      method: "POST",
      headers: { "content-type": "application/json", "x-agent-token": AGENT_TOKEN },
      body: JSON.stringify({ entryId: id, model: model })
    })
      .then(function () { loadProviders(); })
      .catch(function () { loadProviders(); });
    return;
  }
  loadProviders();
}

function saveProvider() {
  var id = providerFId.value.trim();
  var baseUrl = providerFBaseUrl.value.trim();
  var model = providerFModel.value.trim();
  if (!id) { setProviderFormStatus("请填写接口 id", "err"); providerFId.focus(); return; }
  if (!/^[A-Za-z0-9._-]+$/.test(id)) {
    setProviderFormStatus("id 只能用英文字母、数字、点、下划线或横线", "err");
    providerFId.focus();
    return;
  }
  if (!baseUrl) { setProviderFormStatus("请填写接口地址", "err"); providerFBaseUrl.focus(); return; }
  if (!model) { setProviderFormStatus("请填写默认模型 ID", "err"); providerFModel.focus(); return; }
  var entry = {
    id: id,
    label: providerFLabel.value.trim() || id,
    api: providerFormApi,
    provider: (providerEditing && providerEditing.provider) || (providerFormApi === "anthropic-messages" ? "anthropic" : "openai"),
    baseUrl: baseUrl,
    defaultModel: model
  };
  var keyEnv = providerFKeyEnv.value.trim();
  if (keyEnv) entry.keyEnv = keyEnv;
  if (providerEditing && providerEditing.source === "user" && providerEditing.models) entry.models = providerEditing.models;
  providerFSave.disabled = true;
  fetch("/api/providers", {
    method: "POST",
    headers: { "content-type": "application/json", "x-agent-token": AGENT_TOKEN },
    body: JSON.stringify({ entry: entry })
  })
    .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, body: d }; }); })
    .then(function (x) {
      if (!x.ok) {
        providerFSave.disabled = false;
        setProviderFormStatus((x.body && x.body.error) || "保存失败", "err");
        return;
      }
      var key = providerFKey.value;
      if (!key) {
        providerFSave.disabled = false;
        closeProviderForm();
        addNotice("接口已保存：" + id, "info");
        afterProviderChange(id, model);
        return;
      }
      return fetch("/api/providers/key", {
        method: "POST",
        headers: { "content-type": "application/json", "x-agent-token": AGENT_TOKEN },
        body: JSON.stringify({ entryId: id, key: key })
      })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, body: d }; }); })
        .then(function (y) {
          providerFSave.disabled = false;
          if (!y.ok) {
            setProviderFormStatus((y.body && y.body.error) || "key 保存失败", "err");
            return;
          }
          closeProviderForm();
          addNotice("接口已保存：" + id, "info");
          afterProviderChange(id, model);
        });
    })
    .catch(function (err) {
      providerFSave.disabled = false;
      setProviderFormStatus("保存失败：" + String((err && err.message) || err), "err");
    });
}

function pickFallbackProvider(deletedId) {
  for (var i = 0; i < providerState.entries.length; i++) {
    var item = providerState.entries[i];
    if (item.id !== deletedId && item.hasKey) {
      useProvider(item.id, "当前接口已删除，已切换到：" + (item.label || item.id));
      return;
    }
  }
  addNotice("当前接口已删除，且没有其它可用接口，请到 设置 → 接口 添加。", "warn");
}

function confirmDeleteProvider(item) {
  showModal({
    title: "删除接口配置",
    text: "确定删除「" + (item.label || item.id) + "」吗？会从 providers.json 移除该条目，不可恢复（内置接口不受影响）。",
    okText: "删除",
    danger: true,
    showCancel: true,
    onOk: function () {
      var wasCurrent = providerState.current.entryId === item.id;
      fetch("/api/providers/" + encodeURIComponent(item.id), {
        method: "DELETE",
        headers: { "x-agent-token": AGENT_TOKEN }
      })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, body: d }; }); })
        .then(function (x) {
          if (!x.ok) {
            addNotice("删除失败：" + ((x.body && x.body.error) || "未知错误"), "warn");
            return;
          }
          addNotice("已删除接口：" + item.id, "info");
          loadProviders(function () { if (wasCurrent) pickFallbackProvider(item.id); });
        })
        .catch(function (err) { addNotice("删除失败：" + String((err && err.message) || err), "warn"); });
    }
  });
}

for (var providerApiIndex = 0; providerApiIndex < providerApiBtns.length; providerApiIndex++) {
  providerApiBtns[providerApiIndex].addEventListener("click", function () {
    providerFormApi = this.dataset.api;
    renderProviderApiButtons();
  });
}
btnProviderAdd.addEventListener("click", function () { openProviderForm(null); });
providerFCancel.addEventListener("click", closeProviderForm);
providerFTest.addEventListener("click", testProviderConnection);
providerFSave.addEventListener("click", saveProvider);
providerFormEl.addEventListener("keydown", function (ev) {
  if (ev.key === "Enter" && ev.target && ev.target.tagName === "INPUT") {
    ev.preventDefault();
    saveProvider();
  }
});
providerSelect.addEventListener("change", function () {
  var id = providerSelect.value;
  if (!id || id === providerState.current.entryId) { renderProviderSelect(); return; }
  useProvider(id);
});

var MAX_ATTACH = 20;
var MAX_ATTACH_BYTES = 30 * 1024 * 1024;
var pendingAttachments = []; // { file, url, uploaded, id, name, mime, size }

function fmtBytes(n) {
  if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + "MB";
  if (n >= 1024) return (n / 1024).toFixed(0) + "KB";
  return n + "B";
}

function addAttachmentFiles(fileList) {
  if (!fileList) return;
  var files = Array.prototype.slice.call(fileList || []);
  var added = 0;
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    if (!f || !f.type || f.type.indexOf("image/") !== 0) continue;
    if (pendingAttachments.length + added >= MAX_ATTACH) {
      bubble("error", "最多只能添加 " + MAX_ATTACH + " 个附件，已截断");
      break;
    }
    if (f.size > MAX_ATTACH_BYTES) {
      bubble("error", "文件超过 30MB 上限，已跳过：" + f.name);
      continue;
    }
    var fallbackExt = "png";
    if (f.type === "image/jpeg") fallbackExt = "jpg";
    else if (f.type === "image/gif") fallbackExt = "gif";
    else if (f.type === "image/webp") fallbackExt = "webp";
    pendingAttachments.push({
      file: f,
      url: URL.createObjectURL(f),
      uploaded: false,
      id: "",
      name: f.name || ("image-" + (pendingAttachments.length + 1) + "." + fallbackExt),
      mime: f.type,
      size: f.size
    });
    added++;
  }
  if (added) renderAttachStrip();
}

function renderAttachStrip() {
  if (!pendingAttachments.length) {
    attachStrip.hidden = true;
    attachStrip.replaceChildren();
    updateSendState();
    return;
  }
  attachStrip.hidden = false;
  attachStrip.replaceChildren();
  for (var i = 0; i < pendingAttachments.length; i++) {
    var a = pendingAttachments[i];
    var chip = document.createElement("div");
    chip.className = "attach-chip";
    var img = document.createElement("img");
    img.src = a.url;
    img.alt = a.name;
    var nm = document.createElement("div");
    nm.className = "attach-name";
    nm.textContent = a.name;
    var x = document.createElement("button");
    x.className = "attach-x";
    x.title = "移除";
    x.textContent = "×";
    x.addEventListener("click", (function (idx) {
      return function (ev) {
        ev.stopPropagation();
        var removed = pendingAttachments[idx];
        if (removed) { try { URL.revokeObjectURL(removed.url); } catch (e) {} }
        pendingAttachments.splice(idx, 1);
        renderAttachStrip();
      };
    })(i));
    chip.appendChild(img);
    chip.appendChild(nm);
    chip.appendChild(x);
    attachStrip.appendChild(chip);
  }
  var count = document.createElement("div");
  count.className = "attach-count";
  count.textContent = pendingAttachments.length + "/" + MAX_ATTACH;
  attachStrip.appendChild(count);
  updateSendState();
}

function readFileBytes(file) {
  return new Promise(function (resolve, reject) {
    var fr = new FileReader();
    fr.onload = function () { resolve(fr.result); };
    fr.onerror = function () { reject(fr.error || new Error("read failed")); };
    fr.readAsArrayBuffer(file);
  });
}

function uploadPendingAttachments() {
  var pending = pendingAttachments.filter(function (a) { return !a.uploaded; });
  if (!pending.length) return Promise.resolve();
  return Promise.all(pending.map(function (a) {
    return readFileBytes(a.file).then(function (buf) {
      return fetch("/api/upload?name=" + encodeURIComponent(a.name) + "&mime=" + encodeURIComponent(a.mime), {
        method: "POST",
        headers: { "content-type": a.mime, "x-agent-token": AGENT_TOKEN },
        body: buf
      });
    }).then(function (r) { return r.json(); }).then(function (r) {
      if (r && r.attachment && r.attachment.id) {
        a.uploaded = true;
        a.id = r.attachment.id;
        a.name = r.attachment.name || a.name;
        a.mime = r.attachment.mime || a.mime;
        a.size = r.attachment.size || a.size;
        return null;
      }
      return (r && r.error) || "上传失败";
    }).catch(function (err) {
      return "本地文件读不出来，请重新选择后再发（" + (a.name || "附件") + "）：" + String(err);
    });
  })).then(function (errs) {
    var firstErr = errs.filter(Boolean)[0];
    if (firstErr) throw new Error(firstErr);
  });
}

// ---- steering (mid-run guidance) ----
// Chips shown while a steer is queued but not yet consumed. They are cleared
// on turn_start, which is exactly when the server drains the steering queue.
var steerChips = [];

function addSteerChip(text) {
  var el = document.createElement("div");
  el.className = "steer-chip";
  var spin = document.createElement("span");
  spin.className = "steer-spin";
  var label = document.createElement("span");
  label.className = "steer-text";
  label.textContent = text;
  label.title = text;
  el.appendChild(spin);
  el.appendChild(label);
  steerStrip.appendChild(el);
  steerStrip.hidden = false;
  steerChips.push(el);
  return el;
}

function removeSteerChip(el) {
  if (!el) return;
  var i = steerChips.indexOf(el);
  if (i >= 0) steerChips.splice(i, 1);
  el.remove();
  if (!steerChips.length) steerStrip.hidden = true;
}

function clearSteerChips() {
  steerChips = [];
  steerStrip.replaceChildren();
  steerStrip.hidden = true;
}

// Inject the composer's text into the running agent. The server routes a
// /api/send while streaming to agent.steer(), which lands in the next turn.
function steer() {
  if (!isBusy) return;
  var text = ta.value.trim();
  if (!text) return;
  ta.value = "";
  updateSendState();
  var chip = addSteerChip(text);
  fetch("/api/send", {
    method: "POST",
    headers: { "content-type": "application/json", "x-agent-token": AGENT_TOKEN },
    body: JSON.stringify({ text: text })
  })
    .then(function (r) { return r.json(); })
    .then(function (r) {
      if (r && r.error) {
        removeSteerChip(chip);
        bubble("error", r.error);
        ta.value = text;
        updateSendState();
        return;
      }
      // The queued flag is false when the run ended between the keypress and
      // the request: the server treated it as a fresh prompt, so the chip has
      // nothing left to wait for.
      if (!r || !r.queued) removeSteerChip(chip);
    })
    .catch(function (err) {
      removeSteerChip(chip);
      bubble("error", "引导发送失败：" + String((err && err.message) || err));
      ta.value = text;
      updateSendState();
    });
}

steerBtn.addEventListener("click", steer);

function updateSendState() {
  var hasText = ta.value.trim().length > 0;
  var hasAttach = pendingAttachments.length > 0;
  sendBtn.classList.toggle("can-send", !isBusy && (hasText || hasAttach));
  sendBtn.classList.toggle("stop", isBusy);
  sendBtn.title = isBusy ? "停止回答" : "发送";
  if (steerBtn) steerBtn.hidden = !(isBusy && hasText);
}

function clearPendingAttachments() {
  for (var i = 0; i < pendingAttachments.length; i++) {
    try { URL.revokeObjectURL(pendingAttachments[i].url); } catch (e) {}
  }
  pendingAttachments = [];
  renderAttachStrip();
}

function send() {
  if (isBusy) {
    fetch("/api/abort", { method: "POST", headers: { "x-agent-token": AGENT_TOKEN } });
    return;
  }
  sendMessage();
}

var sendPending = false;
function sendMessage() {
  var text = ta.value.trim();
  if (!text && !pendingAttachments.length) return;
  if (sendPending) return;
  sendPending = true;
  sendBtn.disabled = true;
  uploadPendingAttachments()
    .then(function () {
      var ids = pendingAttachments.map(function (a) { return a.id; }).filter(Boolean);
      ta.value = "";
      clearPendingAttachments();
      updateSendState();
      return fetch("/api/send", {
        method: "POST",
        headers: { "content-type": "application/json", "x-agent-token": AGENT_TOKEN },
        body: JSON.stringify({ text: text, attachments: ids })
      }).then(function (r) { return r.json(); });
    })
    .then(function (r) {
      sendPending = false;
      sendBtn.disabled = false;
      if (r && r.error) { setStatus("err"); bubble("error", r.error); }
    })
    .catch(function (err) {
      sendPending = false;
      sendBtn.disabled = false;
      setStatus("err");
      bubble("error", "发送失败：" + String((err && err.message) || err));
      ta.value = text; // keep typed text on failure
      renderAttachStrip();
    });
}

attachBtn.addEventListener("click", function () { attachFile.click(); });
attachFile.addEventListener("change", function () {
  addAttachmentFiles(attachFile.files);
  attachFile.value = "";
});
// Paste image/file support onto the composer textarea.
ta.addEventListener("paste", function (ev) {
  var files = ev.clipboardData && ev.clipboardData.files;
  if (!files || !files.length) return;
  var any = false;
  for (var i = 0; i < files.length; i++) {
    if (files[i] && files[i].type && files[i].type.indexOf("image/") === 0) { any = true; break; }
  }
  if (!any) return; // text paste: let default behavior run
  ev.preventDefault();
  addAttachmentFiles(files);
});

sendBtn.addEventListener("click", send);
ta.addEventListener("input", updateSendState);
updateSendState();
ta.addEventListener("keydown", function (ev) {
  if (ev.key !== "Enter") return;
  if (ev.isComposing || ev.keyCode === 229) return;
  var mod = ev.ctrlKey || ev.metaKey;
  // While a run is active, plain Enter injects steering: correcting the agent
  // mid-flight should be the fast path, not a chord. Shift+Enter still breaks
  // the line, and the main button stays a stop button.
  var shouldSend = isBusy ? !ev.shiftKey : (mod || (enterToSend && !ev.shiftKey));
  if (!shouldSend) return;
  ev.preventDefault();
  if (isBusy) steer();
  else send();
});
document.getElementById("btn-clear").addEventListener("click", function () {
  fetch("/api/clear", { method: "POST", headers: { "x-agent-token": AGENT_TOKEN } }).then(function () {
    clearTrajectory();
    convInner.replaceChildren();
    if (emptyCard) {
      convInner.appendChild(emptyCard);
    } else {
      convInner.innerHTML = EMPTY_CARD;
    }
    try { localStorage.removeItem("tju.gui.conv"); } catch (e) {}
    navRender();
    updateChips();
  });
});

var resetStatsBtn = document.getElementById("btn-reset-stats");
var resetArmed = false;
resetStatsBtn.addEventListener("click", function () {
  if (!resetArmed) {
    resetArmed = true;
    resetStatsBtn.textContent = "确认重置统计?";
    resetStatsBtn.classList.add("armed");
    setTimeout(function () {
      resetArmed = false;
      resetStatsBtn.textContent = "重置统计";
      resetStatsBtn.classList.remove("armed");
    }, 2500);
    return;
  }
  resetArmed = false;
  resetStatsBtn.textContent = "重置统计";
  resetStatsBtn.classList.remove("armed");
  cumTokens = 0;
  cumInput = 0;
  cumCache = 0;
  updateChips();
  scheduleSave();
});

function fmtRunTime(ts) {
  var d = new Date(ts);
  function p(n) { return n < 10 ? "0" + n : String(n); }
  return (d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}
function buildRunBar(meta) {
  var wrap = document.createElement("div");
  wrap.className = "traj-run hist";
  wrap.setAttribute("data-run-id", meta.runId);
  var head = document.createElement("div");
  head.className = "traj-run-head";
  var caret = document.createElement("span");
  caret.className = "caret";
  caret.textContent = "›";
  var badge = document.createElement("span");
  badge.className = "traj-run-badge hist";
  badge.textContent = fmtRunTime(meta.startTs);
  var mini = document.createElement("div");
  mini.className = "traj-run-mini";
  drawBars(mini, meta.segments || [], meta.startTs, "traj-mini-seg", "traj-mini-empty");
  var metaEl = document.createElement("span");
  metaEl.className = "traj-run-meta";
  metaEl.textContent = (meta.prompt || "(无用户消息)") + " · " + (meta.toolCount || 0) + " tool";
  head.appendChild(caret);
  head.appendChild(badge);
  head.appendChild(mini);
  head.appendChild(metaEl);
  var body = document.createElement("div");
  body.className = "traj-run-body";
  var ov = document.createElement("div");
  ov.className = "traj-overview";
  var ovPh = document.createElement("div");
  ovPh.className = "traj-overview-empty";
  ovPh.textContent = "--";
  ov.appendChild(ovPh);
  var turns = document.createElement("div");
  turns.className = "traj-turns";
  var hint = document.createElement("div");
  hint.className = "traj-empty";
  hint.textContent = "点击展开查看该 run 的轨迹";
  turns.appendChild(hint);
  body.appendChild(ov);
  body.appendChild(turns);
  wrap.appendChild(head);
  wrap.appendChild(body);
  (function (rid) {
    head.addEventListener("click", function () { toggleRun(wrap, rid); });
    head.addEventListener("contextmenu", function (e) { showTrajMenu(e, rid); });
  }(meta.runId));
  return wrap;
}
function showTrajMenuAt(x, y, runId, alignRight) {
  trajMenuRunId = runId || null;
  var menu = document.getElementById("traj-menu");
  if (!menu) return;
  // Run-scoped entries only make sense when the menu was opened on a run.
  document.getElementById("traj-menu-delete").hidden = !trajMenuRunId;
  document.getElementById("traj-menu-delete-earlier").hidden = !trajMenuRunId;
  document.getElementById("traj-menu-retention").textContent = "清理 " + retentionDays + " 天前的轨迹";
  menu.style.left = "0px";
  menu.style.top = "0px";
  menu.hidden = false;
  var width = menu.offsetWidth;
  var height = menu.offsetHeight;
  var vw = document.documentElement.clientWidth || window.innerWidth;
  var vh = document.documentElement.clientHeight || window.innerHeight;
  var left = alignRight === undefined ? x : alignRight - width;
  var top = y;
  if (top + height > vh - 4 && y - height >= 4) top = y - height;
  left = Math.max(4, Math.min(left, vw - width - 4));
  top = Math.max(4, Math.min(top, vh - height - 4));
  menu.style.left = left + "px";
  menu.style.top = top + "px";
}
function showTrajMenu(e, runId) {
  e.preventDefault();
  showTrajMenuAt(e.clientX, e.clientY, runId);
}
function hideTrajMenu() {
  trajMenuRunId = null;
  var menu = document.getElementById("traj-menu");
  if (menu) menu.hidden = true;
}
function renderTrajCount() {
  var el = document.getElementById("traj-count");
  if (!el) return;
  if (!trajRuns.length) { el.textContent = "暂无历史 run"; return; }
  var bytes = 0;
  for (var i = 0; i < trajRuns.length; i++) bytes += trajRuns[i].bytes || 0;
  el.textContent = "历史 " + trajRuns.length + " 条 · " + fmtBytes(bytes);
}
// Runs recorded before the given one. trajRuns is newest-first, so everything
// after the anchor is older.
function runsOlderThan(runId) {
  for (var i = 0; i < trajRuns.length; i++) {
    if (trajRuns[i].runId === runId) {
      return trajRuns.slice(i + 1).map(function (r) { return r.runId; });
    }
  }
  return [];
}
// Drop deleted runs from every piece of UI state at once: the list DOM, the
// cached workspaces, the transcript markers and the toolbar count. Callers must
// pass only the ids the server reported as deleted.
function removeRunsFromUI(ids) {
  if (!ids || !ids.length) return;
  var idSet = {};
  for (var i = 0; i < ids.length; i++) idSet[ids[i]] = true;
  var goneAnyTranscript = false;
  for (var id in idSet) {
    if (!Object.prototype.hasOwnProperty.call(idSet, id)) continue;
    delete historyWs[id];
    var gone = convInner.querySelectorAll('[data-run="' + id + '"]');
    for (var gi = 0; gi < gone.length; gi++) { gone[gi].remove(); goneAnyTranscript = true; }
  }
  var listEl = document.getElementById("traj-history");
  var bars = listEl.querySelectorAll(".traj-run.hist");
  for (var b = 0; b < bars.length; b++) {
    if (idSet[bars[b].getAttribute("data-run-id")]) bars[b].remove();
  }
  // An open detail panel may have lived inside a removed run; drop the reference
  // so later updates cannot write into a detached node.
  if (trajDetailOpen && trajDetailOpen.el && !document.contains(trajDetailOpen.el)) {
    trajDetailOpen.detailEl = null;
    trajDetailOpen = null;
  }
  trajRuns = trajRuns.filter(function (r) { return !idSet[r.runId]; });
  renderTrajCount();
  if (!trajRuns.length && !listEl.querySelector(".traj-history-empty")) {
    var ph = document.createElement("div");
    ph.className = "traj-history-empty";
    ph.textContent = "暂无历史 run";
    listEl.appendChild(ph);
  }
  if (goneAnyTranscript) scheduleSave();
}
// One place that talks to the batch endpoint, so single and bulk deletes share
// the same partial-failure handling.
function runsDeleteRequest(payload, onDone) {
  fetch("/api/runs", {
    method: "DELETE",
    headers: { "content-type": "application/json", "x-agent-token": AGENT_TOKEN },
    body: JSON.stringify(payload)
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data || !data.ok) {
        showModal({ title: "删除失败", text: (data && data.error) || "删除失败", okText: "知道了" });
        return;
      }
      // Only the runs the server actually deleted may be dropped from the UI.
      removeRunsFromUI(data.deleted || []);
      var skipped = data.skipped || [];
      var active = 0;
      for (var i = 0; i < skipped.length; i++) if (skipped[i].reason === "active") active++;
      if (onDone) onDone(data);
      else if (active) addNotice("已保留正在执行的 run（" + active + " 条）。", "info");
    })
    .catch(function (err) {
      showModal({ title: "删除失败", text: String(err), okText: "知道了" });
    });
}
function deleteRun(runId) {
  runsDeleteRequest({ runIds: [runId] });
}
// Destructive actions need more than a single click: the user must type a word.
function confirmTyped(word, opts) {
  showModal({
    title: opts.title,
    text: (opts.text || "") + "\\n\\n请输入 " + word + " 以确认。",
    okText: opts.okText || "确认",
    danger: true,
    showCancel: true,
    input: { placeholder: word, required: true, label: "确认词" },
    onOk: function (v) {
      if (String(v || "").trim() !== word) {
        showModal({ title: "确认词不正确", text: "已取消本次操作。", okText: "知道了" });
        return;
      }
      opts.onOk();
    }
  });
}
function toggleRun(wrap, runId) {
  wrap.classList.toggle("open");
  if (!historyWs[runId]) {
    var ws = makeWorkspace(wrap);
    historyWs[runId] = ws;
    fetchRunEvents(runId, ws);
  }
}
function fetchRunEvents(runId, ws) {
  fetch("/api/runs/" + encodeURIComponent(runId) + "/events", { headers: { "x-agent-token": AGENT_TOKEN } })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var events = (data && data.events) || [];
      if (!events.length) {
        resetTrajectory(ws);
        if (ws.emptyEl) ws.emptyEl.textContent = "该 run 没有可回放的轨迹";
        return;
      }
      var base = events[0].ts;
      trajNow = base;
      resetTrajectory(ws);
      for (var i = 0; i < events.length; i++) {
        trajNow = base + (events[i].ts - base);
        handleTrajEvent(ws, events[i].event);
      }
      trajNow = null;
    })
    .catch(function (err) { bubble("error", String(err)); });
}
function loadRuns() {
  historyWs = {};
  fetch("/api/runs", { headers: { "x-agent-token": AGENT_TOKEN } })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var listEl = document.getElementById("traj-history");
      listEl.replaceChildren();
      var runs = (data && data.runs) || [];
      trajRuns = runs;
      if (data && typeof data.retentionDays === "number") retentionDays = data.retentionDays;
      renderTrajCount();
      if (!runs.length) {
        var ph = document.createElement("div");
        ph.className = "traj-history-empty";
        ph.textContent = "暂无历史 run";
        listEl.appendChild(ph);
        return;
      }
      for (var i = 0; i < runs.length; i++) {
        listEl.appendChild(buildRunBar(runs[i]));
      }
    })
    .catch(function () {});
}
loadRuns();

// "清理…" opens the same menu as a right-click, minus the run-scoped entries.
document.getElementById("traj-cleanup").addEventListener("click", function (e) {
  e.stopPropagation();
  var r = this.getBoundingClientRect();
  showTrajMenuAt(r.left, r.bottom + 4, null, r.right);
});

// ---- work items ----
var worksListEl = document.getElementById("works-list");
var worksCountEl = document.getElementById("works-count");
var currentWorkId = null;
var worksCache = [];
var toolCwd = "";
function workById(id) {
  for (var i = 0; i < worksCache.length; i++) if (worksCache[i].id === id) return worksCache[i];
  return null;
}
function currentWorkCwd() {
  var w = workById(currentWorkId);
  return (w && w.cwd) || "";
}
function fmtWorkTime(ts) {
  var d = new Date(ts);
  function p(n) { return n < 10 ? "0" + n : String(n); }
  return (d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}
function buildWorkItem(item) {
  var wrap = document.createElement("div");
  wrap.className = "work-item" + (currentWorkId === item.id ? " active" : "");
  wrap.setAttribute("data-work-id", item.id);
  wrap.title = item.title + "\\n更新于 " + fmtWorkTime(item.updatedAt) + "\\n目录：" + (item.cwd || "");
  var badge = document.createElement("span");
  badge.className = "work-badge";
  var title = document.createElement("span");
  title.className = "work-title";
  title.textContent = item.title || "(未命名)";
  var actions = document.createElement("span");
  actions.className = "work-actions";
  var renBtn = document.createElement("button");
  renBtn.className = "work-act";
  renBtn.title = "编辑名称与目录";
  renBtn.textContent = "✎";
  var delBtn = document.createElement("button");
  delBtn.className = "work-act danger";
  delBtn.title = "删除";
  delBtn.textContent = "×";
  actions.appendChild(renBtn);
  actions.appendChild(delBtn);
  wrap.appendChild(badge);
  wrap.appendChild(title);
  wrap.appendChild(actions);
  wrap.addEventListener("click", function () {
    if (currentWorkId !== item.id) openWork(item.id);
  });
  renBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    editWork(item.id, item.title || "", item.cwd || "");
  });
  delBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    deleteWork(item.id);
  });
  return wrap;
}
function renderWorks(data) {
  currentWorkId = (data && data.current) || null;
  var works = (data && data.works) || [];
  worksCache = works;
  worksCountEl.textContent = String(works.length);
  worksListEl.replaceChildren();
  if (!works.length) {
    var ph = document.createElement("div");
    ph.className = "works-empty";
    ph.textContent = "暂无工作项";
    worksListEl.appendChild(ph);
    return;
  }
  for (var i = 0; i < works.length; i++) {
    worksListEl.appendChild(buildWorkItem(works[i]));
  }
}
function loadWorks() {
  fetch("/api/works", { headers: { "x-agent-token": AGENT_TOKEN } })
    .then(function (r) { return r.json(); })
    .then(function (data) { renderWorks(data); })
    .catch(function () {});
}
fetch("/api/cwd", { headers: { "x-agent-token": AGENT_TOKEN } })
  .then(function (r) { return r.ok ? r.json() : null; })
  .then(function (data) { if (data && data.cwd) toolCwd = data.cwd; })
  .catch(function () {});
function openWork(id) {
  fetch("/api/works/" + encodeURIComponent(id) + "/open", {
    method: "POST",
    headers: { "x-agent-token": AGENT_TOKEN }
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data && data.ok) {
        currentWorkId = id;
        loadWorks();
        renderConversation((data.work && data.work.messages) || []);
        var switchedTitle = (data.work && data.work.title) || id;
        var switchedCwd = data.work && data.work.cwd ? "（目录：" + data.work.cwd + "）" : "";
        addNotice("已切换到工作项：" + switchedTitle + switchedCwd, "info");
      } else if (data && data.error) {
        showModal({ title: "打开失败", text: data.error, okText: "知道了" });
      }
    })
    .catch(function (err) { bubble("error", String(err)); });
}
function renderCheckpointBlock(text) {
  var cel = document.createElement("details");
  cel.className = "tool-block";
  var csum = document.createElement("summary");
  var cbadge = document.createElement("span");
  cbadge.className = "badge ok";
  cbadge.textContent = "摘要";
  var cnm = document.createElement("span");
  cnm.className = "name";
  cnm.textContent = "上下文压缩";
  var cbf = document.createElement("span");
  cbf.className = "brief";
  cbf.textContent = "早先对话已折叠为摘要，点击展开查看";
  csum.appendChild(cbadge);
  csum.appendChild(cnm);
  csum.appendChild(cbf);
  cel.appendChild(csum);
  var cpre = document.createElement("pre");
  cpre.textContent = text.length > 20000 ? text.slice(0, 20000) + "\\n...[内容过长已截断，完整记录见工作项文件与 run 日志]" : text;
  cel.appendChild(cpre);
  convInner.appendChild(cel);
}
function renderToolBlock(name, args, resultText, isError) {
  var el = document.createElement("details");
  el.className = "tool-block";
  var sum = document.createElement("summary");
  var badge = document.createElement("span");
  badge.className = "badge " + (isError ? "err" : "ok");
  badge.textContent = isError ? "ERR" : "OK";
  var nm = document.createElement("span");
  nm.className = "name";
  nm.textContent = name || "tool";
  var bf = document.createElement("span");
  bf.className = "brief";
  bf.textContent = argBrief(args || {});
  sum.appendChild(badge);
  sum.appendChild(nm);
  sum.appendChild(bf);
  el.appendChild(sum);
  var pre = document.createElement("pre");
  var parts = [];
  if (args) parts.push("参数:\\n" + argsHtml(args));
  var res = resultText || "";
  if (res.length > 2000) res = res.slice(0, 2000) + "...";
  if (res) parts.push(res);
  pre.textContent = parts.join("\\n\\n→ ");
  el.appendChild(pre);
  convInner.appendChild(el);
}

function renderConversation(messages) {
  convInner.replaceChildren();
  navRender();
  var runTodoCard = null;
  if (todoDock) { todoDock.replaceChildren(); todoDock.hidden = true; }
  todoLiveCard = null;
  try { localStorage.removeItem("tju.gui.conv"); localStorage.removeItem("tju.gui.traj"); } catch (e) {}
  clearTrajectory();
  if (!messages || !messages.length) {
    if (emptyCard) convInner.appendChild(emptyCard);
    else convInner.innerHTML = EMPTY_CARD;
    return;
  }
  for (var i = 0; i < messages.length; i++) {
    var m = messages[i];
    if (!m || !m.role) continue;
    if (m.role === "user") {
      runTodoCard = null;
      var ucontent = typeof m.content === "string" ? m.content : "";
      if (ucontent.indexOf("<conversation-checkpoint>") !== -1) {
        renderCheckpointBlock(ucontent);
      } else {
        var ub = bubble("user", ucontent, false, m.attachments, m.timestamp);
        if (ub._actionBar) {
          convInner.appendChild(ub._actionBar);
          ub._actionBar = null;
        }
      }
    } else if (m.role === "assistant") {
      var thinking = "";
      var text = "";
      var calls = [];
      if (Array.isArray(m.content)) {
        for (var k = 0; k < m.content.length; k++) {
          var blk = m.content[k];
          if (blk.type === "thinking" && blk.thinking) thinking += blk.thinking;
          if (blk.type === "text" && blk.text) text += blk.text;
          if (blk.type === "toolCall") calls.push(blk);
        }
      }
      if (thinking || text) {
        var b = bubble("assistant", renderAssistant(m), true);
        var answerTrim = text.trim();
        if (b._copyBtn && answerTrim) {
          b._answerText = answerTrim;
          b.appendChild(b._copyBtn);
          b._copyBtn = null;
        }
      }
      var byId = {};
      for (var c = 0; c < calls.length; c++) byId[calls[c].id] = calls[c];
      while (i + 1 < messages.length && messages[i + 1] && messages[i + 1].role === "toolResult") {
        i++;
        var tr = messages[i];
        var call = byId[tr.toolCallId] || null;
        if (tr.toolName === "todowrite" && call && call.arguments) {
          if (!runTodoCard || !runTodoCard.isConnected) {
            runTodoCard = makeTodoCard(false);
            anchorTodoCard(runTodoCard);
          }
          paintTodoCard(runTodoCard, todoTodos(call.arguments));
        } else {
          renderToolBlock(tr.toolName, call ? call.arguments : null, tr.content, !!tr.isError);
        }
      }
    } else if (m.role === "toolResult") {
      renderToolBlock(m.toolName, null, m.content, !!m.isError);
    }
  }
  stickToBottom = true;
  scrollDown();
  paintAttachmentImages(convInner);
  if (!attachmentTicket) {
    refreshAttachmentTicket().then(function () { paintAttachmentImages(convInner); });
  }
}
document.getElementById("btn-new-work").addEventListener("click", function () {
  var defCwd = toolCwd || currentWorkCwd();
  openWorkDialog({
    title: "新建工作项",
    name: "",
    cwd: "",
    requireTitle: false,
    requireCwd: false,
    cwdPlaceholder: defCwd ? "留空使用：" + defCwd : "留空使用当前目录",
    initPath: defCwd,
    onOk: function (finalTitle, cwd) { createWork(finalTitle, cwd); }
  });
});
function createWork(title, cwd) {
  fetch("/api/works", {
    method: "POST",
    headers: { "content-type": "application/json", "x-agent-token": AGENT_TOKEN },
    body: JSON.stringify({ title: title, cwd: cwd })
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data && data.ok) {
        loadWorks();
        if (data.switched === false) {
          addNotice("已新建工作项" + (title ? "：" + title : "。") + "当前任务结束后在左侧点击切换。", "info");
        } else {
          renderConversation([]);
          addNotice("已新建工作项" + (title ? "：" + title : "。"), "info");
        }
        if (data.pending) confirmCwdChange(data.id, data.cwd);
      } else if (data && data.error) {
        showModal({ title: "新建失败", text: data.error, okText: "知道了" });
      }
    })
    .catch(function (err) { bubble("error", String(err)); });
}
function editWork(id, currentTitle, currentCwd) {
  openWorkDialog({
    title: "编辑工作项",
    name: currentTitle,
    cwd: currentCwd || "",
    requireTitle: true,
    requireCwd: true,
    initPath: currentCwd,
    onOk: function (title, cwd) {
      fetch("/api/works/" + encodeURIComponent(id) + "/rename", {
        method: "POST",
        headers: { "content-type": "application/json", "x-agent-token": AGENT_TOKEN },
        body: JSON.stringify({ title: title })
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data && data.ok) setWorkCwd(id, cwd);
          else if (data && data.error) showModal({ title: "重命名失败", text: data.error, okText: "知道了" });
        })
        .catch(function (err) { bubble("error", String(err)); });
    }
  });
}
function setWorkCwd(id, cwd) {
  postWorkCwd(id, cwd, false);
}
function confirmCwdChange(id, cwd) {
  showModal({
    title: "确认变更工作目录",
    text: "工作目录将变更为：" + cwd + "。只影响后续工具调用，历史对话不变；审批边界随之切换。",
    okText: "确认变更",
    showCancel: true,
    onOk: function () {
      if (!cwdNonce) {
        showModal({ title: "无法确认", text: "缺少确认凭证，请在最初打开的页面标签中操作，或刷新页面后重试。", okText: "知道了" });
        return;
      }
      postWorkCwd(id, cwd, true);
    }
  });
}
function postWorkCwd(id, cwd, confirmed) {
  fetch("/api/works/" + encodeURIComponent(id) + "/cwd", {
    method: "POST",
    headers: { "content-type": "application/json", "x-agent-token": AGENT_TOKEN },
    body: JSON.stringify(confirmed ? { cwd: cwd, confirm: true, nonce: cwdNonce } : { cwd: cwd })
  })
    .then(function (r) { return r.json().then(function (data) { return { status: r.status, data: data }; }); })
    .then(function (ret) {
      if (ret.status === 409) {
        addNotice("任务执行中，请等本轮结束后再改目录。", "warn");
        return;
      }
      if (ret.status === 202 || (ret.data && ret.data.pending)) {
        confirmCwdChange(id, (ret.data && ret.data.cwd) || cwd);
        return;
      }
      if (ret.data && ret.data.ok) {
        loadWorks();
        if (id === currentWorkId) addNotice("工作目录已切换到：" + ret.data.cwd + "，后续工具调用在此执行。", "info");
      } else {
        showModal({ title: "修改失败", text: (ret.data && ret.data.error) || "修改失败", okText: "知道了" });
      }
    })
    .catch(function (err) { bubble("error", String(err)); });
}
var workBackdrop = document.getElementById("work-backdrop");
var workModalTitle = document.getElementById("work-modal-title");
var workFTitle = document.getElementById("work-f-title");
var workFCwd = document.getElementById("work-f-cwd");
var workFBrowse = document.getElementById("work-f-browse");
var workBrowser = document.getElementById("work-browser");
var workBPath = document.getElementById("work-b-path");
var workBUp = document.getElementById("work-b-up");
var workBStatus = document.getElementById("work-b-status");
var workDrives = document.getElementById("work-drives");
var workBList = document.getElementById("work-b-list");
var workBPick = document.getElementById("work-b-pick");
var workCancel = document.getElementById("work-cancel");
var workOk = document.getElementById("work-ok");
var workDialog = null;
var workBrowsePath = "";
var workRecent = document.getElementById("work-recent");
function paintWorkRecent(current) {
  var olds = workRecent.querySelectorAll(".work-recent-item");
  for (var k = 0; k < olds.length; k++) olds[k].remove();
  var pick = "";
  for (var i = 0; i < worksCache.length; i++) {
    var c = worksCache[i].cwd;
    if (!c || c === current) continue;
    pick = c;
    break;
  }
  if (!pick) { workRecent.hidden = true; return; }
  workRecent.hidden = false;
  var chip = document.createElement("button");
  chip.type = "button";
  chip.className = "work-recent-item";
  chip.textContent = pick;
  chip.title = pick;
  chip.addEventListener("click", function () {
    workFCwd.value = pick;
    workFCwd.classList.remove("invalid");
  });
  workRecent.appendChild(chip);
}
function workDialogKey(e) {
  if (e.key === "Escape") { e.preventDefault(); closeWorkDialog(); }
}
function openWorkDialog(opts) {
  workDialog = opts;
  workModalTitle.textContent = opts.title;
  workFTitle.value = opts.name || "";
  workFCwd.value = opts.cwd || "";
  workFCwd.placeholder = opts.cwdPlaceholder || "留空使用当前目录";
  workBrowser.hidden = true;
  paintWorkRecent(opts.cwd || "");
  workFTitle.classList.remove("invalid");
  workFCwd.classList.remove("invalid");
  workBackdrop.hidden = false;
  document.addEventListener("keydown", workDialogKey);
  workFTitle.focus();
}
function closeWorkDialog() {
  workDialog = null;
  workBackdrop.hidden = true;
  document.removeEventListener("keydown", workDialogKey);
}
function workBrowseGo(path) {
  workBStatus.classList.remove("err");
  workBStatus.textContent = "加载中…";
  fetch("/api/fs/browse?path=" + encodeURIComponent(path), { headers: { "x-agent-token": AGENT_TOKEN } })
    .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
    .then(function (ret) {
      if (!ret.ok || !ret.data || !ret.data.path) {
        workBStatus.textContent = (ret.data && ret.data.error) || "读取失败";
        workBStatus.classList.add("err");
        return;
      }
      workBrowsePath = ret.data.path;
      workBPath.value = ret.data.path;
      workBUp.disabled = !ret.data.parent;
      workBUp.dataset.parent = ret.data.parent || "";
      var drives = ret.data.drives || [];
      workDrives.replaceChildren();
      if (drives.length > 1) {
        workDrives.hidden = false;
        for (var di = 0; di < drives.length; di++) {
          (function (drive) {
            var dbtn = document.createElement("button");
            dbtn.type = "button";
            dbtn.className = "work-drive";
            dbtn.textContent = drive;
            dbtn.addEventListener("click", function () { workBrowseGo(drive); });
            workDrives.appendChild(dbtn);
          })(drives[di]);
        }
      } else {
        workDrives.hidden = true;
      }
      var entries = ret.data.entries || [];
      workBList.replaceChildren();
      if (!entries.length) {
        var empty = document.createElement("div");
        empty.className = "work-b-empty";
        empty.textContent = "空目录";
        workBList.appendChild(empty);
      }
      for (var i = 0; i < entries.length; i++) {
        (function (entry) {
          var row = document.createElement("button");
          row.type = "button";
          row.className = "work-b-row";
          row.title = entry.path;
          var nm = document.createElement("div");
          nm.className = "work-b-name";
          nm.textContent = entry.name;
          var ph = document.createElement("div");
          ph.className = "work-b-path";
          ph.textContent = entry.path;
          row.appendChild(nm);
          row.appendChild(ph);
          row.addEventListener("click", function () { workBrowseGo(entry.path); });
          workBList.appendChild(row);
        })(entries[i]);
      }
      workBStatus.textContent = entries.length + " 个子目录" + (ret.data.truncated ? "（仅显示前 500 个）" : "");
    })
    .catch(function (err) {
      workBStatus.textContent = String((err && err.message) || err);
      workBStatus.classList.add("err");
    });
}
workFBrowse.addEventListener("click", function () {
  workBrowser.hidden = false;
  workBrowseGo(workFCwd.value.trim() || (workDialog && workDialog.initPath) || currentWorkCwd());
});
workBUp.addEventListener("click", function () {
  if (workBUp.dataset.parent) workBrowseGo(workBUp.dataset.parent);
});
workBPath.addEventListener("keydown", function (ev) {
  if (ev.key === "Enter") { ev.preventDefault(); workBrowseGo(workBPath.value); }
});
workBPick.addEventListener("click", function () {
  if (workBrowsePath) workFCwd.value = workBrowsePath;
  workBrowser.hidden = true;
  workFCwd.classList.remove("invalid");
});
workCancel.addEventListener("click", function () { closeWorkDialog(); });
workOk.addEventListener("click", function () {
  if (!workDialog) return;
  workFTitle.classList.remove("invalid");
  workFCwd.classList.remove("invalid");
  var title = workFTitle.value.trim();
  var cwd = workFCwd.value.trim();
  if (workDialog.requireTitle && !title) { workFTitle.classList.add("invalid"); workFTitle.focus(); return; }
  if (workDialog.requireCwd && !cwd) { workFCwd.classList.add("invalid"); workFCwd.focus(); return; }
  var d = workDialog;
  closeWorkDialog();
  d.onOk(title, cwd);
});
function deleteWork(id) {
  showModal({
    title: "删除工作项",
    text: "确定删除该工作项吗？其对话与任务清单将一并删除，不可恢复。",
    okText: "删除",
    danger: true,
    showCancel: true,
    onOk: function () {
      fetch("/api/works/" + encodeURIComponent(id), {
        method: "DELETE",
        headers: { "x-agent-token": AGENT_TOKEN }
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data && data.ok) {
            loadWorks();
            if (data.work) {
              currentWorkId = data.work.id;
              renderConversation((data.work.messages) || []);
            }
          } else if (data && data.error) showModal({ title: "删除失败", text: data.error, okText: "知道了" });
        })
        .catch(function (err) { bubble("error", String(err)); });
    }
  });
}
loadWorks();

/**
 * Subscribe to the event stream with fetch() instead of EventSource.
 *
 * EventSource cannot set request headers, so the session token had to travel
 * in the query string — where it lands in browser history, proxy logs and the
 * Referer of any navigation off the page. A streaming fetch sends it in
 * x-agent-token like every other API call. Reconnection is done by hand with
 * exponential backoff.
 */
var eventStreamController = new AbortController();
var eventStreamClosed = false;

function connectEvents(attempt) {
  if (eventStreamClosed) return;
  fetch("/api/events", { headers: { "x-agent-token": AGENT_TOKEN }, signal: eventStreamController.signal })
    .then(function (res) {
      if (!res.ok || !res.body) throw new Error("stream status " + res.status);
      attempt = 0;
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer = "";
      function read() {
        return reader.read().then(function (chunk) {
          if (chunk.done) throw new Error("stream ended");
          buffer += decoder.decode(chunk.value, { stream: true });
          var frames = buffer.split("\\n\\n");
          buffer = frames.pop();
          for (var i = 0; i < frames.length; i++) {
            var lines = frames[i].split("\\n");
            for (var j = 0; j < lines.length; j++) {
              if (lines[j].indexOf("data:") === 0) {
                var msg;
                try { msg = JSON.parse(lines[j].slice(5).trim()); } catch (e) { continue; }
                handleServerMessage(msg);
              }
            }
          }
          return read();
        });
      }
      return read();
    })
    .catch(function () {
      if (eventStreamClosed) return;
      setStatus("err");
      setTimeout(function () { connectEvents(Math.min(attempt + 1, 6)); }, Math.min(1000 * Math.pow(2, attempt), 15000));
    });
}

var approvalBox = document.getElementById("approval");
var approvalText = document.getElementById("approval-text");
var approvalRequestId = null;
var approvalQueue = [];
var approvalParentBtn = document.getElementById("approval-parent");
var approvalParentDir = null;

function showNextApproval() {
  if (approvalRequestId || !approvalQueue.length) return;
  var req = approvalQueue.shift();
  approvalRequestId = req.requestId;
  approvalParentDir = req.parentDir || null;
  if (approvalParentDir) {
    approvalParentBtn.hidden = false;
    approvalParentBtn.textContent = "总是允许 " + approvalParentDir + "\\*";
    approvalParentBtn.title = "本次会话内记住 " + approvalParentDir + " 及其所有子目录";
    approvalText.textContent = "工具 " + req.toolName + " 将访问工作目录外的目录：\\n  " + req.scopeDir + "\\n『总是允许』记住该目录（含子目录）；上级记住 " + approvalParentDir + "\\*（含子目录）。";
  } else {
    approvalParentBtn.hidden = true;
    approvalParentDir = null;
    approvalText.textContent = "工具 " + req.toolName + " 将访问工作目录外的目录：\\n  " + req.scopeDir + "\\n『总是允许』将在本次会话内记住该目录（含子目录）。";
  }
  approvalBox.hidden = false;
}

function answerApproval(mode, scope) {
  if (!approvalRequestId) return;
  var id = approvalRequestId;
  approvalRequestId = null;
  approvalParentDir = null;
  approvalBox.hidden = true;
  fetch("/api/approve", {
    method: "POST",
    headers: { "content-type": "application/json", "x-agent-token": AGENT_TOKEN },
    body: JSON.stringify(scope ? { requestId: id, mode: mode, scope: scope } : { requestId: id, mode: mode })
  }).then(function () { showNextApproval(); })
    .catch(function () { showNextApproval(); });
  showNextApproval();
}
document.getElementById("approval-once").addEventListener("click", function () { answerApproval("once"); });
document.getElementById("approval-always").addEventListener("click", function () { answerApproval("always"); });
document.getElementById("approval-parent").addEventListener("click", function () { if (approvalParentDir) answerApproval("always", approvalParentDir); });
document.getElementById("approval-no").addEventListener("click", function () { answerApproval("deny"); });

var questionBackdrop = document.getElementById("question-backdrop");
var questionText = document.getElementById("question-text");
var questionOptions = document.getElementById("question-options");
var questionInput = document.getElementById("question-input");
var questionRequestId = null;
var questionQueue = [];

function hideQuestion() {
  questionRequestId = null;
  if (questionBackdrop) questionBackdrop.hidden = true;
  document.removeEventListener("keydown", questionKeyHandler);
}

function questionKeyHandler(e) {
  if (e.key === "Escape") {
    e.preventDefault();
    cancelQuestion();
  }
}

function answerQuestion(choice, cancelled) {
  if (!questionRequestId) return;
  var id = questionRequestId;
  hideQuestion();
  fetch("/api/question/answer", {
    method: "POST",
    headers: { "content-type": "application/json", "x-agent-token": AGENT_TOKEN },
    body: cancelled ? JSON.stringify({ requestId: id, mode: "cancel" }) : JSON.stringify({ requestId: id, choice: choice })
  }).then(function (r) { return r.json(); })
    .then(function () { showNextQuestion(); })
    .catch(function () { showNextQuestion(); });
  showNextQuestion();
}

function cancelQuestion() {
  answerQuestion("", true);
}

function showNextQuestion() {
  if (questionRequestId || !questionQueue.length) return;
  var req = questionQueue.shift();
  showQuestion(req);
}

function showQuestion(req) {
  questionRequestId = req.requestId;
  questionText.textContent = req.question || "";
  questionOptions.replaceChildren();
  var opts = Array.isArray(req.options) ? req.options.slice(0, 3) : [];
  for (var i = 0; i < opts.length; i++) {
    (function (text) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "modal-btn question-opt";
      btn.textContent = (i + 1) + ". " + text;
      btn.addEventListener("click", function () { answerQuestion(text); });
      questionOptions.appendChild(btn);
    })(String(opts[i]));
  }
  questionInput.value = "";
  questionInput.classList.remove("invalid");
  questionBackdrop.hidden = false;
  questionBackdrop.onclick = function (e) { if (e.target === questionBackdrop) cancelQuestion(); };
  document.addEventListener("keydown", questionKeyHandler);
  questionInput.focus();
}
document.getElementById("question-submit").addEventListener("click", function () {
  var v = questionInput.value.trim();
  if (!v) {
    questionInput.classList.add("invalid");
    questionInput.focus();
    return;
  }
  answerQuestion(v);
});
questionInput.addEventListener("keydown", function (ev) {
  if (ev.key === "Enter") {
    ev.preventDefault();
    document.getElementById("question-submit").click();
  }
});

connectEvents(0);
var suppressReplay = false;
function handleServerMessage(msg) {
  if (!msg || typeof msg !== "object") return;
  if (msg.kind === "replay" && suppressReplay) return;
  if (msg.kind === "event" || msg.kind === "replay") {
    if (msg.event.type === "agent_start") {
      if (msg.kind === "replay" && msg.runId) {
        var stale = convInner.querySelectorAll('[data-run="' + msg.runId + '"]');
        for (var pi = 0; pi < stale.length; pi++) stale[pi].remove();
        currentRunId = msg.runId;
      } else {
        currentRunId = null;
      }
    }
    else if (msg.runId) { currentRunId = msg.runId; }
    handleLiveEvent(msg.event);
  }
  else if (msg.kind === "state") {
    if (msg.ticket) attachmentTicket = msg.ticket;
    if (msg.state && msg.state.model) {
      modelApi = msg.state.model.api;
      modelLabel.textContent = msg.state.model.api + " / " + msg.state.model.id;
      var svrEffort = normalizeEffort(msg.state.model.reasoningEffort);
      if (svrEffort && svrEffort !== currentEffort) {
        currentEffort = svrEffort;
        localStorage.setItem("tju.gui.effort", currentEffort);
        renderEffort();
      }
    }
    if (msg.work) {
      currentWorkId = msg.work.id;
      var streaming = !!(msg.state && msg.state.isStreaming);
      suppressReplay = !streaming;
      if (!streaming) {
        renderConversation(msg.work.messages || []);
        if (msg.work.messages && msg.work.messages.length) {
          try {
            var sc = convInner.cloneNode(true);
            var si = sc.querySelectorAll("img.att-img");
            for (var sj = 0; sj < si.length; sj++) si[sj].removeAttribute("src");
            localStorage.setItem("tju.gui.conv", sc.innerHTML);
          } catch (e) {}
        }
      }
    }
    setStatus(msg.state && msg.state.isStreaming ? "busy" : "idle");
  }
  else if (msg.kind === "approval") {
    if (msg.request) {
      var dup = false;
      for (var ai = 0; ai < approvalQueue.length; ai++) {
        if (approvalQueue[ai].requestId === msg.request.requestId) { dup = true; break; }
      }
      if (!dup && approvalRequestId !== msg.request.requestId) approvalQueue.push(msg.request);
      showNextApproval();
    } else {
      approvalRequestId = null;
      approvalQueue = [];
      approvalBox.hidden = true;
    }
  }
  else if (msg.kind === "question") {
    if (msg.request) {
      var qreq = msg.request;
      var qdup = questionRequestId === qreq.requestId;
      for (var qi = 0; qi < questionQueue.length && !qdup; qi++) {
        if (questionQueue[qi].requestId === qreq.requestId) qdup = true;
      }
      if (!qdup) questionQueue.push(qreq);
      showNextQuestion();
    } else {
      questionRequestId = null;
      questionQueue = [];
      hideQuestion();
    }
  }
  else if (msg.kind === "error") { setStatus("err"); bubble("error", msg.message || "unknown error"); }
  else if (msg.kind === "works") { loadWorks(); }
}
readFragmentSecrets();
restoreState();
refreshAttachmentTicket().then(function () { paintAttachmentImages(convInner); });
loadProviders();
var imgViewer = document.getElementById("img-viewer");
if (imgViewer) {
  imgViewer.addEventListener("click", function (ev) {
    if (ev.target === imgViewer || (ev.target && ev.target.id === "img-viewer-x")) closeImageViewer();
  });
}
var imgViewerX = document.getElementById("img-viewer-x");
if (imgViewerX) imgViewerX.addEventListener("click", function () { closeImageViewer(); });
document.addEventListener("keydown", function (ev) {
  if (ev.key === "Escape") {
    var v = document.getElementById("img-viewer");
    if (v && !v.hidden) closeImageViewer();
  }
});
if (attachStrip) attachStrip.addEventListener("click", function (ev) {
  var t = ev.target;
  if (t && t.closest && t.closest(".attach-x")) return;
  var im = t && t.closest ? t.closest("img") : null;
  if (im && im.src) openImageViewer(im.src, im.alt);
});`;