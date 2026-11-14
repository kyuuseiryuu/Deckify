/**
 * LanDeck Product Landing Page
 * Interactive Logic: Live Deck Simulator, Screenshot Tabs, Lightbox, FAQ, Web Audio Feedback
 */

document.addEventListener("DOMContentLoaded", () => {
  initStickyHeader();
  initMobileMenu();
  initDeckSimulator();
  initScreenshotShowcase();
  initFaqAccordion();
  initCopyButtons();
  initFetchLatestRelease();
});

/* ==========================================================================
   1. Sticky Header & Mobile Menu
   ========================================================================== */
function initStickyHeader() {
  const header = document.querySelector(".header-nav");
  if (!header) return;

  const onScroll = () => {
    if (window.scrollY > 20) {
      header.classList.add("scrolled");
    } else {
      header.classList.remove("scrolled");
    }
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

function initMobileMenu() {
  const btn = document.querySelector(".mobile-menu-btn");
  const navLinks = document.querySelector(".nav-links");
  if (!btn || !navLinks) return;

  btn.addEventListener("click", () => {
    navLinks.classList.toggle("open");
  });

  navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      navLinks.classList.remove("open");
    });
  });
}

/* ==========================================================================
   2. Web Audio Synthesized Click Sound (Zero External Asset Dependency)
   ========================================================================== */
let audioCtx = null;
function playKeyClickSound(frequency = 320, type = "sine") {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    if (!audioCtx) {
      audioCtx = new AudioContext();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, audioCtx.currentTime + 0.05);

    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.05);
  } catch (e) {
    // Audio context may fail if user hasn't interacted or policy prevents it, gracefully ignore
  }
}

/* ==========================================================================
   3. Interactive Live Deck Simulator
   ========================================================================== */
