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
      <div class="stat-row"><span>tokens</span><b id="stat-run">0</b></div>
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
        <span class="stat-chip" id="stat-cache" title="缓存命中率">cache -</span>
        <span class="stat-chip" id="stat-total" title="累计 tokens">tokens -</span>
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
        <div class="chat-box">
          <div class="attach-strip" id="attach-strip" hidden></div>
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
          </div>
          <button id="send" class="send-btn" title="发送">
            <svg class="icon-send" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 13V3M4.5 6.5L8 3L11.5 6.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <svg class="icon-stop" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 3H13V13H3Z" fill="currentColor"/></svg>
          </button>
        </div>
      </section>
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
    <button id="approval-no" class="approval-btn">拒绝</button>
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
    <label class="settings-row" for="opt-enter-send">
      <span class="settings-label">
        <span class="settings-name">Enter 发送</span>
        <span class="settings-hint">勾选后按 Enter 直接发送，Shift+Enter 换行；不勾选则 Ctrl/Cmd+Enter 发送</span>
      </span>
      <input type="checkbox" id="opt-enter-send" class="settings-check" />
    </label>
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
  --shadow: 0 4px 12px 0 rgba(0, 0, 0, 0.02), 0 2px 8px 0 rgba(0, 0, 0, 0.05);
}
html { color-scheme: light; }
html[data-theme="dark"] {
  --bg: #141417; --panel: #212124; --code: #1b1b1e;
  --border: rgba(255, 255, 255, 0.09); --border-strong: rgba(255, 255, 255, 0.16);
  --text: #e8e8ea; --muted: #a0a4aa; --faint: #7c8087;
  --accent: #679efe; --accent-hover: #86acff; --accent-soft: rgba(103, 158, 254, 0.16);
  --user-bubble: #2c2c2e; --err: #f07178; --ok: #4ecb8d; --warn: #e0a458;
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
.bubble.user .attachments { display: flex; flex-wrap: wrap; gap: 8px; padding: 8px 14px 0; }
.bubble .att-img {
  max-width: 220px; max-height: 220px; border-radius: 10px; cursor: zoom-in;
  border: 1px solid var(--border); object-fit: contain;
}
.bubble .att-img:hover { opacity: .92; }
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
.modal-btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
.modal-btn.primary:hover { background: var(--accent-hover); border-color: var(--accent-hover); color: #fff; }
.modal-btn.danger { background: var(--err); border-color: var(--err); color: #fff; font-weight: 600; }
.modal-btn.danger:hover { filter: brightness(1.05); color: #fff; }
.settings-modal { width: min(440px, 100%); }
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
.approval-actions { display: flex; gap: 8px; }
.approval-btn { border: 1px solid var(--border); background: var(--bg); color: var(--text); padding: 6px 18px; border-radius: 8px; cursor: pointer; font-size: 13px; }
.approval-btn.ok-btn { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
.approval-btn.always-btn { border-color: var(--accent); color: var(--accent); }
.approval-btn:hover { filter: brightness(1.05); }
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
}`;

export const APP_JS = `"use strict";
var conversation = document.getElementById("conversation");
var convInner = document.getElementById("conv-inner");
var sendBtn = document.getElementById("send");
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
});
scrollBtn.addEventListener("click", function () {
  stickToBottom = true;
  conversation.scrollTop = conversation.scrollHeight;
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

function bubble(cls, textOrHtml, isHtml, attachments) {
  var el = document.createElement("div");
  el.className = "bubble " + cls;
  var body = document.createElement("div");
  body.className = "body";
  if (isHtml) body.innerHTML = textOrHtml;
  else body.textContent = textOrHtml;
  if (attachments && attachments.length) {
    var imgWrap = document.createElement("div");
    imgWrap.className = "attachments";
    for (var ai = 0; ai < attachments.length; ai++) {
      var att = attachments[ai];
      if (!att || att.kind !== "image" || !att.id) continue;
      var pic = document.createElement("img");
      pic.className = "att-img";
      pic.loading = "lazy";
      pic.alt = att.name || "image";
      if (currentWorkId) pic.src = "/api/attachments/" + encodeURIComponent(currentWorkId) + "/" + encodeURIComponent(att.id) + "?token=" + encodeURIComponent(AGENT_TOKEN);
      imgWrap.appendChild(pic);
    }
    if (imgWrap.childNodes.length) el.appendChild(imgWrap);
  }
  var copyBtn = document.createElement("button");
  copyBtn.className = "copy";
  copyBtn.title = "复制";
  copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6.14929 4.02032C7.11197 4.02032 7.87983 4.02016 8.49597 4.07598C9.12128 4.13269 9.65792 4.25188 10.1415 4.53106C10.7202 4.8653 11.2008 5.3459 11.535 5.92462C11.8142 6.40818 11.9334 6.94481 11.9901 7.57012C12.0459 8.18625 12.0458 8.95419 12.0458 9.9168C12.0458 10.8795 12.0459 11.6473 11.9901 12.2635C11.9334 12.8888 11.8142 13.4254 11.535 13.909C11.2008 14.4877 10.7202 14.9683 10.1415 15.3025C9.65792 15.5817 9.12128 15.7009 8.49597 15.7576C7.87984 15.8134 7.11196 15.8133 6.14929 15.8133C5.18667 15.8133 4.41874 15.8134 3.80261 15.7576C3.1773 15.7009 2.64067 15.5817 2.1571 15.3025C1.5784 14.9683 1.09778 14.4877 0.76355 13.909C0.484366 13.4254 0.365184 12.8888 0.308472 12.2635C0.252649 11.6473 0.252808 10.8795 0.252808 9.9168C0.252808 8.95418 0.252664 8.18625 0.308472 7.57012C0.365184 6.94481 0.484366 6.40818 0.76355 5.92462C1.09777 5.34589 1.57839 4.86529 2.1571 4.53106C2.64067 4.25188 3.1773 4.13269 3.80261 4.07598C4.41874 4.02017 5.18666 4.02032 6.14929 4.02032ZM6.14929 5.37774C5.16181 5.37774 4.46634 5.37761 3.92566 5.42657C3.39434 5.47472 3.07859 5.56574 2.83582 5.70587C2.4632 5.92106 2.15354 6.2307 1.93835 6.60333C1.79823 6.8461 1.70721 7.16185 1.65906 7.69317C1.6101 8.23385 1.61023 8.92933 1.61023 9.9168C1.61023 10.9043 1.61009 11.5998 1.65906 12.1404C1.70721 12.6717 1.79823 12.9875 1.93835 13.2303C2.15356 13.6029 2.46321 13.9126 2.83582 14.1277C3.07859 14.2679 3.39434 14.3589 3.92566 14.407C4.46634 14.456 5.16182 14.4559 6.14929 14.4559C7.13682 14.4559 7.83224 14.456 8.37292 14.407C8.90425 14.3589 9.21999 14.2679 9.46277 14.1277C9.83535 13.9126 10.145 13.6029 10.3602 13.2303C10.5004 12.9875 10.5914 12.6717 10.6395 12.1404C10.6885 11.5998 10.6884 10.9043 10.6884 9.9168C10.6884 8.92934 10.6885 8.23384 10.6395 7.69317C10.5914 7.16185 10.5004 6.8461 10.3602 6.60333C10.1451 6.23071 9.83536 5.92107 9.46277 5.70587C9.21999 5.56574 8.90424 5.47472 8.37292 5.42657C7.83224 5.3776 7.13682 5.37774 6.14929 5.37774ZM9.80164 0.367975C10.7638 0.367975 11.5314 0.36788 12.1473 0.423639C12.7726 0.480307 13.3093 0.598759 13.7928 0.877741C14.3717 1.21192 14.8521 1.69355 15.1864 2.27227C15.4655 2.75574 15.5857 3.29164 15.6425 3.9168C15.6983 4.53301 15.6971 5.3016 15.6971 6.26446V7.82989C15.6971 8.29264 15.6989 8.58993 15.6649 8.84844C15.4668 10.3525 14.401 11.5738 12.9833 11.9988V10.5467C13.6973 10.1903 14.2105 9.49662 14.3192 8.67169C14.3387 8.52347 14.3407 8.3358 14.3407 7.82989V6.26446C14.3407 5.27706 14.3398 4.58149 14.2909 4.04083C14.2428 3.50968 14.1526 3.19372 14.0126 2.95098C13.7974 2.57849 13.4876 2.26869 13.1151 2.05352C12.8724 1.91347 12.5564 1.82237 12.0253 1.77423C11.4847 1.72528 10.7888 1.7254 9.80164 1.7254H7.71472C6.7562 1.72558 5.92665 2.27697 5.52332 3.07891H4.07019C4.54221 1.51132 5.9932 0.368186 7.71472 0.367975H9.80164Z" fill="currentColor"></path></svg>';
  el.appendChild(body);
  if (cls.indexOf("assistant") === 0) el._copyBtn = copyBtn;
  if (currentRunId) el.setAttribute("data-run", currentRunId);
  convInner.appendChild(el);
  scrollDown();
  return el;
}

function setStatus(mode) {
  statusDot.className = "dot " + mode;
  progressEl.hidden = mode !== "busy";
  isBusy = mode === "busy";
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
      localStorage.setItem("tju.gui.conv", convInner.innerHTML);
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
    stickToBottom = true;
    scrollDown();
  }
  if (model) modelLabel.textContent = model;
  if (cum && typeof cum.in === "number") {
    cumInput = cum.in;
    cumCache = cum.cache || 0;
    cumTokens = cum.total || cum.in;
    updateChips();
  }
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
  var copyBtn = target.closest(".copy");
  if (copyBtn) {
    var host = copyBtn.parentElement;
    var bodyEl = host && host.querySelector ? host.querySelector(".body") : null;
    if (host && host._answerText) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(host._answerText).catch(function () {});
      }
    } else if (bodyEl && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(bodyEl.textContent.trim()).catch(function () {});
    }
  }
});

