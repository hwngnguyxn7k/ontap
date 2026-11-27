// =========================================================================
// 1. KHỞI TẠO DỮ LIỆU CHUNG (ĐỌC TỪ FILE DATA CỦA TỪNG MÔN)
// Yêu cầu nạp file dữ liệu môn học (triet-data.js hoặc pl-shtt-data.js) trước file này.
// =========================================================================

// Chuyển đổi dữ liệu gọn sang mảng đối tượng chuẩn để xử lý nhanh
const QUESTIONS = RAW_QUESTIONS.map(([id, part, q, opts, ans, exp]) => ({
  id, part, q, opts, ans, exp
}));

const LETTERS = ['A', 'B', 'C', 'D'];
const PAGE_SIZE = 20;

// Đường dẫn tương đối sạch sẽ cho GitHub Pages (đặt meo.jpg cùng thư mục với các file .html)
const CAT_IMAGE_SRC = './meo.jpg';

    // =========================================================================
    // 2. TRẠNG THÁI ỨNG DỤNG & LƯU TRỮ AN TOÀN (TRY...CATCH)
    // =========================================================================
    let state = {
      mode: 'study',
      partFilter: 'all',
      statusFilter: 'all',
      search: '',
      showAllAnswers: false,
      page: 1,
      userAnswers: {},
      bookmarks: [],
      comboStreak: 0
    };

    let prefs = {
      darkMode: false,
      catEnabled: true
    };

    let examHistory = [];

    let exam = {
      status: 'intro',
      sourceKey: 'all',
      questions: [],
      answers: {},
      currentIndex: 0,
      timeLeft: 60 * 60,
      durationUsed: 0,
      timerId: null,
      reviewFilter: 'all'
    };

    let historyViewState = {
      selectedAttemptId: null,
      detailFilter: 'all'
    };

    let modalCallback = null;
    let toastTimer = null;

    function loadAllFromStorage() {
      // 1. Nạp tiến độ ôn tập
      try {
        const raw = localStorage.getItem(STORAGE_PRACTICE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            if (parsed.userAnswers && typeof parsed.userAnswers === 'object' && !Array.isArray(parsed.userAnswers)) {
              state.userAnswers = parsed.userAnswers;
            }
            if (Array.isArray(parsed.bookmarks)) {
              state.bookmarks = parsed.bookmarks.filter((id) => typeof id === 'number');
            }
            if (typeof parsed.comboStreak === 'number' && parsed.comboStreak >= 0) {
              state.comboStreak = parsed.comboStreak;
            }
            if (typeof parsed.partFilter === 'string' && PART_META[parsed.partFilter]) {
              state.partFilter = parsed.partFilter;
            }
            if (['all', 'unanswered', 'correct', 'wrong', 'star'].includes(parsed.statusFilter)) {
              state.statusFilter = parsed.statusFilter;
            }
            if (typeof parsed.showAllAnswers === 'boolean') {
              state.showAllAnswers = parsed.showAllAnswers;
            }
            if (typeof parsed.page === 'number' && parsed.page >= 1) {
              state.page = parsed.page;
            }
          }
        }
      } catch (err) {
        console.warn('Không thể đọc tiến độ ôn tập từ localStorage, dùng mặc định:', err);
      }

      // 2. Nạp lịch sử thi thử
      try {
        const rawHist = localStorage.getItem(STORAGE_HISTORY_KEY);
        if (rawHist) {
          const parsedHist = JSON.parse(rawHist);
          if (Array.isArray(parsedHist)) {
            examHistory = parsedHist.filter((item) => item && typeof item === 'object' && Array.isArray(item.questions));
          }
        }
      } catch (err) {
        console.warn('Không thể đọc lịch sử thi thử từ localStorage, dùng mặc định:', err);
        examHistory = [];
      }

      // 3. Nạp tùy chọn giao diện (Dark Mode, Mèo bay)
      try {
        const rawPrefs = localStorage.getItem(STORAGE_SETTINGS_KEY);
        if (rawPrefs) {
          const parsedPrefs = JSON.parse(rawPrefs);
          if (parsedPrefs && typeof parsedPrefs === 'object') {
            if (typeof parsedPrefs.darkMode === 'boolean') prefs.darkMode = parsedPrefs.darkMode;
            if (typeof parsedPrefs.catEnabled === 'boolean') prefs.catEnabled = parsedPrefs.catEnabled;
          }
        }
      } catch (err) {
        console.warn('Không thể đọc cài đặt giao diện từ localStorage:', err);
      }
    }

    function savePracticeState() {
      try {
        localStorage.setItem(STORAGE_PRACTICE_KEY, JSON.stringify({
          userAnswers: state.userAnswers,
          bookmarks: state.bookmarks,
          comboStreak: state.comboStreak,
          partFilter: state.partFilter,
          statusFilter: state.statusFilter,
          showAllAnswers: state.showAllAnswers,
          page: state.page
        }));
      } catch (err) {
        console.warn('Lỗi lưu tiến độ ôn tập:', err);
      }
    }

    function saveExamHistory() {
      try {
        localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(examHistory));
      } catch (err) {
        console.warn('Lỗi lưu lịch sử thi thử:', err);
      }
    }

    function savePrefs() {
      try {
        localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(prefs));
      } catch (err) {
        console.warn('Lỗi lưu cài đặt giao diện:', err);
      }
    }

    // =========================================================================
    // 3. ÂM THANH WEB AUDIO API, HẠT LẤP LÁNH, PHÁO GIẤY & ĐẾM ĐIỂM
    // =========================================================================

    // Cập nhật đồng hồ Giờ : Phút : Giây • Thứ, Ngày/Tháng/Năm ở giữa trên cùng (cố định độ rộng số)
    function updateLiveDateTime() {
      const timeEl = document.getElementById('live-time-text');
      const dateEl = document.getElementById('live-date-text');
      const fallbackEl = document.getElementById('live-datetime-text');
      const now = new Date();
      const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
      const pad = (n) => String(n).padStart(2, '0');
      const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      const dayName = days[now.getDay()];
      const dateStr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
      if (timeEl && dateEl) {
        timeEl.textContent = timeStr;
        dateEl.textContent = `${dayName}, ${dateStr}`;
      } else if (fallbackEl) {
        fallbackEl.textContent = `${timeStr} • ${dayName}, ${dateStr}`;
      }
    }

    // Hiệu ứng gợn sóng + tia hạt khi click chuột ở bất kỳ đâu
    function spawnGlobalClickEffect(x, y) {
      if (typeof x !== 'number' || typeof y !== 'number') return;

      const ring = document.createElement('span');
      ring.className = 'click-ripple-ring';
      ring.style.left = `${x}px`;
      ring.style.top = `${y}px`;
      document.body.appendChild(ring);

      ring.animate([
        { transform: 'scale(0.4)', opacity: 0.95 },
        { transform: 'scale(3.4)', opacity: 0 }
      ], {
        duration: 460,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)'
      }).onfinish = () => ring.remove();

      const colors = ['#2563eb', '#38bdf8', '#818cf8', '#f59e0b'];
      const dotCount = 6;
      for (let i = 0; i < dotCount; i++) {
        const dot = document.createElement('span');
        dot.className = 'click-ripple-dot';
        dot.style.left = `${x}px`;
        dot.style.top = `${y}px`;
        dot.style.backgroundColor = colors[i % colors.length];
        document.body.appendChild(dot);

        const angle = (Math.PI * 2 * i) / dotCount + (Math.random() - 0.5) * 0.35;
        const dist = 16 + Math.random() * 18;
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist;

        dot.animate([
          { transform: 'translate(0, 0) scale(1)', opacity: 0.9 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.15)`, opacity: 0 }
        ], {
          duration: 380 + Math.random() * 120,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)'
        }).onfinish = () => dot.remove();
      }
    }

    document.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      spawnGlobalClickEffect(e.clientX, e.clientY);
    }, { passive: true });

    // Hiệu ứng pháo giấy trên Canvas
    let confettiAnimId = null;
    function launchConfetti() {
      const canvas = document.getElementById('confetti-canvas');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;

      const palette = ['#2563eb', '#16a34a', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'];
      const pieces = Array.from({ length: 110 }, () => ({
        x: Math.random() * canvas.width,
        y: -20 - Math.random() * 180,
        w: 6 + Math.random() * 6,
        h: 4 + Math.random() * 5,
        vx: (Math.random() - 0.5) * 3.5,
        vy: 2.5 + Math.random() * 3.8,
        rot: Math.random() * 360,
        vRot: (Math.random() - 0.5) * 10,
        color: palette[Math.floor(Math.random() * palette.length)]
      }));

      const start = performance.now();
      cancelAnimationFrame(confettiAnimId);

      function frame(now) {
        const elapsed = now - start;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        let alive = 0;
        for (const p of pieces) {
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.04;
          p.rot += p.vRot;
          if (p.y < canvas.height + 30) alive++;

          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate((p.rot * Math.PI) / 180);
          ctx.fillStyle = p.color;
          ctx.globalAlpha = Math.max(0, 1 - elapsed / 3600);
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          ctx.restore();
        }

        if (elapsed < 3600 && alive > 0) {
          confettiAnimId = requestAnimationFrame(frame);
        } else {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }

      confettiAnimId = requestAnimationFrame(frame);
    }

    // Hiệu ứng chạy số điểm từ 0 lên điểm thực tế
    function animateScoreCountUp(el, targetScore) {
      if (!el) return;
      const duration = 900;
      const start = performance.now();
      function step(now) {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = (targetScore * eased).toFixed(2);
        if (t < 1) requestAnimationFrame(step);
        else el.textContent = targetScore.toFixed(2);
      }
      requestAnimationFrame(step);
    }

    // =========================================================================
    // 4. CHÚ MÈO "time to lock in." BAY NGẪU NHIÊN (./meo.jpg + ONERROR AN TOÀN)
    // =========================================================================
    let catSpawnTimer = null;
    let catFlightAnimId = null;
    let activeCatEl = null;

    function stopCatFlight() {
      cancelAnimationFrame(catFlightAnimId);
      catFlightAnimId = null;
      if (activeCatEl) {
        activeCatEl.remove();
        activeCatEl = null;
      }
    }

    function scheduleNextCatAppearance(customDelayMs) {
      clearTimeout(catSpawnTimer);
      if (!prefs.catEnabled) return;
      // Tần suất vừa phải: mỗi 30 - 45 giây xuất hiện một lần
      const delay = typeof customDelayMs === 'number'
        ? customDelayMs
        : 23000 + Math.random() * 4000;
      catSpawnTimer = setTimeout(spawnFlyingLockInCat, delay);
    }

    // Xử lý dự phòng an toàn khi chưa có file ./meo.jpg (ví dụ lúc xem Preview)
    function renderCatFallbackCard(container) {
      if (!container) return;
      container.innerHTML = `
        <div class="w-full h-full flex flex-col items-center justify-center text-center p-1.5 bg-gradient-to-b from-amber-500 via-orange-500 to-slate-900 text-white select-none">
          <div class="text-2xl leading-none drop-shadow">🐱</div>
          <div class="text-[10px] font-extrabold leading-tight mt-1 tracking-tight drop-shadow">time to<br/>lock in.</div>
        </div>
      `;
    }

    function spawnFlyingLockInCat() {
      if (!prefs.catEnabled || activeCatEl) return;

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const catW = 80;

      // Bay nhẹ nhàng từ trái sang phải hoặc phải sang trái với quỹ đạo sóng sin mềm
      const fromLeft = Math.random() < 0.5;
      const startX = fromLeft ? -catW - 14 : vw + 14;
      const endX = fromLeft ? vw + 14 : -catW - 14;
      const startY = 90 + Math.random() * Math.max(100, vh - 240);
      const endY = 90 + Math.random() * Math.max(100, vh - 240);
      const waveAmp = 22 + Math.random() * 24;
      const waveFreq = 1.4 + Math.random() * 1.1;
      const flightDuration = 7500 + Math.random() * 1800;

      const el = document.createElement('div');
      el.id = 'lockin-cat-sprite';
      el.style.left = `${startX}px`;
      el.style.top = `${startY}px`;

      const img = document.createElement('img');
      img.src = CAT_IMAGE_SRC;
      img.alt = 'time to lock in.';
      img.className = 'w-full h-full object-cover block';
      img.onerror = function () {
        renderCatFallbackCard(el);
      };

      el.appendChild(img);
      document.body.appendChild(el);
      activeCatEl = el;

      const startTime = performance.now();
      function animateCat(now) {
        if (!activeCatEl) return;
        const t = Math.min(1, (now - startTime) / flightDuration);
        const curX = startX + (endX - startX) * t;
        const curY = startY + (endY - startY) * t + Math.sin(t * Math.PI * 2 * waveFreq) * waveAmp;
        const tilt = Math.sin(t * Math.PI * 2 * waveFreq) * 9 + (fromLeft ? 4 : -4);

        el.style.left = `${curX}px`;
        el.style.top = `${curY}px`;
        el.style.transform = `rotate(${tilt}deg)`;

        if (t < 1 && prefs.catEnabled) {
          catFlightAnimId = requestAnimationFrame(animateCat);
        } else {
          stopCatFlight();
          scheduleNextCatAppearance();
        }
      }

      catFlightAnimId = requestAnimationFrame(animateCat);
    }

    function applyPrefsUI() {
      document.documentElement.classList.toggle('dark', prefs.darkMode);

      const darkBtn = document.getElementById('btn-toggle-dark');
      if (darkBtn) darkBtn.textContent = prefs.darkMode ? '☀️' : '🌙';

      const catBtn = document.getElementById('btn-toggle-cat');
      if (catBtn) {
        catBtn.textContent = prefs.catEnabled ? '🐱 Bật' : '🐱 Tắt';
        catBtn.className = prefs.catEnabled
          ? 'px-2 py-1 rounded-lg text-xs font-semibold border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 hover:opacity-90 transition-colors'
          : 'px-2 py-1 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors';
      }
    }

    function toggleDarkMode() {
      prefs.darkMode = !prefs.darkMode;
      savePrefs();
      applyPrefsUI();
    }

    function toggleCatFeature() {
      prefs.catEnabled = !prefs.catEnabled;
      savePrefs();
      applyPrefsUI();
      if (prefs.catEnabled) {
        showToast('Đã bật mèo "time to lock in." bay ngẫu nhiên 🐱');
        scheduleNextCatAppearance(2500);
      } else {
        clearTimeout(catSpawnTimer);
        stopCatFlight();
        showToast('Đã tắt mèo bay.');
      }
    }

    // =========================================================================
    // 5. ĐIỀU HƯỚNG TAB & CUỘN TRANG
    // =========================================================================
    function switchMode(targetMode) {
      state.mode = targetMode;

      const views = {
        study: document.getElementById('study-view'),
        exam: document.getElementById('exam-view'),
        history: document.getElementById('history-view')
      };

      const tabs = {
        study: document.getElementById('tab-study'),
        exam: document.getElementById('tab-exam'),
        history: document.getElementById('tab-history')
      };

      const activeTabCls = 'px-2.5 py-1 text-xs font-semibold rounded-md transition-all bg-white dark:bg-slate-900 text-[#2563eb] dark:text-blue-400 shadow-sm';
      const inactiveTabCls = 'px-2.5 py-1 text-xs font-semibold rounded-md transition-all text-slate-600 dark:text-slate-300 hover:text-[#0f172a] dark:hover:text-white';

      Object.keys(views).forEach((key) => {
        if (views[key]) views[key].classList.toggle('hidden', key !== targetMode);
        if (tabs[key]) {
          tabs[key].className = (key === targetMode ? activeTabCls : inactiveTabCls) + (key === 'history' ? ' inline-flex items-center gap-1' : '');
        }
      });

      if (targetMode === 'study') {
        renderFilterButtons();
        renderQuestions();
      } else if (targetMode === 'history') {
        closeHistoryDetail();
        renderHistoryList();
      }
    }

    function scrollToTop() {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    window.addEventListener('scroll', () => {
      const btn = document.getElementById('back-to-top-btn');
      if (!btn) return;
      btn.classList.toggle('hidden', window.scrollY <= 400);
    }, { passive: true });

    // =========================================================================
    // 6. CHẾ ĐỘ ÔN TẬP (300 CÂU)
    // =========================================================================
    function escapeHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function updateStats(flashProgress = false) {
      const total = QUESTIONS.length;
      let done = 0;
      let correct = 0;
      let wrong = 0;

      for (const q of QUESTIONS) {
        if (Object.prototype.hasOwnProperty.call(state.userAnswers, q.id)) {
          done++;
          if (state.userAnswers[q.id] === q.ans) correct++;
          else wrong++;
        }
      }

      const accuracy = done > 0 ? Math.round((correct / done) * 100) : 0;
      const pct = Math.round((done / total) * 100);

      if (state.comboStreak > correct) {
        state.comboStreak = correct;
        savePracticeState();
      }

      document.getElementById('stat-done').textContent = `${done}/${total}`;
      document.getElementById('stat-correct').textContent = String(correct);
      document.getElementById('stat-accuracy').textContent = `(${accuracy}%)`;
      document.getElementById('stat-wrong').textContent = String(wrong);
      document.getElementById('stat-star').textContent = `⭐ ${state.bookmarks.length}`;

      const comboBadge = document.getElementById('combo-badge');
      const comboText = document.getElementById('stat-combo');
      if (comboBadge && comboText) {
        if (state.comboStreak >= 3) {
          comboText.textContent = `${state.comboStreak} câu thông suốt!`;
          comboBadge.className = 'tabular-clock inline-flex items-center gap-1 px-2 py-0 rounded-full text-[11px] font-bold bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm anim-combo-pop';
        } else if (state.comboStreak > 0) {
          comboText.textContent = String(state.comboStreak);
          comboBadge.className = 'tabular-clock inline-flex items-center gap-1 px-2 py-0 rounded-full text-[11px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800';
        } else {
          comboText.textContent = '0';
          comboBadge.className = 'tabular-clock inline-flex items-center gap-1 px-2 py-0 rounded-full text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700';
        }
      }

      const bar = document.getElementById('progress-bar');
      if (bar) {
        bar.style.width = `${pct}%`;
        if (flashProgress) {
          bar.classList.remove('progress-flash');
          void bar.offsetWidth;
          bar.classList.add('progress-flash');
        }
      }

      const histBadge = document.getElementById('history-count-badge');
      if (histBadge) histBadge.textContent = String(examHistory.length);
    }

    function renderFilterButtons() {
      const partWrap = document.getElementById('part-filter-buttons');
      if (partWrap) {
        partWrap.innerHTML = Object.entries(PART_META).map(([key, meta]) => {
          const active = state.partFilter === key;
          const cls = active
            ? 'px-3 py-1.5 text-xs font-semibold rounded-xl bg-[#2563eb] text-white shadow-sm transition-all'
            : 'px-3 py-1.5 text-xs font-medium rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all';
          return `<button type="button" onclick="setPartFilter('${key}')" class="${cls}">${meta.label}</button>`;
        }).join('');
      }

      const baseList = state.partFilter === 'all'
        ? QUESTIONS
        : QUESTIONS.filter((q) => q.part === state.partFilter);

      let cntUnanswered = 0, cntCorrect = 0, cntWrong = 0, cntStar = 0;
      for (const q of baseList) {
        const hasAns = Object.prototype.hasOwnProperty.call(state.userAnswers, q.id);
        if (!hasAns) cntUnanswered++;
        else if (state.userAnswers[q.id] === q.ans) cntCorrect++;
        else cntWrong++;
        if (state.bookmarks.includes(q.id)) cntStar++;
      }

      const statusOptions = [
        { key: 'all', label: `Tất cả (${baseList.length})` },
        { key: 'unanswered', label: `Chưa làm (${cntUnanswered})` },
        { key: 'correct', label: `Làm đúng (${cntCorrect})` },
        { key: 'wrong', label: `Làm sai (${cntWrong})` },
        { key: 'star', label: `⭐ Đánh dấu (${cntStar})` }
      ];

      const statusWrap = document.getElementById('status-filter-buttons');
      if (statusWrap) {
        statusWrap.innerHTML = statusOptions.map((item) => {
          const active = state.statusFilter === item.key;
          const cls = active
            ? 'px-3 py-1.5 text-xs font-semibold rounded-xl bg-[#0f172a] dark:bg-blue-500 text-white shadow-sm transition-all'
            : 'px-3 py-1.5 text-xs font-medium rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all';
          return `<button type="button" onclick="setStatusFilter('${item.key}')" class="${cls}">${item.label}</button>`;
        }).join('');
      }
    }

    function getFilteredQuestions() {
      const keyword = state.search.trim().toLowerCase();
      return QUESTIONS.filter((q) => {
        if (state.partFilter !== 'all' && q.part !== state.partFilter) return false;

        const hasAns = Object.prototype.hasOwnProperty.call(state.userAnswers, q.id);
        if (state.statusFilter === 'unanswered' && hasAns) return false;
        if (state.statusFilter === 'correct' && (!hasAns || state.userAnswers[q.id] !== q.ans)) return false;
        if (state.statusFilter === 'wrong' && (!hasAns || state.userAnswers[q.id] === q.ans)) return false;
        if (state.statusFilter === 'star' && !state.bookmarks.includes(q.id)) return false;

        if (keyword) {
          const numMatch = /^\d+$/.test(keyword) && String(q.id) === keyword;
          const textMatch =
            q.q.toLowerCase().includes(keyword) ||
            q.opts.some((opt) => opt.toLowerCase().includes(keyword)) ||
            q.exp.toLowerCase().includes(keyword);
          if (!numMatch && !textMatch) return false;
        }
        return true;
      });
    }

    function renderQuestions(highlightId = null, effectType = null) {
      const listEl = document.getElementById('question-list');
      const pagEl = document.getElementById('pagination-bar');
      const summaryEl = document.getElementById('filter-summary');

      const filtered = getFilteredQuestions();
      const totalItems = filtered.length;
      const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
      if (state.page > totalPages) state.page = totalPages;
      if (state.page < 1) state.page = 1;

      const startIdx = (state.page - 1) * PAGE_SIZE;
      const pageItems = filtered.slice(startIdx, startIdx + PAGE_SIZE);

      summaryEl.textContent = totalItems === 0
        ? 'Không tìm thấy câu hỏi phù hợp'
        : `Hiển thị ${startIdx + 1}–${Math.min(startIdx + PAGE_SIZE, totalItems)} trong tổng số ${totalItems} câu`;

      if (totalItems === 0) {
        listEl.innerHTML = `
          <div class="bg-white dark:bg-[#111827] rounded-2xl border border-[#e2e8f0] dark:border-slate-800 p-8 text-center space-y-2">
            <div class="text-2xl">🔍</div>
            <div class="font-semibold text-[#0f172a] dark:text-white">Không có câu hỏi nào khớp với bộ lọc hiện tại</div>
            <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Hãy thử xóa từ khóa tìm kiếm hoặc chọn bộ lọc "Tất cả".</p>
          </div>
        `;
        pagEl.innerHTML = '';
        return;
      }

      listEl.innerHTML = pageItems.map((q) => {
        const hasChosen = Object.prototype.hasOwnProperty.call(state.userAnswers, q.id);
        const chosenIdx = hasChosen ? state.userAnswers[q.id] : null;
        const isStarred = state.bookmarks.includes(q.id);
        const reveal = hasChosen || state.showAllAnswers;

        let cardAnimCls = '';
        if (highlightId === q.id && effectType === 'wrong') cardAnimCls = 'anim-wrong-shake';

        const optionsHtml = q.opts.map((optText, idx) => {
          let btnCls = 'w-full text-left p-3 sm:p-3.5 rounded-xl border transition-all flex items-start gap-3 text-sm ';
          let badgeCls = 'w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ';
          let statusIcon = '';

          if (!reveal) {
            btnCls += 'bg-[#f8fafc] dark:bg-slate-800/70 border-[#e2e8f0] dark:border-slate-700 hover:border-[#2563eb] dark:hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 text-[#0f172a] dark:text-slate-100';
            badgeCls += 'bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200';
          } else if (idx === q.ans) {
            btnCls += 'bg-green-50 dark:bg-emerald-950/50 border-[#16a34a] dark:border-emerald-500 text-green-950 dark:text-emerald-100 font-medium';
            badgeCls += 'bg-[#16a34a] text-white';
            statusIcon = '<span class="ml-auto text-xs font-bold text-[#16a34a] dark:text-emerald-400 shrink-0">✓ Đúng</span>';
          } else if (hasChosen && idx === chosenIdx && idx !== q.ans) {
            btnCls += 'bg-red-50 dark:bg-rose-950/50 border-[#dc2626] dark:border-rose-500 text-red-950 dark:text-rose-100';
            badgeCls += 'bg-[#dc2626] text-white';
            statusIcon = '<span class="ml-auto text-xs font-bold text-[#dc2626] dark:text-rose-400 shrink-0">✕ Bạn chọn</span>';
          } else {
            btnCls += 'bg-white dark:bg-slate-900/60 border-[#e2e8f0] dark:border-slate-800 text-slate-500 dark:text-slate-400 opacity-80';
            badgeCls += 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400';
          }

          return `
            <button type="button" ${hasChosen ? 'disabled' : ''} onclick="selectPracticeAnswer(${q.id}, ${idx}, event)" class="${btnCls} ${hasChosen ? 'cursor-default' : ''}">
              <span class="${badgeCls}">${LETTERS[idx]}</span>
              <span class="flex-1 leading-relaxed">${escapeHtml(optText)}</span>
              ${statusIcon}
            </button>
          `;
        }).join('');

        const explanationHtml = reveal ? `
          <div class="mt-3.5 p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/35 border border-blue-100 dark:border-blue-900/70 text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
            <div class="font-semibold text-[#2563eb] dark:text-blue-400 mb-1">💡 Đáp án đúng: ${LETTERS[q.ans]} — Giải thích:</div>
            <div>${escapeHtml(q.exp)}</div>
          </div>
        ` : '';

        return `
          <article id="q-card-${q.id}" class="question-card bg-white dark:bg-[#111827] rounded-2xl border border-[#e2e8f0] dark:border-slate-800 p-4 sm:p-5 shadow-sm hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 ${cardAnimCls}">
            <div class="flex items-start justify-between gap-3 mb-3">
              <div class="flex flex-wrap items-center gap-2">
                <span class="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-blue-50 dark:bg-blue-950/70 text-[#2563eb] dark:text-blue-400 border border-blue-100 dark:border-blue-900">
                  Câu ${q.id}
                </span>
                <span class="px-2 py-0.5 rounded-lg text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  ${PART_META[q.part].badge}
                </span>
              </div>
              <button type="button" onclick="toggleBookmark(${q.id})" title="Đánh dấu câu hỏi cần ôn kỹ"
                class="px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                  isStarred
                    ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300'
                    : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-amber-600'
                }">
                ${isStarred ? '⭐ Đã lưu' : '☆ Đánh dấu'}
              </button>
            </div>

            <h3 class="text-sm sm:text-base font-semibold text-[#0f172a] dark:text-white leading-relaxed mb-3.5">
              ${escapeHtml(q.q)}
            </h3>

            <div class="space-y-2">${optionsHtml}</div>
            ${explanationHtml}
          </article>
        `;
      }).join('');

      pagEl.innerHTML = `
        <div class="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          Trang <strong class="text-[#0f172a] dark:text-white">${state.page}</strong> / ${totalPages}
        </div>
        <div class="flex items-center gap-1.5">
          <button type="button" onclick="changePage(${state.page - 1})" ${state.page <= 1 ? 'disabled' : ''}
            class="px-3 py-1.5 text-xs sm:text-sm font-medium rounded-xl border border-[#e2e8f0] dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40">
            ← Trước
          </button>
          <button type="button" onclick="changePage(${state.page + 1})" ${state.page >= totalPages ? 'disabled' : ''}
            class="px-3 py-1.5 text-xs sm:text-sm font-medium rounded-xl border border-[#e2e8f0] dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40">
            Sau →
          </button>
        </div>
      `;
    }

    function selectPracticeAnswer(questionId, optionIndex, event) {
      const q = QUESTIONS.find((item) => item.id === questionId);
      if (!q) return;

      // Chặn chọn lại / spam click trên câu hỏi đã làm
      if (Object.prototype.hasOwnProperty.call(state.userAnswers, questionId)) {
        return;
      }

      state.userAnswers[questionId] = optionIndex;

      const isCorrect = optionIndex === q.ans;
      if (isCorrect) {
        // Chỉ tăng streak khi không bật chế độ "Hiện sẵn đáp án"
        if (!state.showAllAnswers) {
          state.comboStreak += 1;
        }
      } else {
        state.comboStreak = 0;
      }

      savePracticeState();
      updateStats(true);
      renderFilterButtons();
      renderQuestions(questionId, isCorrect ? 'correct' : 'wrong');
    }

    function toggleBookmark(questionId) {
      const idx = state.bookmarks.indexOf(questionId);
      if (idx === -1) {
        state.bookmarks.push(questionId);
        showToast(`Đã đánh dấu sao Câu ${questionId}`);
      } else {
        state.bookmarks.splice(idx, 1);
        showToast(`Đã bỏ đánh dấu Câu ${questionId}`);
      }
      savePracticeState();
      updateStats(false);
      renderFilterButtons();
      renderQuestions();
    }

    function setPartFilter(partKey) {
      state.partFilter = partKey;
      state.page = 1;
      savePracticeState();
      renderFilterButtons();
      renderQuestions();
    }

    function setStatusFilter(statusKey) {
      state.statusFilter = statusKey;
      state.page = 1;
      savePracticeState();
      renderFilterButtons();
      renderQuestions();
    }

    function handleSearch() {
      const input = document.getElementById('search-input');
      const clearBtn = document.getElementById('clear-search-btn');
      state.search = input ? input.value : '';
      state.page = 1;
      if (clearBtn) clearBtn.classList.toggle('hidden', state.search.length === 0);
      renderQuestions();
    }

    function clearSearch() {
      const input = document.getElementById('search-input');
      if (input) input.value = '';
      state.search = '';
      state.page = 1;
      document.getElementById('clear-search-btn').classList.add('hidden');
      renderQuestions();
    }

    function toggleShowAll() {
      const toggle = document.getElementById('show-all-toggle');
      state.showAllAnswers = Boolean(toggle && toggle.checked);
      savePracticeState();
      renderQuestions();
    }

    function changePage(newPage) {
      state.page = newPage;
      savePracticeState();
      renderQuestions();
      const studyView = document.getElementById('study-view');
      if (studyView) studyView.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function jumpToQuestion() {
      const input = document.getElementById('jump-input');
      const num = parseInt(input.value, 10);
      if (isNaN(num) || num < 1 || num > QUESTIONS.length) {
        showToast(`Vui lòng nhập số câu từ 1 đến ${QUESTIONS.length}.`);
        return;
      }

      state.partFilter = 'all';
      state.statusFilter = 'all';
      state.search = '';
      document.getElementById('search-input').value = '';
      document.getElementById('clear-search-btn').classList.add('hidden');

      state.page = Math.ceil(num / PAGE_SIZE);
      savePracticeState();
      renderFilterButtons();
      renderQuestions(num, null);

      setTimeout(() => {
        const card = document.getElementById(`q-card-${num}`);
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 60);
    }

    function openResetModal() {
      openModal(
        'Đặt lại tiến độ ôn tập?',
        'Toàn bộ câu đã làm, câu đánh dấu sao và chuỗi đúng liên tiếp ở chế độ Ôn tập sẽ được xóa về 0 (Lịch sử thi thử vẫn được giữ nguyên). Bạn chắc chắn chứ?',
        () => {
          state.userAnswers = {};
          state.bookmarks = [];
          state.comboStreak = 0;
          state.page = 1;
          savePracticeState();
          updateStats(false);
          renderFilterButtons();
          renderQuestions();
          showToast('Đã đặt lại toàn bộ tiến độ ôn tập.');
        }
      );
    }

    // =========================================================================
    // 7. CHẾ ĐỘ THI THỬ (40 CÂU - 60 PHÚT)
    // =========================================================================
    function shuffleArray(arr) {
      const copy = [...arr];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    }

    function startExam() {
      const sourceSelect = document.getElementById('exam-source-select');
      const sourceKey = sourceSelect ? sourceSelect.value : 'all';
      const pool = sourceKey === 'all'
        ? QUESTIONS
        : QUESTIONS.filter((q) => q.part === sourceKey);

      const selected = shuffleArray(pool).slice(0, 40);

      clearInterval(exam.timerId);
      exam = {
        status: 'active',
        sourceKey,
        questions: selected,
        answers: {},
        currentIndex: 0,
        timeLeft: 60 * 60,
        durationUsed: 0,
        timerId: null,
        reviewFilter: 'all'
      };

      document.getElementById('exam-intro').classList.add('hidden');
      document.getElementById('exam-result').classList.add('hidden');
      document.getElementById('exam-active').classList.remove('hidden');

      renderExamQuestion();
      renderExamNavGrid();
      updateExamTimerDisplay();

      exam.timerId = setInterval(() => {
        exam.timeLeft -= 1;
        exam.durationUsed += 1;
        updateExamTimerDisplay();
        if (exam.timeLeft <= 0) {
          clearInterval(exam.timerId);
          submitExam(true);
        }
      }, 1000);
    }

    function updateExamTimerDisplay() {
      const el = document.getElementById('exam-timer');
      if (!el) return;
      const mins = Math.max(0, Math.floor(exam.timeLeft / 60));
      const secs = Math.max(0, exam.timeLeft % 60);
      el.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    function renderExamQuestion() {
      const q = exam.questions[exam.currentIndex];
      if (!q) return;

      document.getElementById('exam-q-badge').textContent = `Câu ${exam.currentIndex + 1} / ${exam.questions.length} (ID #${q.id})`;

      const chosen = exam.answers[exam.currentIndex];
      const container = document.getElementById('exam-question-container');

      container.innerHTML = `
        <h3 class="text-base sm:text-lg font-semibold text-[#0f172a] dark:text-white leading-relaxed">
          ${escapeHtml(q.q)}
        </h3>
        <div class="space-y-2.5 pt-1">
          ${q.opts.map((optText, idx) => {
            const isSelected = chosen === idx;
            const btnCls = isSelected
              ? 'w-full text-left p-3.5 rounded-xl border-2 border-[#2563eb] bg-blue-50/80 dark:bg-blue-950/50 text-[#0f172a] dark:text-white font-medium flex items-start gap-3 text-sm transition-all'
              : 'w-full text-left p-3.5 rounded-xl border border-[#e2e8f0] dark:border-slate-700 bg-[#f8fafc] dark:bg-slate-800/70 hover:border-[#2563eb] dark:hover:border-blue-400 text-[#0f172a] dark:text-slate-100 flex items-start gap-3 text-sm transition-all';
            const badgeCls = isSelected
              ? 'w-6 h-6 rounded-lg bg-[#2563eb] text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5'
              : 'w-6 h-6 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5';
            return `
              <button type="button" onclick="selectExamAnswer(${idx})" class="${btnCls}">
                <span class="${badgeCls}">${LETTERS[idx]}</span>
                <span class="flex-1 leading-relaxed">${escapeHtml(optText)}</span>
              </button>
            `;
          }).join('')}
        </div>
      `;

      document.getElementById('exam-prev-btn').disabled = exam.currentIndex === 0;
      document.getElementById('exam-next-btn').disabled = exam.currentIndex === exam.questions.length - 1;
    }

    function renderExamNavGrid() {
      const grid = document.getElementById('exam-nav-grid');
      if (!grid) return;

      const answeredCount = Object.keys(exam.answers).length;
      document.getElementById('exam-answered-count').textContent = `Đã làm ${answeredCount}/${exam.questions.length}`;

      grid.innerHTML = exam.questions.map((_, idx) => {
        const isCurrent = idx === exam.currentIndex;
        const isAnswered = Object.prototype.hasOwnProperty.call(exam.answers, idx);

        let cls = 'h-9 rounded-lg text-xs font-bold transition-all border ';
        if (isAnswered) {
          cls += 'bg-[#2563eb] text-white border-[#2563eb] ';
        } else {
          cls += 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-blue-400 ';
        }
        if (isCurrent) {
          cls += 'ring-2 ring-offset-1 ring-[#0f172a] dark:ring-amber-400 dark:ring-offset-slate-900 ';
        }

        return `<button type="button" onclick="jumpExamQuestion(${idx})" class="${cls}">${idx + 1}</button>`;
      }).join('');
    }

    function selectExamAnswer(optIdx) {
      exam.answers[exam.currentIndex] = optIdx;
      renderExamQuestion();
      renderExamNavGrid();
    }

    function moveExamQuestion(delta) {
      const next = exam.currentIndex + delta;
      if (next < 0 || next >= exam.questions.length) return;
      exam.currentIndex = next;
      renderExamQuestion();
      renderExamNavGrid();
    }

    function jumpExamQuestion(idx) {
      exam.currentIndex = idx;
      renderExamQuestion();
      renderExamNavGrid();
    }

    function openSubmitExamModal() {
      const answeredCount = Object.keys(exam.answers).length;
      const unanswered = exam.questions.length - answeredCount;
      const msg = unanswered > 0
        ? `Bạn mới chọn ${answeredCount}/${exam.questions.length} câu (còn ${unanswered} câu chưa chọn). Bạn có chắc chắn muốn nộp bài ngay bây giờ không?`
        : `Bạn đã hoàn thành tất cả ${exam.questions.length} câu hỏi. Xác nhận nộp bài và lưu kết quả?`;

      openModal('Nộp bài thi thử?', msg, () => submitExam(false));
    }

    function formatDurationVietnamese(totalSecs) {
      const m = Math.floor(totalSecs / 60);
      const s = totalSecs % 60;
      return `${m} phút ${String(s).padStart(2, '0')} giây`;
    }

    function formatDateTimeNow() {
      const d = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      return `${pad(d.getHours())}:${pad(d.getMinutes())} - ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    }

    function submitExam(isAutoTimeout = false) {
      clearInterval(exam.timerId);
      exam.status = 'result';

      let correctCount = 0;
      const snapshotQuestions = exam.questions.map((q, idx) => {
        const userChoice = Object.prototype.hasOwnProperty.call(exam.answers, idx)
          ? exam.answers[idx]
          : null;
        const isCorrect = userChoice === q.ans;
        if (isCorrect) correctCount++;

        return {
          id: q.id, part: q.part, q: q.q, opts: q.opts,
          ans: q.ans, exp: q.exp, userChoice, isCorrect
        };
      });

      const totalQ = exam.questions.length;
      const wrongCount = totalQ - correctCount;
      const score10 = Number(((correctCount / totalQ) * 10).toFixed(2));
      const durationText = formatDurationVietnamese(exam.durationUsed);
      const submittedAt = formatDateTimeNow();

      const prevBest = examHistory.length > 0
        ? Math.max(...examHistory.map((item) => Number(item.score10) || 0))
        : -1;
      const isNewRecord = prevBest >= 0 && score10 > prevBest;

      const attemptRecord = {
        attemptId: Date.now(),
        submittedAt,
        sourceLabel: PART_META[exam.sourceKey] ? PART_META[exam.sourceKey].badge : 'Tất cả',
        durationText,
        correctCount,
        wrongCount,
        totalQ,
        score10,
        questions: snapshotQuestions
      };

      examHistory.unshift(attemptRecord);
      saveExamHistory();
      updateStats(false);

      document.getElementById('exam-active').classList.add('hidden');
      document.getElementById('exam-result').classList.remove('hidden');

      document.getElementById('exam-result-meta').textContent =
        `Nộp lúc: ${submittedAt} • Thời gian làm bài: ${durationText} • Nguồn: ${attemptRecord.sourceLabel}`;
      document.getElementById('exam-score-correct').textContent = String(correctCount);
      document.getElementById('exam-score-wrong').textContent = String(wrongCount);

      const recordBadge = document.getElementById('exam-record-badge');
      if (recordBadge) recordBadge.classList.toggle('hidden', !isNewRecord);

      animateScoreCountUp(document.getElementById('exam-score-10'), score10);
      if (score10 >= 8.0 || isNewRecord) {
        launchConfetti();
      } else {
      }

      if (isAutoTimeout) {
        showToast('Đã hết 60 phút! Hệ thống tự động nộp bài và lưu kết quả.');
      }

      exam.reviewFilter = 'all';
      renderExamReviewList(snapshotQuestions);
    }

    function setExamReviewFilter(filterType) {
      exam.reviewFilter = filterType;
      const allBtn = document.getElementById('review-all-btn');
      const wrongBtn = document.getElementById('review-wrong-btn');

      const activeCls = 'px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-xl bg-[#0f172a] dark:bg-[#2563eb] text-white';
      const inactiveCls = 'px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700';

      allBtn.className = filterType === 'all' ? activeCls : inactiveCls;
      wrongBtn.className = filterType === 'wrong' ? activeCls : inactiveCls;

      if (examHistory.length > 0) {
        renderExamReviewList(examHistory[0].questions);
      }
    }

    function renderReviewCardsHtml(snapshotQuestions, filterType) {
      const list = filterType === 'wrong'
        ? snapshotQuestions.map((item, i) => ({ ...item, orderNum: i + 1 })).filter((item) => !item.isCorrect)
        : snapshotQuestions.map((item, i) => ({ ...item, orderNum: i + 1 }));

      if (list.length === 0) {
        return `
          <div class="bg-white dark:bg-[#111827] rounded-2xl border border-[#e2e8f0] dark:border-slate-800 p-8 text-center space-y-2">
            <div class="text-2xl">🎉</div>
            <div class="font-bold text-[#16a34a] dark:text-emerald-400">Xuất sắc! Không có câu nào làm sai trong đề này.</div>
          </div>
        `;
      }

      return list.map((item) => {
        const statusBadge = item.isCorrect
          ? '<span class="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-green-50 dark:bg-emerald-950/60 text-[#16a34a] dark:text-emerald-400 border border-green-200 dark:border-emerald-800">✓ Đúng</span>'
          : item.userChoice === null
            ? '<span class="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">! Bỏ trống</span>'
            : '<span class="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-red-50 dark:bg-rose-950/60 text-[#dc2626] dark:text-rose-400 border border-red-200 dark:border-rose-800">✕ Sai</span>';

        const optsHtml = item.opts.map((optText, idx) => {
          let cls = 'p-3 rounded-xl border flex items-start gap-3 text-sm ';
          let badge = 'w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ';
          let tag = '';

          if (idx === item.ans) {
            cls += 'bg-green-50 dark:bg-emerald-950/50 border-[#16a34a] dark:border-emerald-500 text-green-950 dark:text-emerald-100 font-medium';
            badge += 'bg-[#16a34a] text-white';
            tag = '<span class="ml-auto text-xs font-bold text-[#16a34a] dark:text-emerald-400 shrink-0">✓ Đáp án đúng</span>';
          } else if (idx === item.userChoice && idx !== item.ans) {
            cls += 'bg-red-50 dark:bg-rose-950/50 border-[#dc2626] dark:border-rose-500 text-red-950 dark:text-rose-100';
            badge += 'bg-[#dc2626] text-white';
            tag = '<span class="ml-auto text-xs font-bold text-[#dc2626] dark:text-rose-400 shrink-0">✕ Bạn chọn</span>';
          } else {
            cls += 'bg-white dark:bg-slate-900/60 border-[#e2e8f0] dark:border-slate-800 text-slate-500 dark:text-slate-400';
            badge += 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400';
          }

          return `
            <div class="${cls}">
              <span class="${badge}">${LETTERS[idx]}</span>
              <span class="flex-1 leading-relaxed">${escapeHtml(optText)}</span>
              ${tag}
            </div>
          `;
        }).join('');

        return `
          <article class="bg-white dark:bg-[#111827] rounded-2xl border border-[#e2e8f0] dark:border-slate-800 p-4 sm:p-5 shadow-sm space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <span class="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-blue-50 dark:bg-blue-950/60 text-[#2563eb] dark:text-blue-400">
                  Câu ${item.orderNum}/${snapshotQuestions.length}
                </span>
                <span class="text-xs text-slate-400">(Ngân hàng: Câu #${item.id})</span>
              </div>
              ${statusBadge}
            </div>
            <h4 class="text-sm sm:text-base font-semibold text-[#0f172a] dark:text-white leading-relaxed">
              ${escapeHtml(item.q)}
            </h4>
            <div class="space-y-2">${optsHtml}</div>
            <div class="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/35 border border-blue-100 dark:border-blue-900/70 text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
              <strong class="text-[#2563eb] dark:text-blue-400">💡 Giải thích:</strong> ${escapeHtml(item.exp)}
            </div>
          </article>
        `;
      }).join('');
    }

    function renderExamReviewList(snapshotQuestions) {
      const container = document.getElementById('exam-review-list');
      if (!container) return;
      container.innerHTML = renderReviewCardsHtml(snapshotQuestions, exam.reviewFilter);
    }

    function resetExamToIntro() {
      clearInterval(exam.timerId);
      exam.status = 'intro';
      document.getElementById('exam-result').classList.add('hidden');
      document.getElementById('exam-active').classList.add('hidden');
      document.getElementById('exam-intro').classList.remove('hidden');
    }

    // =========================================================================
    // 8. TAB 3: LỊCH SỬ THI THỬ
    // =========================================================================
    function renderHistoryList() {
      const totalCount = examHistory.length;
      const clearBtn = document.getElementById('clear-all-history-btn');
      if (clearBtn) clearBtn.classList.toggle('hidden', totalCount === 0);

      document.getElementById('hist-total-count').textContent = String(totalCount);

      if (totalCount === 0) {
        document.getElementById('hist-avg-score').textContent = '--';
        document.getElementById('hist-max-score').textContent = '--';
        document.getElementById('history-items-wrapper').innerHTML = `
          <div class="bg-white dark:bg-[#111827] rounded-2xl border border-[#e2e8f0] dark:border-slate-800 p-8 text-center space-y-3">
            <div class="text-3xl">📋</div>
            <div class="font-bold text-[#0f172a] dark:text-white">Chưa có lịch sử thi thử nào</div>
            <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Hãy chuyển sang tab <strong>Thi thử (40)</strong> để làm bài kiểm tra. Kết quả sau khi nộp sẽ tự động lưu tại đây.
            </p>
            <button type="button" onclick="switchMode('exam')"
              class="px-5 py-2.5 bg-[#2563eb] hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold rounded-xl">
              Làm bài thi thử ngay
            </button>
          </div>
        `;
        return;
      }

      const scores = examHistory.map((item) => Number(item.score10) || 0);
      const avgScore = (scores.reduce((a, b) => a + b, 0) / totalCount).toFixed(2);
      const maxScore = Math.max(...scores).toFixed(2);

      document.getElementById('hist-avg-score').textContent = avgScore;
      document.getElementById('hist-max-score').textContent = maxScore;

      document.getElementById('history-items-wrapper').innerHTML = `
        <div class="space-y-3">
          ${examHistory.map((attempt, idx) => {
            const displayNum = totalCount - idx;
            const scoreBadgeCls = attempt.score10 >= 8.0
              ? 'bg-green-50 dark:bg-emerald-950/60 text-[#16a34a] dark:text-emerald-400 border-green-200 dark:border-emerald-800'
              : attempt.score10 >= 5.0
                ? 'bg-blue-50 dark:bg-blue-950/60 text-[#2563eb] dark:text-blue-400 border-blue-200 dark:border-blue-800'
                : 'bg-red-50 dark:bg-rose-950/60 text-[#dc2626] dark:text-rose-400 border-red-200 dark:border-rose-800';

            return `
              <div class="bg-white dark:bg-[#111827] rounded-2xl border border-[#e2e8f0] dark:border-slate-800 p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div class="space-y-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="font-bold text-sm sm:text-base text-[#0f172a] dark:text-white">Lần thi #${displayNum}</span>
                    <span class="px-2.5 py-0.5 rounded-lg text-xs font-bold border ${scoreBadgeCls}">
                      ${Number(attempt.score10).toFixed(2)} điểm
                    </span>
                    <span class="px-2 py-0.5 rounded-lg text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      ${escapeHtml(attempt.sourceLabel || 'Tất cả')}
                    </span>
                  </div>
                  <div class="text-xs text-slate-500 dark:text-slate-400">
                    Nộp lúc: ${escapeHtml(attempt.submittedAt)} • Đúng <strong>${attempt.correctCount}/${attempt.totalQ}</strong> câu • Thời gian: ${escapeHtml(attempt.durationText)}
                  </div>
                </div>

                <div class="flex items-center gap-2 shrink-0">
                  <button type="button" onclick="openHistoryDetail(${attempt.attemptId}, ${displayNum})"
                    class="px-3.5 py-2 text-xs font-semibold rounded-xl bg-[#2563eb] hover:bg-blue-700 text-white transition-colors">
                    Xem lại đề
                  </button>
                  <button type="button" onclick="deleteHistoryAttempt(${attempt.attemptId})" title="Xóa lượt thi này"
                    class="px-3 py-2 text-xs font-semibold rounded-xl border border-[#e2e8f0] dark:border-slate-700 text-[#dc2626] dark:text-rose-400 hover:bg-red-50 dark:hover:bg-rose-950/50 transition-colors">
                    Xóa
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    function openHistoryDetail(attemptId, displayNum) {
      const attempt = examHistory.find((item) => item.attemptId === attemptId);
      if (!attempt) return;

      historyViewState.selectedAttemptId = attemptId;
      historyViewState.detailFilter = 'all';

      document.getElementById('history-list-container').classList.add('hidden');
      document.getElementById('history-detail-container').classList.remove('hidden');

      document.getElementById('hist-detail-title').textContent = `Chi tiết Lần thi #${displayNum}`;
      document.getElementById('hist-detail-subtitle').textContent =
        `Nộp lúc: ${attempt.submittedAt} • Đúng ${attempt.correctCount}/${attempt.totalQ} câu • Thời gian: ${attempt.durationText}`;
      document.getElementById('hist-detail-score-badge').textContent =
        `Điểm: ${Number(attempt.score10).toFixed(2)} / 10`;

      setHistoryDetailFilter('all');
    }

    function closeHistoryDetail() {
      historyViewState.selectedAttemptId = null;
      document.getElementById('history-detail-container').classList.add('hidden');
      document.getElementById('history-list-container').classList.remove('hidden');
    }

    function setHistoryDetailFilter(filterType) {
      historyViewState.detailFilter = filterType;
      const attempt = examHistory.find((item) => item.attemptId === historyViewState.selectedAttemptId);
      if (!attempt) return;

      const allBtn = document.getElementById('hist-filter-all-btn');
      const wrongBtn = document.getElementById('hist-filter-wrong-btn');

      const activeCls = 'px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-xl bg-[#0f172a] dark:bg-[#2563eb] text-white';
      const inactiveCls = 'px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700';

      allBtn.className = filterType === 'all' ? activeCls : inactiveCls;
      wrongBtn.className = filterType === 'wrong' ? activeCls : inactiveCls;

      document.getElementById('history-detail-questions').innerHTML =
        renderReviewCardsHtml(attempt.questions, filterType);
    }

    function deleteHistoryAttempt(attemptId) {
      openModal(
        'Xóa lượt thi này?',
        'Bạn có chắc chắn muốn xóa lượt thi này khỏi lịch sử lưu trên trình duyệt không?',
        () => {
          examHistory = examHistory.filter((item) => item.attemptId !== attemptId);
          saveExamHistory();
          updateStats(false);
          renderHistoryList();
          showToast('Đã xóa lượt thi khỏi lịch sử.');
        }
      );
    }

    function openClearAllHistoryModal() {
      openModal(
        'Xóa toàn bộ lịch sử thi thử?',
        'Tất cả các lượt thi đã lưu trên trình duyệt sẽ bị xóa vĩnh viễn. Bạn chắc chắn muốn tiếp tục chứ?',
        () => {
          examHistory = [];
          saveExamHistory();
          updateStats(false);
          renderHistoryList();
          showToast('Đã xóa toàn bộ lịch sử thi thử.');
        }
      );
    }

    // =========================================================================
    // 9. MODAL XÁC NHẬN & TOAST THÔNG BÁO
    // =========================================================================
    function openModal(title, message, onConfirm) {
      document.getElementById('modal-title').textContent = title;
      document.getElementById('modal-message').textContent = message;
      modalCallback = onConfirm;

      const confirmBtn = document.getElementById('modal-confirm-btn');
      confirmBtn.onclick = () => {
        const cb = modalCallback;
        closeModal();
        if (typeof cb === 'function') cb();
      };

      document.getElementById('modal-backdrop').classList.remove('hidden');
    }

    function closeModal() {
      document.getElementById('modal-backdrop').classList.add('hidden');
      modalCallback = null;
    }

    function showToast(msg) {
      const toast = document.getElementById('toast');
      if (!toast) return;
      toast.textContent = msg;
      toast.classList.remove('hidden');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        toast.classList.add('hidden');
      }, 2800);
    }

    // =========================================================================
    // 10. KHỞI TẠO ỨNG DỤNG
    // =========================================================================
    window.addEventListener('DOMContentLoaded', () => {
      updateLiveDateTime();
      setInterval(updateLiveDateTime, 1000);
      loadAllFromStorage();
      applyPrefsUI();

      const showAllToggle = document.getElementById('show-all-toggle');
      if (showAllToggle) showAllToggle.checked = state.showAllAnswers;

      updateStats(false);
      renderFilterButtons();
      renderQuestions();

      // Hẹn giờ mèo bay lần đầu sau 8 giây, các lần sau ngẫu nhiên 30–45 giây
      if (prefs.catEnabled) {
        scheduleNextCatAppearance(8000);
      }
    });