const SIMULATOR_PRESETS = {
  dev: [
    {
      id: "vscode",
      icon: "💻",
      label: "VS Code",
      sub: "启动应用",
      badge: "App",
      type: "app",
      actionDesc: "启动 Visual Studio Code 并激活窗口",
    },
    {
      id: "terminal",
      icon: "📟",
      label: "Terminal",
      sub: "呼出终端",
      badge: "Shell",
      type: "cmd",
      actionDesc: "执行 Shell 命令: open -a iTerm / wt.exe",
    },
    {
      id: "macro_push",
      icon: "🪄",
      label: "Git Sync",
      sub: "自动化宏",
      badge: "Macro",
      type: "macro",
      actionDesc: "自动化宏: Commit & Push (3个连续步骤)",
    },
    {
      id: "browser",
      icon: "🌐",
      label: "GitHub",
      sub: "打开网页",
      badge: "URL",
      type: "url",
      actionDesc: "默认浏览器打开: https://github.com/kyuuseiryuu/Deckify",
    },
    {
      id: "spotify",
      icon: "🎵",
      label: "Spotify",
      sub: "正在播放",
      badge: "Media",
      type: "media_toggle",
      actionDesc: "媒体控制: 播放 / 暂停切换",
    },
    {
      id: "mic",
      icon: "🎙️",
      label: "麦克风",
      sub: "通话静音",
      badge: "Hotkey",
      type: "mic_toggle",
      actionDesc: "触发全局快捷键: Ctrl + Shift + M (麦克风开关)",
    },
    {
      id: "cpu",
      label: "CPU 负荷",
      badge: "Monitor",
      type: "monitor_cpu",
      colSpan: 1,
    },
    {
      id: "ram",
      label: "物理内存",
      badge: "Monitor",
      type: "monitor_ram",
      colSpan: 1,
    },
    {
      id: "clean",
      icon: "🧹",
      label: "清屏/Lock",
      sub: "锁定电脑",
      badge: "Hotkey",
      type: "hotkey",
      actionDesc: "模拟系统快捷键: Win + L / Cmd + Ctrl + Q 锁定屏幕",
    },
    {
      id: "text_snippet",
      icon: "📝",
      label: "输入代码",
      sub: "文本填充",
      badge: "Text",
      type: "text",
      actionDesc: '模拟键盘自动录入: "npm run build && npm run tauri dev"',
    },
    {
      id: "theme",
      icon: "🌓",
      label: "深浅模式",
      sub: "主题切换",
      badge: "Theme",
      type: "theme_toggle",
      actionDesc: "桌面端系统主题切换: 深色/浅色模式",
    },
    {
      id: "switch_layout",
      icon: "🔀",
      label: "切换面板",
      sub: "影音预设",
      badge: "Switch",
      type: "switch_layout",
      actionDesc: "控制台导航: 切换到「影音与直播」布局",
    },
  ],
  media: [
    {
      id: "play_pause",
      icon: "⏯️",
      label: "播放 / 暂停",
      sub: "全局媒体",
      badge: "Media",
      type: "media_toggle",
      actionDesc: "发送多媒体键: PlayPause",
    },
    {
      id: "prev_track",
      icon: "⏮️",
      label: "上一首",
      sub: "切歌",
      badge: "Media",
      type: "media",
      actionDesc: "发送多媒体键: PreviousTrack",
    },
    {
      id: "next_track",
      icon: "⏭️",
      label: "下一首",
      sub: "切歌",
      badge: "Media",
      type: "media",
      actionDesc: "发送多媒体键: NextTrack",
    },
    {
      id: "mute",
      icon: "🔇",
      label: "静音切换",
      sub: "主音量",
      badge: "Media",
      type: "mute_toggle",
      actionDesc: "发送多媒体键: VolumeMute",
    },
    {
      id: "vol_up",
      icon: "🔊",
      label: "音量 +",
      sub: "增加 5%",
      badge: "Media",
      type: "media",
      actionDesc: "发送多媒体键: VolumeUp",
    },
    {
      id: "vol_down",
      icon: "🔉",
      label: "音量 -",
      sub: "减少 5%",
      badge: "Media",
      type: "media",
      actionDesc: "发送多媒体键: VolumeDown",
    },
    {
      id: "obs_rec",
      icon: "🔴",
      label: "OBS 录制",
      sub: "启动推流",
      badge: "Webhook",
      type: "cmd",
      actionDesc: "向 OBS WebSocket 发送推流/录屏指令",
    },
    {
      id: "screenshot",
      icon: "📸",
      label: "区域截屏",
      sub: "保存剪贴板",
      badge: "Hotkey",
      type: "hotkey",
      actionDesc: "模拟全局截屏组合键: Win+Shift+S / Cmd+Shift+4",
    },
    {
      id: "cpu",
      label: "CPU 监控",
      badge: "Monitor",
      type: "monitor_cpu",
      colSpan: 1,
    },
    {
      id: "ram",
      label: "内存 监控",
      badge: "Monitor",
      type: "monitor_ram",
      colSpan: 1,
    },
    {
      id: "apple_music",
      icon: "🎧",
      label: "Apple Music",
      sub: "呼出窗口",
      badge: "App",
      type: "app",
      actionDesc: "启动并置顶音乐客户端",
    },
    {
      id: "switch_back",
      icon: "💻",
      label: "返回开发",
      sub: "主面板",
      badge: "Switch",
      type: "switch_back",
      actionDesc: "控制台导航: 返回「开发效率」布局",
    },
  ],
  ops: [
    {
      id: "cpu_large",
      label: "CPU 核心负载",
      badge: "Monitor",
      type: "monitor_cpu",
      colSpan: 2,
    },
    {
      id: "ram_large",
      label: "物理内存已用",
      badge: "Monitor",
      type: "monitor_ram",
      colSpan: 2,
    },
    {
      id: "net_down",
      icon: "📥",
      label: "下载速率",
      sub: "12.8 MB/s",
      badge: "Net",
      type: "net",
      actionDesc: "实时局域网网络接口监测: 下行 12.8 MB/s",
    },
    {
      id: "net_up",
      icon: "📤",
      label: "上传速率",
      sub: "2.4 MB/s",
      badge: "Net",
      type: "net",
      actionDesc: "实时局域网网络接口监测: 上行 2.4 MB/s",
    },
    {
      id: "docker",
      icon: "🐳",
      label: "Docker PS",
      sub: "检查容器",
      badge: "Command",
      type: "cmd",
      actionDesc: "执行 Shell: docker ps --format 'table {{.Names}}\\t{{.Status}}'",
    },
    {
      id: "ping",
      icon: "📡",
      label: "Ping 网关",
      sub: "检测连通",
      badge: "Command",
      type: "cmd",
      actionDesc: "执行命令: ping -c 3 192.168.1.1 (延迟 2ms)",
    },
    {
      id: "disk",
      icon: "💾",
      label: "磁盘占用",
      sub: "SSD 64% Used",
      badge: "Monitor",
      type: "monitor_static",
      actionDesc: "存储挂载点扫描: 系统盘可用 180GB / 512GB",
    },
    {
      id: "temp",
      icon: "🌡️",
      label: "CPU 温度",
      sub: "48°C · 正常",
      badge: "Hardware",
      type: "monitor_static",
      actionDesc: "硬件传感器监测: 核心温度 48°C",
    },
    {
      id: "switch_dev",
      icon: "🔀",
      label: "切换回开发",
      sub: "主控台",
      badge: "Switch",
      type: "switch_dev",
      actionDesc: "控制台导航: 返回「开发效率」布局",
    },
    {
      id: "reboot_service",
      icon: "🔄",
      label: "重启服务",
      sub: "本地后端",
      badge: "Webhook",
      type: "cmd",
      actionDesc: "向本地后端发送重启命令: systemctl restart app",
    },
  ],
};

