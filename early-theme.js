(function(){
      try {
        var key = "snookerPracticePWA.themeMode";
        var mode = localStorage.getItem(key);
        if (!mode) {
          var raw = localStorage.getItem("snookerPracticePWA.v3");
          if (raw) mode = (JSON.parse(raw).interfaceSettings || {}).themeMode;
        }
        if (["system","light","dark","contrast"].indexOf(mode) < 0) mode = "system";
        var actual = mode === "system" ? ((window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light") : mode;
        document.documentElement.setAttribute("data-theme-mode", mode);
        document.documentElement.setAttribute("data-theme", actual);
        document.documentElement.classList.add("theme-" + mode);
        document.addEventListener("DOMContentLoaded", function(){
          if (document.body) {
            document.body.setAttribute("data-theme-mode", mode);
            document.body.setAttribute("data-theme", actual);
            document.body.classList.add("theme-" + mode);
          }
        });
        window.__snookerEarlyThemeMode = mode;
      } catch(e) {}
    })();
