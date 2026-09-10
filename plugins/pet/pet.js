(function () {
	"use strict";
	if (window.__tjuPetLoaded) return;
	window.__tjuPetLoaded = true;

	const ASSET = (name) => `/plugins/pet/assets/${name}.webp`;

	const SPRITES = {
		idle: ASSET("deepseek-idle"),
		relaxed: ASSET("reaction-relaxed"),
		cheerful: ASSET("reaction-cheerful"),
		proud: ASSET("reaction-proud"),
		thinking: ASSET("reaction-thinking"),
		"frame-thinking-keypress": ASSET("frame-thinking-keypress"),
		"desk-coding": ASSET("reaction-desk-coding"),
		"desk-confused": ASSET("reaction-desk-confused"),
		"deepseek-pressure": ASSET("reaction-deepseek-pressure"),
		skeptical: ASSET("reaction-skeptical"),
		"desk-done": ASSET("reaction-desk-done"),
		"desk-facepalm": ASSET("reaction-desk-facepalm"),
		cheerful2: ASSET("reaction-cheerful"),
		shocked: ASSET("reaction-shocked"),
		apologetic: ASSET("reaction-apologetic"),
		crying: ASSET("reaction-crying"),
		eating: ASSET("reaction-eating-rice"),
		rice: ASSET("reaction-deepseek-rice"),
		sleepy: ASSET("reaction-sleepy"),
		sleeping: ASSET("reaction-sleeping"),
		hungry: ASSET("reaction-hungry"),
		angry: ASSET("reaction-angry"),
	};

	const TOOL_LABELS = {
		bash: "敲终端...",
		read: "读文件...",
		write: "写代码...",
		edit: "改代码...",
		apply_patch: "改代码...",
		grep: "搜索中...",
		fetch: "查资料...",
		scan: "安全扫描...",
		todowrite: "整理计划...",
		task: "委派子任务...",
	};

	const TOOL_SPRITES = {
		bash: "desk-coding",
		read: "thinking",
		write: "desk-coding",
		edit: "desk-coding",
		apply_patch: "desk-coding",
		grep: "skeptical",
		fetch: "skeptical",
		scan: "skeptical",
		todowrite: "thinking",
		task: "thinking",
	};

	const PHASE_SPRITES = {
		idle: ["idle", "relaxed", "cheerful", "proud"],
		thinking: ["thinking", "frame-thinking-keypress"],
		working: ["desk-coding", "thinking"],
		speaking: ["desk-coding", "thinking", "skeptical"],
		success: ["cheerful", "proud", "desk-done"],
		error: ["shocked", "apologetic", "desk-facepalm"],
	};

	const STORAGE_KEY = "tju-pet-pos";
	const SCALE_KEY = "tju-pet-scale";
	const IDLE_THRESHOLD = 5 * 60 * 1000;
	const SLEEP_THRESHOLD = 15 * 60 * 1000;

	let root = null;
	let spriteImg = null;
	let bubbleEl = null;
	let bubbleText = null;
	let bubbleDetail = null;
	let phase = 0;
	let currentExpression = "";
	let petState = "";
	let stateLabel = "";
	let stateDetail = "";
	let lastActivity = Date.now();
	let idleTimer = null;
	let phaseTimer = null;
	let bubbleTimer = null;
	let sseSource = null;
		let activeTools = [];
		let lastTurnStart = 0;
		let suppressSave = false;
		let spokeOnThisTurn = false;

	function getSavedPos() {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (raw) return JSON.parse(raw);
		} catch {}
		return null;
	}

	function savePos(x, y) {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify({ x, y }));
		} catch {}
	}

	function getSavedScale() {
		try {
			const raw = localStorage.getItem(SCALE_KEY);
			if (raw) return Number(raw);
		} catch {}
		return 1;
	}

	function saveScale(s) {
		try {
			localStorage.setItem(SCALE_KEY, String(s));
		} catch {}
	}

	function clampOffset(cx, cy, vw, vh) {
		const w = 260, h = 300, m = 8;
		const minX = m - cx, maxX = vw - w + cx;
		const minY = m - cy, maxY = vh - h + cy;
		return { x: Math.max(minX, Math.min(maxX, cx)), y: Math.max(minY, Math.min(maxY, cy)) };
	}

	function ensureRoot() {
		if (root) return root;
		root = document.createElement("div");
		root.id = "tju-pet-root";
		root.innerHTML = `
			<style>${PET_CSS}</style>
			<div class="tju-pet-bubble" id="tju-pet-bubble">
				<span class="tju-pet-bubble-text" id="tju-pet-bubble-text"></span>
				<small class="tju-pet-bubble-detail" id="tju-pet-bubble-detail"></small>
			</div>
			<div class="tju-pet-stage">
				<img class="tju-pet-sprite" id="tju-pet-sprite" draggable="false" />
			</div>
		`;
		document.body.appendChild(root);

		spriteImg = root.querySelector("#tju-pet-sprite");
		bubbleEl = root.querySelector("#tju-pet-bubble");
		bubbleText = root.querySelector("#tju-pet-bubble-text");
		bubbleDetail = root.querySelector("#tju-pet-bubble-detail");
		bubbleEl.dataset.visible = "true";

		const saved = getSavedPos();
		const vw = window.innerWidth, vh = window.innerHeight;
		if (saved) {
			const clamped = clampOffset(saved.x, saved.y, vw, vh);
			root.style.left = clamped.x + "px";
			root.style.top = clamped.y + "px";
		} else {
			root.style.left = "18px";
			root.style.top = (vh - 300 - 14) + "px";
		}

		const scale = getSavedScale();
		root.style.setProperty("--tju-pet-scale", scale);
		enableDrag(root);
		startPhaseTimer();
		return root;
	}

	function enableDrag(el) {
		let dragging = false, startX, startY, origX, origY, offsetX, offsetY;
		const onDown = (e) => {
			if (e.button !== 0) return;
			const rect = el.getBoundingClientRect();
			startX = e.clientX;
			startY = e.clientY;
			origX = rect.left;
			origY = rect.top;
			offsetX = e.clientX - rect.left;
			offsetY = e.clientY - rect.top;
			dragging = true;
			// 首次点击时，元素可能仍由 right/bottom 定位（而非 left/top）。
			// 先把当前渲染位置转写为 left/top 定位，保证切换定位方式时位置不跳变。
			el.style.right = "auto";
			el.style.bottom = "auto";
			el.style.left = rect.left + "px";
			el.style.top = rect.top + "px";
			el.style.cursor = "grabbing";
			e.preventDefault();
		};
		const onMove = (e) => {
			if (!dragging) return;
			const vw = window.innerWidth, vh = window.innerHeight;
			const clamped = clampOffset(e.clientX - offsetX, e.clientY - offsetY, vw, vh);
			el.style.left = clamped.x + "px";
			el.style.top = clamped.y + "px";
		};
		const onUp = () => {
			if (!dragging) return;
			dragging = false;
			el.style.cursor = "grab";
			const rect = el.getBoundingClientRect();
			savePos(rect.left, rect.top);
		};
		el.addEventListener("mousedown", onDown);
		window.addEventListener("mousemove", onMove);
		window.addEventListener("mouseup", onUp);

		el.addEventListener("wheel", (e) => {
			e.preventDefault();
			const current = getSavedScale();
			const next = Math.max(0.65, Math.min(1.4, Math.round((current - e.deltaY * 0.0012) * 100) / 100));
			el.style.setProperty("--tju-pet-scale", next);
			saveScale(next);
		}, { passive: false });
	}

	function startPhaseTimer() {
		if (phaseTimer) clearInterval(phaseTimer);
		phaseTimer = setInterval(() => {
			if (petState === "idle" || petState === "thinking" || petState === "working" || petState === "speaking") {
				phase++;
				applyExpression();
			}
		}, 12000);
	}

	function applyExpression() {
		const sprites = PHASE_SPRITES[petState] || PHASE_SPRITES.idle;
		const idx = ((Math.trunc(phase) % sprites.length) + sprites.length) % sprites.length;
		const expr = sprites[idx];
		if (SPRITES[expr]) {
			currentExpression = expr;
			spriteImg.src = SPRITES[expr];
		}
	}

	function setBubble(label, detail, stream) {
		if (!root) return;
		bubbleText.textContent = label || "";
		bubbleDetail.textContent = detail || "";
		bubbleEl.dataset.visible = label ? "true" : "false";
		bubbleEl.dataset.stream = stream ? "true" : "false";
		if (bubbleTimer) clearTimeout(bubbleTimer);
		bubbleTimer = null;
		if (label && (petState === "success" || petState === "error")) {
			const delay = petState === "success" ? 5000 : 3000;
			bubbleTimer = setTimeout(() => {
				bubbleEl.dataset.visible = "false";
			}, delay);
		}
	}

	function transitionTo(state, label, detail) {
		if (state === petState && label === stateLabel) return;
		petState = state;
		stateLabel = label;
		stateDetail = detail || "";
		phase = 0;
		lastActivity = Date.now();
		applyExpression();
		setBubble(label, detail, state === "speaking");
		updateVisibility();
	}

	function updateVisibility() {
		if (!root) return;
		root.style.opacity = petState === "idle" ? "0.6" : "1";
	}

	function startIdleCheck() {
		if (idleTimer) clearInterval(idleTimer);
		idleTimer = setInterval(() => {
			const elapsed = Date.now() - lastActivity;
			if (petState !== "idle") return;
			if (elapsed >= SLEEP_THRESHOLD) {
				transitionTo("sleeping", "zzZ...", "睡着了~");
				spriteImg.src = SPRITES.sleeping;
			} else if (elapsed >= IDLE_THRESHOLD) {
				transitionTo("sleepy", "好困...", "打个盹~");
				spriteImg.src = SPRITES.sleepy;
			}
		}, 30000);
	}

	function handleEvent(e) {
		if (!e || !e.type) return;
		lastActivity = Date.now();

		switch (e.type) {
			case "agent_start":
				ensureRoot();
				phase = 0;
				transitionTo("thinking", "收到任务", "开始工作~");
				root.style.opacity = "1";
				break;

			case "agent_end":
				if (activeTools.length === 0) {
					transitionTo("success", "完成!", "搞定啦~");
					setTimeout(() => {
						transitionTo("idle", "", "");
						updateVisibility();
					}, 5000);
				}
				activeTools = [];
				break;

			case "turn_start":
				phase = 0;
				spokeOnThisTurn = false;
				transitionTo("thinking", "分析中...", "让我想想...");
				break;

			case "turn_end":
				break;

			case "message_start":
				break;

			case "message_update":
				if (e.message?.role === "assistant" && Array.isArray(e.message?.content)) {
					const text = e.message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
					if (text) {
						if (!spokeOnThisTurn) {
							spokeOnThisTurn = true;
							phase = 0;
							transitionTo("speaking", "写回答中...", "");
						}
						const tail = text.slice(-80).replace(/\s+/g, " ").trim();
						setBubble("写回答中...", tail, true);
					}
				}
				break;

			case "message_end":
				if (e.message?.role === "assistant") {
					if (e.message?.stopReason === "error") {
						transitionTo("error", "出错了!", e.message?.errorMessage || "运行异常");
						spriteImg.src = SPRITES.shocked;
					} else {
						transitionTo("success", "完成!", "");
						setTimeout(() => {
							if (petState === "success") {
								transitionTo("idle", "", "");
								updateVisibility();
							}
						}, 4000);
					}
				}
				break;

			case "tool_start": {
				const name = e.tool?.name || "tool";
				const label = TOOL_LABELS[name] || `使用 ${name}...`;
				const sprite = TOOL_SPRITES[name] || "desk-coding";
				activeTools.push({ name, id: e.toolCallId });
				transitionTo("working", label, name);
				if (SPRITES[sprite]) spriteImg.src = SPRITES[sprite];
				break;
			}

			case "tool_end": {
				const idx = activeTools.findIndex((t) => t.id === e.toolCallId);
				if (idx >= 0) activeTools.splice(idx, 1);
				if (e.isError) {
					transitionTo("error", "工具出错", e.tool?.name || "tool");
					spriteImg.src = SPRITES.shocked;
					setTimeout(() => {
						if (petState === "error") transitionTo("working", "继续工作...", "");
					}, 3000);
				} else if (activeTools.length === 0) {
					transitionTo("thinking", "处理中...", "");
				}
				break;
			}
		}
	}

	function initSSE() {
		const tokenMeta = document.querySelector('meta[name="agent-token"]');
		const token = tokenMeta?.content || window.__AGENT_TOKEN__ || "";
		if (!token) {
			console.warn("[tju-pet] no agent token found, retrying...");
			setTimeout(initSSE, 1000);
			return;
		}

		sseSource = new EventSource("/api/events?token=" + encodeURIComponent(token));
		sseSource.onmessage = (ev) => {
			try {
				const msg = JSON.parse(ev.data);
				if (msg.kind === "event" || msg.kind === "replay") {
					handleEvent(msg.event);
				}
			} catch {}
		};
		sseSource.onerror = () => {
			setTimeout(initSSE, 5000);
		};
	}

	function boot() {
		const init = () => {
			ensureRoot();
			transitionTo("idle", "等待任务", "准备就绪~");
			initSSE();
			startIdleCheck();
		};
		if (document.readyState === "loading") {
			document.addEventListener("DOMContentLoaded", init);
		} else {
			init();
		}
	}

	boot();
})();