function initDeckSimulator() {
  const gridContainer = document.getElementById("sim-deck-grid");
  const logContent = document.getElementById("sim-log-content");
  const latencyBadge = document.getElementById("sim-log-latency");
  const tabButtons = document.querySelectorAll(".sim-tab-btn");

  if (!gridContainer || !logContent) return;

  let currentPreset = "dev";
  let isPlaying = true;
  let isMuted = false;
  let cpuPercent = 28;
  let ramPercent = 46;

  // Render buttons based on selected preset
  function renderPreset(presetKey) {
    currentPreset = presetKey;
    const items = SIMULATOR_PRESETS[presetKey] || SIMULATOR_PRESETS.dev;
    gridContainer.innerHTML = "";

    items.forEach((item) => {
      const keyEl = document.createElement("div");
      keyEl.className = "deck-key";
      if (item.colSpan === 2) {
        keyEl.classList.add("col-span-2");
      }
      keyEl.dataset.id = item.id;
      keyEl.dataset.type = item.type;

      // Special rendering for Monitor Tiles
      if (item.type.startsWith("monitor")) {
        renderMonitorTile(keyEl, item, cpuPercent, ramPercent);
      } else {
        keyEl.innerHTML = `
          <div class="key-icon-wrap">${item.icon || "⚡"}</div>
          <div style="display:flex;flex-direction:column;align-items:center;min-width:0;">
            <span class="key-label">${item.label}</span>
            <span class="key-subtext">${item.sub || ""}</span>
          </div>
          <span class="key-badge">${item.badge || "Key"}</span>
        `;
      }

      // Click Event
      keyEl.addEventListener("click", () => {
        handleKeyClick(item, keyEl);
      });

      gridContainer.appendChild(keyEl);
    });

    // Update active tab style
    tabButtons.forEach((btn) => {
      if (btn.dataset.preset === presetKey) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });
  }

  function renderMonitorTile(el, item, cpu, ram) {
    if (item.type === "monitor_cpu") {
      el.innerHTML = `
        <div class="monitor-gauge-wrap">
          <div style="display:flex;justify-content:space-between;font-size:0.75rem;font-weight:700;">
            <span style="display:flex;align-items:center;gap:4px;">📊 CPU</span>
            <span id="sim-cpu-val" style="color:#34d399;font-family:var(--font-mono);">${cpu}%</span>
          </div>
          <div class="gauge-bar-bg">
            <div id="sim-cpu-fill" class="gauge-bar-fill cpu" style="width: ${cpu}%;"></div>
          </div>
          <span style="font-size:0.68rem;color:var(--text-muted);margin-top:2px;">16 Cores · 3.8 GHz</span>
        </div>
        <span class="key-badge">Sys</span>
      `;
    } else if (item.type === "monitor_ram") {
      el.innerHTML = `
        <div class="monitor-gauge-wrap">
          <div style="display:flex;justify-content:space-between;font-size:0.75rem;font-weight:700;">
            <span style="display:flex;align-items:center;gap:4px;">🧠 RAM</span>
            <span id="sim-ram-val" style="color:#818cf8;font-family:var(--font-mono);">${ram}%</span>
          </div>
          <div class="gauge-bar-bg">
            <div id="sim-ram-fill" class="gauge-bar-fill ram" style="width: ${ram}%;"></div>
          </div>
          <span style="font-size:0.68rem;color:var(--text-muted);margin-top:2px;">7.4 / 16.0 GB</span>
        </div>
        <span class="key-badge">Sys</span>
      `;
    } else {
      el.innerHTML = `
        <div class="key-icon-wrap">${item.icon || "📈"}</div>
        <div style="display:flex;flex-direction:column;align-items:center;min-width:0;">
          <span class="key-label">${item.label}</span>
          <span class="key-subtext">${item.sub || ""}</span>
        </div>
        <span class="key-badge">${item.badge || "Sys"}</span>
      `;
    }
  }

  function handleKeyClick(item, keyEl) {
    // Tactile animation
    keyEl.classList.add("pressing");
    playKeyClickSound(380, "sine");

    setTimeout(() => {
      keyEl.classList.remove("pressing");
    }, 180);

    // Random latency between 1.2ms and 3.5ms
    const latency = (Math.random() * 2 + 1.2).toFixed(1);
    if (latencyBadge) {
      latencyBadge.textContent = `${latency}ms`;
    }

    // State toggles
    if (item.type === "media_toggle") {
      isPlaying = !isPlaying;
      const iconWrap = keyEl.querySelector(".key-icon-wrap");
      const subText = keyEl.querySelector(".key-subtext");
      if (iconWrap && subText) {
        iconWrap.textContent = isPlaying ? "⏸️" : "▶️";
        subText.textContent = isPlaying ? "正在播放" : "已暂停";
      }
      logContent.textContent = isPlaying
        ? "媒体状态: 播放中 (Cyberpunk 2077 - I Really Want to Stay At Your House)"
        : "媒体状态: 已暂停播放";
      return;
    }

    if (item.type === "mic_toggle" || item.type === "mute_toggle") {
      isMuted = !isMuted;
      const iconWrap = keyEl.querySelector(".key-icon-wrap");
      const subText = keyEl.querySelector(".key-subtext");
      if (iconWrap && subText) {
        iconWrap.textContent = isMuted ? "🔴" : "🎙️";
        subText.textContent = isMuted ? "已静音 (Muted)" : "正常通话";
      }
      logContent.textContent = isMuted
        ? "系统全局麦克风已切为【静音】状态"
        : "系统全局麦克风已解除静音";
      return;
    }

    if (item.type === "switch_layout") {
      renderPreset("media");
      logContent.textContent = "面板切换: 已载入「影音与直播」预设面板";
      return;
    }

    if (item.type === "switch_back" || item.type === "switch_dev") {
      renderPreset("dev");
      logContent.textContent = "面板切换: 已返回「开发效率」主控制面板";
      return;
    }

    if (item.type === "macro") {
      simulateMacroExecution();
      return;
    }

    // Default log message
    logContent.textContent = `已执行动作: ${item.actionDesc || item.label}`;
  }

  function simulateMacroExecution() {
    logContent.textContent = "🪄 宏指令运行中: [1/3] 激活终端窗口...";
    setTimeout(() => {
      logContent.textContent = "🪄 宏指令运行中: [2/3] 模拟输入 git commit -am 'update'...";
      setTimeout(() => {
        logContent.textContent = "🪄 宏指令运行完成: [3/3] 触发 git push (执行耗时 12ms)";
      }, 350);
    }, 300);
  }

  // Periodic Telemetry Simulation
  setInterval(() => {
    // Fluctuating values
    cpuPercent = Math.min(92, Math.max(12, cpuPercent + Math.floor(Math.random() * 9 - 4)));
    ramPercent = Math.min(88, Math.max(38, ramPercent + Math.floor(Math.random() * 5 - 2)));

    const cpuValEl = document.getElementById("sim-cpu-val");
    const cpuFillEl = document.getElementById("sim-cpu-fill");
    if (cpuValEl && cpuFillEl) {
      cpuValEl.textContent = `${cpuPercent}%`;
      cpuFillEl.style.width = `${cpuPercent}%`;
      if (cpuPercent > 75) {
        cpuValEl.style.color = "#f43f5e";
      } else if (cpuPercent > 50) {
        cpuValEl.style.color = "#fbbf24";
      } else {
        cpuValEl.style.color = "#34d399";
      }
    }

    const ramValEl = document.getElementById("sim-ram-val");
    const ramFillEl = document.getElementById("sim-ram-fill");
    if (ramValEl && ramFillEl) {
      ramValEl.textContent = `${ramPercent}%`;
      ramFillEl.style.width = `${ramPercent}%`;
    }
  }, 2000);

  // Tab click listeners
  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const preset = btn.dataset.preset;
      renderPreset(preset);
      logContent.textContent = `已切换布局面板: ${btn.textContent.trim()}`;
    });
  });

  // Initial render
  renderPreset("dev");
}

