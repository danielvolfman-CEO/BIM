      (() => {
        const KEY = "gv-theme";
        const btn = document.getElementById("themeToggle");
        const label = document.getElementById("themeLabel");
        const root = document.documentElement;
        function fogColorFor(theme) {
          return theme === "light" ? 0xfbf8ef : 0x0b0f16;
        }
        function dispatch(theme) {
          window.dispatchEvent(
            new CustomEvent("gv-theme-change", {
              detail: { theme, fog: fogColorFor(theme) },
            }),
          );
        }
        function apply(theme) {
          if (theme === "light") {
            root.dataset.theme = "light";
            if (label) label.textContent = "Dark";
            if (btn) btn.setAttribute("aria-label", "Тёмная тема");
          } else {
            delete root.dataset.theme;
            if (label) label.textContent = "Light";
            if (btn) btn.setAttribute("aria-label", "Светлая тема");
          }
          dispatch(theme);
        }
        let saved = "dark";
        try {
          saved = localStorage.getItem(KEY) || "dark";
        } catch (e) {}
        apply(saved);
        if (btn) {
          btn.addEventListener("click", () => {
            const next = root.dataset.theme === "light" ? "dark" : "light";
            try {
              localStorage.setItem(KEY, next);
            } catch (e) {}
            apply(next);
          });
        }
      })();

      (() => {
        const bar = document.getElementById("scrollProgress");
        if (!bar) return;
        const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
        let raf = 0;
        function update() {
          raf = 0;
          const doc = document.documentElement;
          const max = doc.scrollHeight - window.innerHeight;
          const pct = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
          bar.style.width = (pct * 100).toFixed(2) + "%";
        }
        function onScroll() {
          if (reduced) {
            update();
            return;
          }
          if (raf) return;
          raf = requestAnimationFrame(update);
        }
        update();
        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll, { passive: true });
      })();