var pendingAssistant = null;
var lastTool = null;
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
  statTotal.textContent = "tokens " + fmtTokens(cumTokens);
  statCache.textContent = "cache " + (cumInput > 0 ? Math.round((cumCache / cumInput) * 100) + "%" : "-");
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
  for (var i = 0; i < todos.length; i++) if (todos[i] && todos[i].status === "completed") done++;
  return done + "/" + todos.length + " 完成";
}
function todoListText(args) {
  var todos = args && Array.isArray(args.todos) ? args.todos : [];
  if (!todos.length) return "（空任务清单）";
  var lines = [];
  for (var j = 0; j < todos.length; j++) {
    var t = todos[j];
    if (!t) continue;
    var mark = t.status === "completed" ? "[x]" : t.status === "active" ? "[~]" : "[ ]";
    lines.push("- " + mark + " " + (t.content || "") + (t.priority ? " (" + t.priority + ")" : ""));
  }
  return lines.join("\\n");
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
      scheduleSave();
      saveTraj(liveWs);
      if (liveWs.metaEl) liveWs.metaEl.textContent = "已完成";
      loadRuns();
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
        bubble("user", e.message.content, false, e.message.attachments);
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
      } else if (e.toolName === "todowrite") {
        pre.textContent = "任务清单:\\n" + todoListText(e.args);
      } else {
        pre.textContent = "参数:\\n" + argsHtml(e.args) + "\\n运行中...";
      }
      lastTool.appendChild(pre);
      lastTool._t0 = Date.now();
      lastTool._badge = badge;
      lastTool._brief = brief;
      lastTool._args = e.toolName === "todowrite" ? todoListText(e.args) : argsHtml(e.args);
      if (!liveWs.currentTurn) createTurn(liveWs);
      addToolToTurn(liveWs, liveWs.currentTurn, e);
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
      if (lastTool) {
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
  ta.placeholder = enterToSend
    ? "输入消息，按 Enter 发送，Shift+Enter 换行..."
    : "输入消息，按 Ctrl/Cmd+Enter 发送...";
}
function openSettings() {
  applySendMode();
  settingsBackdrop.hidden = false;
  optEnterSend.focus();
}
function closeSettings() { settingsBackdrop.hidden = true; }
settingsBtn.addEventListener("click", openSettings);
settingsClose.addEventListener("click", closeSettings);
settingsBackdrop.addEventListener("click", function (e) { if (e.target === settingsBackdrop) closeSettings(); });
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
    pendingAttachments.push({
      file: f,
      url: URL.createObjectURL(f),
      uploaded: false,
      id: "",
      name: f.name || ("image-" + (pendingAttachments.length + 1)),
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
      return String(err);
    });
  })).then(function (errs) {
    var firstErr = errs.filter(Boolean)[0];
    if (firstErr) throw new Error(firstErr);
  });
}