/* ==========================================================================
   4. Screenshots Showcase & Lightbox Modal
   ========================================================================== */
const SCREENSHOT_DATA = {
  home: {
    src: "./screenshots/home.png",
    title: "首页与网络配对管理",
    desc: "桌面端自动侦测局域网所有活动网卡 IP 与端口，一键切换。动态生成配对二维码与配对码，实时展示当前已接入设备状态与在线数量。",
  },
  apps: {
    src: "./screenshots/editor-apps.png",
    title: "布局编辑器 · 本地应用识别与纯净图标提取",
    desc: "内置系统原生图标提取引擎，自动扫描并呈现 Windows / macOS 所有已安装应用，纯净无快捷方式角标，一键快速绑定到任意按键网格。",
  },
  widgets: {
    src: "./screenshots/editor-widgets.png",
    title: "布局编辑器 · 丰富快捷组件与系统监控",
    desc: "内置快捷键模拟、文本自动输入、多媒体与音量控制，以及每 1.5 秒更新的高清 CPU / 内存 / 网络吞吐速率监控看板。",
  },
};

function initScreenshotShowcase() {
  const tabs = document.querySelectorAll(".screen-tab-btn");
  const imgEl = document.getElementById("screen-main-img");
  const titleEl = document.getElementById("screen-caption-title");
  const descEl = document.getElementById("screen-caption-desc");
  const imgWrap = document.querySelector(".screen-image-wrap");
  const lightbox = document.getElementById("lightbox-modal");
  const lightboxImg = document.getElementById("lightbox-img");
  const lightboxClose = document.getElementById("lightbox-close");

  if (!tabs.length || !imgEl) return;

  function setScreenshot(key) {
    const data = SCREENSHOT_DATA[key];
    if (!data) return;

    imgEl.style.opacity = "0.4";
    setTimeout(() => {
      imgEl.src = data.src;
      imgEl.alt = data.title;
      if (titleEl) titleEl.textContent = data.title;
      if (descEl) descEl.textContent = data.desc;
      imgEl.style.opacity = "1";
    }, 120);

    tabs.forEach((tab) => {
      if (tab.dataset.screen === key) {
        tab.classList.add("active");
      } else {
        tab.classList.remove("active");
      }
    });
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      setScreenshot(tab.dataset.screen);
    });
  });

  // Lightbox opening
  if (imgWrap && lightbox && lightboxImg) {
    imgWrap.addEventListener("click", () => {
      lightboxImg.src = imgEl.src;
      lightbox.classList.add("open");
    });

    const closeLightbox = () => {
      lightbox.classList.remove("open");
    };

    if (lightboxClose) {
      lightboxClose.addEventListener("click", closeLightbox);
    }

    lightbox.addEventListener("click", (e) => {
      if (e.target === lightbox) {
        closeLightbox();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && lightbox.classList.contains("open")) {
        closeLightbox();
      }
    });
  }
}