const PET_CSS = `
#tju-pet-root {
	position: fixed;
	left: 18px;
	bottom: 14px;
	z-index: 99999;
	display: grid;
	justify-items: center;
	width: 260px;
	pointer-events: none;
	filter: drop-shadow(0 12px 24px rgba(0, 12, 36, 0.18));
	font: 500 11px/1.45 ui-rounded, "SF Pro Rounded", "PingFang SC", system-ui, sans-serif;
	transition: opacity 0.4s ease;
	transform: scale(var(--tju-pet-scale, 1));
	transform-origin: 100% 100%;
}
#tju-pet-root * { box-sizing: border-box; }

.tju-pet-bubble {
	position: relative;
	z-index: 3;
	width: 240px;
	max-height: 100px;
	margin: 0 0 -12px;
	padding: 10px 13px;
	border: 1px solid rgba(255, 255, 255, 0.12);
	border-radius: 14px 14px 5px 14px;
	background: rgba(17, 29, 53, 0.88);
	backdrop-filter: blur(14px);
	box-shadow: 0 8px 24px rgba(3, 15, 40, 0.16);
	color: #eff7ff;
	text-align: left;
	overflow: hidden;
	pointer-events: auto;
	transform-origin: 80% 100%;
	animation: tju-pet-pop 0.35s cubic-bezier(0.2, 0.8, 0.25, 1.15);
	transition: max-height 0.3s ease, margin 0.3s ease, padding 0.3s ease, opacity 0.25s ease, transform 0.3s ease;
}
.tju-pet-bubble[data-visible="false"] {
	max-height: 0;
	margin-bottom: 0;
	padding-top: 0;
	padding-bottom: 0;
	border-width: 0;
	opacity: 0;
	transform: translateY(6px) scale(0.96);
}
.tju-pet-bubble-text {
	display: block;
	font-weight: 700;
	font-size: 12px;
}
.tju-pet-bubble-detail {
	display: block;
	max-height: 56px;
	margin-top: 3px;
	overflow: auto;
	color: rgba(129, 148, 182, 0.9);
	font-size: 9px;
	white-space: pre-wrap;
	scrollbar-width: thin;
}
.tju-pet-bubble[data-stream="true"] small {
	overflow-x: auto;
	overflow-y: hidden;
	color: rgba(184, 199, 223, 0.85);
	white-space: nowrap;
	scrollbar-width: none;
}

.tju-pet-stage {
	position: relative;
	width: 240px;
	height: 220px;
}
.tju-pet-sprite {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	object-fit: contain;
	filter: drop-shadow(0 10px 8px rgba(0, 10, 34, 0.18));
	cursor: grab;
	pointer-events: auto;
	touch-action: none;
	transition: opacity 0.3s ease;
	user-select: none;
}
.tju-pet-sprite:active { cursor: grabbing; }
.tju-pet-sprite::before {
	position: absolute;
	inset: auto 12px 10px;
	height: 44px;
	border-radius: 50%;
	background: radial-gradient(ellipse, rgba(85, 148, 241, 0.22), transparent 68%);
	content: "";
	filter: blur(8px);
}

@keyframes tju-pet-pop {
	from { opacity: 0; transform: translateY(4px) scale(0.95); }
}
@media (prefers-reduced-motion: reduce) {
	#tju-pet-root *,
	#tju-pet-root *::before {
		animation-duration: 0.01ms !important;
		animation-iteration-count: 1 !important;
		transition-duration: 0.01ms !important;
	}
}
`;