function updateSendState() {
  var hasText = ta.value.trim().length > 0;
  var hasAttach = pendingAttachments.length > 0;
  sendBtn.classList.toggle("can-send", !isBusy && (hasText || hasAttach));
  sendBtn.classList.toggle("stop", isBusy);
  sendBtn.title = isBusy ? "停止回答" : "发送";
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
  var text = ta.value.trim();
  if (!text && !pendingAttachments.length) return;
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
      sendBtn.disabled = false;
      if (r && r.error) { setStatus("err"); bubble("error", r.error); }
    })
    .catch(function (err) {
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
  var shouldSend = mod || (enterToSend && !ev.shiftKey);
  if (!shouldSend) return;
  ev.preventDefault();
  if (!isBusy) send();
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
      else if (active) bubble("user", "已保留正在执行的 run（" + active + " 条）。");
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
function fmtWorkTime(ts) {
  var d = new Date(ts);
  function p(n) { return n < 10 ? "0" + n : String(n); }
  return (d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}
function buildWorkItem(item) {
  var wrap = document.createElement("div");
  wrap.className = "work-item" + (currentWorkId === item.id ? " active" : "");
  wrap.setAttribute("data-work-id", item.id);
  wrap.title = item.title + "\\n更新于 " + fmtWorkTime(item.updatedAt);
  var badge = document.createElement("span");
  badge.className = "work-badge";
  var title = document.createElement("span");
  title.className = "work-title";
  title.textContent = item.title || "(未命名)";
  var actions = document.createElement("span");
  actions.className = "work-actions";
  var renBtn = document.createElement("button");
  renBtn.className = "work-act";
  renBtn.title = "重命名";
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
    renameWork(item.id, item.title || "");
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
        bubble("user", "已切换到工作项：" + ((data.work && data.work.title) || id));
      } else if (data && data.error) {
        showModal({ title: "打开失败", text: data.error, okText: "知道了" });
      }
    })
    .catch(function (err) { bubble("error", String(err)); });
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
      bubble("user", typeof m.content === "string" ? m.content : "", false, m.attachments);
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
        renderToolBlock(tr.toolName, call ? call.arguments : null, tr.content, !!tr.isError);
      }
    } else if (m.role === "toolResult") {
      renderToolBlock(m.toolName, null, m.content, !!m.isError);
    }
  }
  stickToBottom = true;
  scrollDown();
}
document.getElementById("btn-new-work").addEventListener("click", function () {
  showPrompt({
    title: "新建工作项",
    text: "给这个工作项起个名字，方便之后从列表里快速识别。留空则使用默认名称。",
    placeholder: "例如：重构登录模块",
    okText: "创建",
    required: false,
    onOk: function (title) {
      fetch("/api/works", {
        method: "POST",
        headers: { "content-type": "application/json", "x-agent-token": AGENT_TOKEN },
        body: JSON.stringify({ title: title })
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data && data.ok) {
            loadWorks();
            renderConversation([]);
            bubble("user", "已新建工作项" + (title ? "：" + title : "。"));
          } else if (data && data.error) {
            showModal({ title: "新建失败", text: data.error, okText: "知道了" });
          }
        })
        .catch(function (err) { bubble("error", String(err)); });
    }
  });
});
function renameWork(id, currentTitle) {
  showPrompt({
    title: "重命名工作项",
    placeholder: "输入新的工作项名称",
    okText: "保存",
    value: currentTitle,
    onOk: function (title) {
      fetch("/api/works/" + encodeURIComponent(id) + "/rename", {
        method: "POST",
        headers: { "content-type": "application/json", "x-agent-token": AGENT_TOKEN },
        body: JSON.stringify({ title: title })
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data && data.ok) loadWorks();
          else if (data && data.error) showModal({ title: "重命名失败", text: data.error, okText: "知道了" });
        })
        .catch(function (err) { bubble("error", String(err)); });
    }
  });
}
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

