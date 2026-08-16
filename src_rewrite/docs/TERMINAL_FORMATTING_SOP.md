# foxOS Terminal Content Formatting Standard Operating Procedure (SOP)

This guide documents best practices and standards for writing articles, recipes, lore documents, and terminal command outputs within the **foxOS Virtual Machine**.

---

## 🖥️ 1. The Monospaced CRT Character Matrix
In `foxOS`, the terminal display operates on an emulated **Virtual Video RAM (VRAM)** raster grid. Every row on the CRT occupies strictly **one uniform line height**.

To guarantee zero fractional line clipping and authentic 1981 aesthetic, the VRAM parser automatically transforms standard tags into monospaced ASCII banners:

### 📑 Heading Conversions:

| HTML / Tag | Formatted Terminal Output | Usage & Purpose |
| :--- | :--- | :--- |
| `<h1>TITLE</h1>` | `╔═════════════════╗`<br>`║  TITLE          ║`<br>`╚═════════════════╝` | Main document title / cartridge hero banner |
| `<h2>SECTION</h2>` | `=== [ SECTION ] ===` | Major chapter or compendium category divider |
| `<h3>SUB-HEADER</h3>` | `--- SUB-HEADER ---` | Minor subsection or question prompt |
| `<b>Text</b>` | Bright glowing phosphor text (`var(--phosphor-bright)`) | Critical keywords, PINs, or cipher hints |
| `<code>key</code>` | Inverted background badge `[ KEY ]` | Command examples, file names, keyboard shortcuts |

---

## 📐 2. Layout & Typography Rules

1. **Monospace Character Width Limit:**
   - Keep manual line lengths under **76 characters** so text fits cleanly on standard 80-column CRT monitors without forced wrapping.
2. **Empty Line Spacing:**
   - Use standard `\n\n` between paragraphs. The VRAM engine automatically renders blank rows cleanly on the character grid.
3. **Paging Rules (`pager: true` vs `pager: false`):**
   - **Multi-screen text documents** (`about`, `help`, `cat long_file.txt`, `blog`): Default to `pager: true`. The engine automatically halts 2 rows above the monitor bezel with `-- MORE -- (SPACE: Next Page, Q: Quit)`.
   - **Continuous animations / Boot sequences** (`boot.js`, real-time game renders): Explicitly set `pager: false` so output flows without interruption.

---

## 🎨 3. Color & Phosphor Tokens

When styling custom cartridge output or interactive logs, use the hardware CSS variables:

- `var(--phosphor)`: Primary green/amber CRT phosphor glow.
- `var(--phosphor-bright)`: High-intensity active cursor / bold text accent.
- `var(--phosphor-dim)`: Muted secondary text (borders, timestamps, hints).
- `var(--accent)`: Serenity signature magenta accent (`#e024c3` / `#ff4d88`).
- `var(--boot)`: Deep CRT black backing (`#020502` / `#060301`).

---

## ⌨️ 4. Standard Navigation & Keyboard Controls

- **`Enter` / `Space`**: Advance to next page when `-- MORE --` badge is active.
- **`Q` / `Escape`**: Abort long file output and return immediately to the command prompt.
- **`PageUp` / `PageDown`**: Step forward / backward by one full CRT screenful with mechanical relay sound.
- **`Mousewheel` / `Touchpad`**: Discrete single-line hardware raster stepping with keyclick sound.
