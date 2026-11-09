(function () {
  "use strict";

  const STORAGE_KEY = "xinke-theme";
  const THEMES = ["dusk", "paper", "celadon", "sun"];
  const THEME_COLORS = {
    dusk: "#0b0f0e",
    paper: "#f5f1e6",
    celadon: "#eef4f0",
    sun: "#fdf3e3",
  };

  const picker = document.querySelector(".theme-picker");
  if (!picker) {
    return;
  }

  const dots = Array.prototype.slice.call(
    picker.querySelectorAll("[data-theme-value]")
  );

  function apply(theme, persist) {
    if (THEMES.indexOf(theme) === -1) {
      theme = "dusk";
    }

    document.documentElement.dataset.theme = theme;

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute("content", THEME_COLORS[theme]);
    }

    dots.forEach(function (dot) {
      const selected = dot.dataset.themeValue === theme;
      dot.setAttribute("aria-checked", selected ? "true" : "false");
      dot.tabIndex = selected ? 0 : -1;
    });

    if (persist) {
      try {
        window.localStorage.setItem(STORAGE_KEY, theme);
      } catch (e) {
        /* Private mode et al. — the theme still applies for this visit. */
      }
    }
  }

  picker.addEventListener("click", function (event) {
    const dot = event.target.closest("[data-theme-value]");
    if (dot) {
      apply(dot.dataset.themeValue, true);
    }
  });

  picker.addEventListener("keydown", function (event) {
    const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
    if (keys.indexOf(event.key) === -1) {
      return;
    }

    event.preventDefault();

    const current = picker.querySelector('[aria-checked="true"]');
    const index = dots.indexOf(current);
    const step = event.key === "ArrowRight" || event.key === "ArrowUp" ? 1 : -1;
    const next = dots[(index + step + dots.length) % dots.length];

    next.focus();
    apply(next.dataset.themeValue, true);
  });

  let saved = "dusk";
  try {
    saved = window.localStorage.getItem(STORAGE_KEY) || "dusk";
  } catch (e) {
    /* Fall back to the default theme. */
  }
  apply(saved, false);
})();