var es = new EventSource("/api/events?token=" + encodeURIComponent(AGENT_TOKEN));
var approvalBox = document.getElementById("approval");
var approvalText = document.getElementById("approval-text");
var approvalRequestId = null;

function answerApproval(mode) {
  if (!approvalRequestId) return;
  fetch("/api/approve", {
    method: "POST",
    headers: { "content-type": "application/json", "x-agent-token": AGENT_TOKEN },
    body: JSON.stringify({ requestId: approvalRequestId, mode: mode })
  }).then(function () { approvalBox.hidden = true; });
}
document.getElementById("approval-once").addEventListener("click", function () { answerApproval("once"); });
document.getElementById("approval-always").addEventListener("click", function () { answerApproval("always"); });
document.getElementById("approval-no").addEventListener("click", function () { answerApproval("deny"); });

es.addEventListener("message", function (ev) {
  var msg;
  try { msg = JSON.parse(ev.data); } catch (e) { return; }
  if (msg.kind === "event" || msg.kind === "replay") {
    if (msg.event.type === "agent_start") {
      if (msg.kind === "replay" && msg.runId) {
        var stale = convInner.querySelectorAll('[data-run="' + msg.runId + '"]');
        for (var pi = 0; pi < stale.length; pi++) stale[pi].remove();
      }
      currentRunId = null;
    }
    else if (msg.runId) { currentRunId = msg.runId; }
    handleLiveEvent(msg.event);
  }
  else if (msg.kind === "state") {
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
      renderConversation(msg.work.messages || []);
      if (msg.work.messages && msg.work.messages.length) {
        try { localStorage.setItem("tju.gui.conv", convInner.innerHTML); } catch (e) {}
      }
    }
    setStatus(msg.state && msg.state.isStreaming ? "busy" : "idle");
  }
  else if (msg.kind === "approval") {
    if (msg.request) {
      approvalRequestId = msg.request.requestId;
      approvalText.textContent = "工具 " + msg.request.toolName + " 将访问工作目录外的目录：\\n  " + msg.request.scopeDir + "\\n『总是允许』将在本次会话内记住该目录。";
      approvalBox.hidden = false;
    } else {
      approvalRequestId = null;
      approvalBox.hidden = true;
    }
  }
  else if (msg.kind === "error") { setStatus("err"); bubble("error", msg.message || "unknown error"); }
  else if (msg.kind === "works") { loadWorks(); }
});
es.onerror = function () { setStatus("err"); };
restoreState();`;