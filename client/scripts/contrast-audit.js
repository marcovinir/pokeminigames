/*
 * Auditoría de contraste del texto visible de la página actual (WCAG AA: 4,5:1 para texto normal,
 * 3:1 para texto grande). Se pega en la consola del navegador con la aplicación abierta.
 *
 *   __contrastAudit()          → lista los textos que no cumplen en el tema y modo actuales
 *   __contrastAuditAll()       → lo repite en los cuatro temas/modos (Clásico y Pokédex, claro y oscuro)
 *
 * Las pruebas automáticas comprueban los pares de colores de los tokens; esto comprueba lo que
 * realmente se ve (un componente con el color de texto equivocado sobre un fondo de otro tema).
 * Se desactivan las transiciones mientras se mide: a mitad de una transición los colores
 * intermedios dan falsos avisos.
 */
(() => {
  const parse = (color) => {
    const m = color.match(/[\d.]+/g).map(Number);
    return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 };
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
  const backgroundOf = (element) => {
    const layers = [];
    for (let node = element; node; node = node.parentElement) {
      const color = parse(getComputedStyle(node).backgroundColor);
      if (color.a > 0) layers.push(color);
      if (color.a === 1) break;
    }
    return layers.reverse().reduce((base, layer) => over(layer, base), { r: 255, g: 255, b: 255, a: 1 });
  };

  window.__contrastAudit = () => {
    const problems = [];
    for (const element of document.querySelectorAll("body *")) {
      const hasText = [...element.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!hasText || element.closest(".sr-only")) continue;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden" || (element.tagName === "BUTTON" && element.disabled)) continue;
      const background = backgroundOf(element);
      const text = over(parse(style.color), background);
      const [lighter, darker] = [luminance(text), luminance(background)].sort((a, b) => b - a);
      const ratio = (lighter + 0.05) / (darker + 0.05);
      const size = Number.parseFloat(style.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number.parseInt(style.fontWeight) >= 700);
      const required = large ? 3 : 4.5;
      if (ratio < required) {
        problems.push(`${element.tagName.toLowerCase()} «${element.textContent.trim().slice(0, 30)}»: ${ratio.toFixed(2)} (mínimo ${required})`);
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