/* ==========================================================================
   5. FAQ Accordion
   ========================================================================== */
function initFaqAccordion() {
  const faqItems = document.querySelectorAll(".faq-item");

  faqItems.forEach((item) => {
    const questionBtn = item.querySelector(".faq-question");
    if (!questionBtn) return;

    questionBtn.addEventListener("click", () => {
      const isActive = item.classList.contains("active");

      // Optional: close other items
      faqItems.forEach((other) => {
        if (other !== item) other.classList.remove("active");
      });

      if (isActive) {
        item.classList.remove("active");
      } else {
        item.classList.add("active");
      }
    });
  });
}

/* ==========================================================================
   6. Code Snippet Copy
   ========================================================================== */
function initCopyButtons() {
  const copyButtons = document.querySelectorAll(".btn-copy");

  copyButtons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const codeText = btn.dataset.copy;
      if (!codeText) return;

      try {
        await navigator.clipboard.writeText(codeText);
        const originalHtml = btn.innerHTML;
        btn.innerHTML = `<span style="color:#34d399;font-size:0.78rem;">✓ 已复制</span>`;
        setTimeout(() => {
          btn.innerHTML = originalHtml;
        }, 2000);
      } catch (err) {
        console.error("Failed to copy:", err);
      }
    });
  });
}

