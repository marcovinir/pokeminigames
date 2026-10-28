/*
 * Auditoría de contraste del texto visible de la página actual (WCAG AA: 4,5:1 para texto normal,
 * 3:1 para texto grande). Se pega en la consola del navegador con la aplicación abierta.
 *
 *   __contrastAudit()          → lista los textos que no cumplen en el tema y modo actuales
 *   __contrastAuditAll()       → lo repite en los cuatro temas/modos (Clásico y Pokédex, claro y oscuro)
 *
 * Las pruebas automáticas comprueban los pares de colores de los tokens; esto comprueba lo que
 * realmente se ve (un componente con el color de texto equivocado sobre un fondo de otro tema).
 * Se desactivan las transiciones y animaciones mientras se mide: a mitad de una transición los
 * colores intermedios dan falsos avisos. Se tiene en cuenta la `opacity` del elemento y de sus
 * ancestros (`getComputedStyle().color` no la incluye y un texto atenuado parecería cumplir).
 * Cuando el fondo de un elemento (o de su ancestro más cercano con fondo) es un degradado, el
 * texto se mide contra cada color de la lista del degradado y cuenta el peor: así se cubren el
 * degradado de la página (`--art-1` arriba, `--art-2` abajo) y el de los chips de tipo.
 * Para medir la lista de sugerencias del autocompletado, ábrela (escribe una letra y pulsa
 * la flecha abajo) antes de ejecutar la auditoría; para el menú de apariencia, ábrelo.
 */
(() => {
  const parse = (color) => {
    const m = color.match(/[\d.]+/g).map(Number);
    // `color-mix()` se calcula como `color(srgb r g b / a)`, con los canales de 0 a 1.
    const scale = color.startsWith("color(srgb") ? 255 : 1;
    return { r: m[0] * scale, g: m[1] * scale, b: m[2] * scale, a: m.length > 3 ? m[3] : 1 };
  };
  const luminance = ({ r, g, b }) => {
    const [R, G, B] = [r, g, b].map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * R + 0.7152 * G + 0.0722 * B;
  };
  const over = (top, bottom) => ({
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1,
  });
  const opacityOf = (element) => {
    let opacity = 1;
    for (let node = element; node && node !== document.documentElement; node = node.parentElement) {
      opacity *= Number.parseFloat(getComputedStyle(node).opacity);
    }
    return opacity;
  };
  /**
   * Los fondos posibles de un elemento: un degradado da un fondo por cada color opaco de su lista; un color sólido
   * (o nada, que es blanco) da uno solo. Los colores con transparencia de los ancestros se superponen encima.
   */
  const backgroundsOf = (element) => {
    const layers = [];
    let bases = null;
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      const stops = style.backgroundImage.includes("gradient(")
        ? [...style.backgroundImage.matchAll(/rgba?([^)]*)/g)].map((match) => parse(match[0])).filter((color) => color.a === 1)
        : [];
      if (stops.length > 0) {
        bases = stops;
        break;
      }
      const color = parse(style.backgroundColor);
      if (color.a > 0) layers.push(color);
      if (color.a === 1) break;
    }
    return (bases ?? [{ r: 255, g: 255, b: 255, a: 1 }]).map((base) => [...layers].reverse().reduce((under, layer) => over(layer, under), base));
  };

  window.__contrastAudit = () => {
    const problems = [];
    for (const element of document.querySelectorAll("body *")) {
      const hasText = [...element.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!hasText || element.closest(".sr-only")) continue;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden" || (element.tagName === "BUTTON" && element.disabled)) continue;
      const color = parse(style.color);
      const size = Number.parseFloat(style.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number.parseInt(style.fontWeight) >= 700);
      const required = large ? 3 : 4.5;
      let worst = Number.POSITIVE_INFINITY;
      for (const background of backgroundsOf(element)) {
        const text = over({ ...color, a: color.a * opacityOf(element) }, background);
        const [lighter, darker] = [luminance(text), luminance(background)].sort((a, b) => b - a);
        worst = Math.min(worst, (lighter + 0.05) / (darker + 0.05));
      }
      if (worst < required) {
        problems.push(`${element.tagName.toLowerCase()} «${element.textContent.trim().slice(0, 30)}»: ${worst.toFixed(2)} (mínimo ${required})`);
      }
    }
    return problems;
  };

  window.__contrastAuditAll = async () => {
    const root = document.documentElement;
    const original = { theme: root.dataset.theme, mode: root.dataset.mode };
    const style = document.createElement("style");
    style.textContent = "*, *::before, *::after { transition: none !important; animation: none !important; }";
    document.head.append(style);
    const report = {};
    for (const theme of ["clasico", "pokedex"]) {
      for (const mode of ["claro", "oscuro"]) {
        root.dataset.theme = theme;
        root.dataset.mode = mode;
        await new Promise((resolve) => setTimeout(resolve, 100));
        report[`${theme}/${mode}`] = window.__contrastAudit();
      }
    }
    style.remove();
    root.dataset.theme = original.theme;
    root.dataset.mode = original.mode;
    return report;
  };
})();
