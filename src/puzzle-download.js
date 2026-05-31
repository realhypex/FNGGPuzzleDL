(() => {
  const BLACK_DOWNLOAD_BUTTON_ID = "fnggpuzzledl-download-black";
  const TRANSPARENT_DOWNLOAD_BUTTON_ID = "fnggpuzzledl-download-transparent";
  const TOOLBAR_ID = "fnggpuzzledl-toolbar";
  const GRID_SELECTOR = "#shattered-board-grid";
  const FORM_SELECTOR = "#shattered-board-form";
  const CELL_SELECTOR = ".shattered-board-cell";
  const CELL_SIZE = 40;

  installPuzzleDownloadButtons();

  function installPuzzleDownloadButtons() {
    waitForElement(FORM_SELECTOR, 8000)
      .then((form) => ensurePuzzleDownloadButtons(form))
      .catch(() => {});

    const observer = new MutationObserver(() => {
      const form = document.querySelector(FORM_SELECTOR);

      if (form) {
        ensurePuzzleDownloadButtons(form);
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function ensurePuzzleDownloadButtons(form) {
    if (!form) {
      return;
    }

    const submit = form.querySelector('button[type="submit"], button');
    const toolbar = ensureToolbar(form);
    const blackButton = createPuzzleDownloadButton({
      id: BLACK_DOWNLOAD_BUTTON_ID,
      label: "Download Puzzle",
      transparent: false,
      submit
    });
    const transparentButton = createPuzzleDownloadButton({
      id: TRANSPARENT_DOWNLOAD_BUTTON_ID,
      label: "Download Transparent",
      transparent: true,
      submit
    });

    if (
      blackButton.parentElement === toolbar &&
      transparentButton.parentElement === toolbar &&
      blackButton.nextElementSibling === transparentButton
    ) {
      return;
    }

    toolbar.append(blackButton, transparentButton);
  }

  function ensureToolbar(form) {
    let toolbar = document.getElementById(TOOLBAR_ID);

    if (!toolbar) {
      toolbar = document.createElement("div");
      toolbar.id = TOOLBAR_ID;
      toolbar.setAttribute("aria-label", "Puzzle download actions");
      toolbar.style.display = "flex";
      toolbar.style.justifyContent = "center";
      toolbar.style.alignItems = "center";
      toolbar.style.flexWrap = "wrap";
      toolbar.style.gap = "10px";
      toolbar.style.width = "100%";
      toolbar.style.margin = "0 auto";
    }

    if (toolbar.previousElementSibling !== form) {
      form.insertAdjacentElement("afterend", toolbar);
    }

    return toolbar;
  }

  function createPuzzleDownloadButton(options) {
    const existing = document.getElementById(options.id);

    if (existing) {
      return existing;
    }

    const button = document.createElement("button");
    button.id = options.id;
    button.type = "button";
    button.className = options.submit?.className || "button";
    button.textContent = options.label;
    button.style.flex = "0";
    button.style.whiteSpace = "nowrap";
    button.addEventListener("click", () => handlePuzzleDownload(button, options));
    return button;
  }

  async function handlePuzzleDownload(button, options) {
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Rendering...";

    try {
      const result = await renderPuzzlePng({
        transparent: options.transparent
      });
      downloadBlob(result.blob, result.filename);
      button.textContent = result.failedImages > 0
        ? `Saved (${result.failedImages} missing)`
        : "Saved";
      button.title = result.failedImages > 0
        ? `${result.failedImages} fragment image(s) could not be loaded.`
        : "Puzzle downloaded.";
    } catch (error) {
      button.textContent = "Failed";
      button.title = error.message || "Could not download puzzle.";
      console.warn("[FNGGPuzzleDL] Puzzle download failed:", error);
    } finally {
      window.setTimeout(() => {
        button.disabled = false;
        button.textContent = originalText;
      }, 1400);
    }
  }

  async function renderPuzzlePng(options = {}) {
    const transparent = Boolean(options.transparent);
    const grid = document.querySelector(GRID_SELECTOR);

    if (!grid) {
      throw new Error("Could not find the Shattered puzzle grid.");
    }

    const cols = readGridDimension(grid, "cols");
    const rows = readGridDimension(grid, "rows");

    if (!cols || !rows) {
      throw new Error("Could not read the puzzle grid size.");
    }

    const canvas = document.createElement("canvas");
    canvas.width = cols * CELL_SIZE;
    canvas.height = rows * CELL_SIZE;

    const context = canvas.getContext("2d");
    context.imageSmoothingEnabled = false;

    if (!transparent) {
      context.fillStyle = "#000000";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }

    const cells = Array.from(grid.querySelectorAll(CELL_SELECTOR)).slice(0, cols * rows);
    let failedImages = 0;

    await Promise.all(cells.map(async (cell, index) => {
      const imageUrl = getCellImageUrl(cell);

      if (!imageUrl) {
        return;
      }

      const image = await loadImage(imageUrl);

      if (!image) {
        failedImages += 1;
        return;
      }

      context.drawImage(
        image,
        (index % cols) * CELL_SIZE,
        Math.floor(index / cols) * CELL_SIZE,
        CELL_SIZE,
        CELL_SIZE
      );
    }));

    const blob = await canvasToBlob(canvas);
    const day = grid.dataset.day ? `day-${grid.dataset.day}` : "current";

    return {
      blob,
      failedImages,
      filename: `fortnitegg-shattered-${day}-${transparent ? "transparent" : "black"}-${timestampForFilename()}.png`
    };
  }

  function readGridDimension(grid, name) {
    const value = Number(grid.dataset[name]);

    if (Number.isInteger(value) && value > 0) {
      return value;
    }

    return 0;
  }

  function getCellImageUrl(cell) {
    const backgroundImage = cell.style.backgroundImage || getComputedStyle(cell).backgroundImage;
    const match = backgroundImage.match(/url\((["']?)(.*?)\1\)/i);

    if (!match?.[2]) {
      return "";
    }

    return new URL(match[2], location.href).href;
  }

  function loadImage(url) {
    return new Promise((resolve) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = url;
    });
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      try {
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error("Could not render the puzzle image."));
            return;
          }

          resolve(blob);
        }, "image/png");
      } catch (error) {
        reject(error);
      }
    });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function timestampForFilename() {
    return new Date()
      .toISOString()
      .replace(/\.\d+Z$/, "")
      .replace(/[:T]/g, "-");
  }

  function waitForElement(selector, timeoutMs) {
    const existing = document.querySelector(selector);

    if (existing) {
      return Promise.resolve(existing);
    }

    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        observer.disconnect();
        reject(new Error("Timed out waiting for the Shattered form."));
      }, timeoutMs);

      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector);

        if (!element) {
          return;
        }

        window.clearTimeout(timeout);
        observer.disconnect();
        resolve(element);
      });

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    });
  }
})();