/* ==========================================================================
   7. Dynamic Release Tag Fetching (GitHub API with Fallback)
   ========================================================================== */
async function initFetchLatestRelease() {
  const repo = "kyuuseiryuu/Deckify";
  const tagElements = document.querySelectorAll(".release-version-tag");
  const winDownloadBtn = document.getElementById("btn-download-win");
  const macDownloadBtn = document.getElementById("btn-download-mac");

  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: "application/vnd.github.v3+json" },
    });
    if (!response.ok) return;

    const data = await response.json();
    const tagName = data.tag_name || "v1.1.1";
    const cleanVer = tagName.replace(/^v/, "");

    // Update version badge in page
    tagElements.forEach((el) => {
      el.textContent = tagName;
    });

    // Check release assets
    if (data.assets && Array.isArray(data.assets)) {
      const winAsset = data.assets.find(
        (a) => a.name.endsWith(".exe") || a.name.includes("setup")
      );
      if (winAsset && winDownloadBtn) {
        winDownloadBtn.href = winAsset.browser_download_url;
      }

      const macAsset = data.assets.find(
        (a) => a.name.endsWith(".dmg") || a.name.includes("universal")
      );
      if (macAsset && macDownloadBtn) {
        macDownloadBtn.href = macAsset.browser_download_url;
      }
    }
  } catch (e) {
    // Graceful fallback to static v1.1.1 URLs defined in HTML
  }
}
