import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

export async function getLucideIconDataUrl(
  IconComponent,
  {
    absoluteStrokeWidth = true,
    color = "currentColor",
    size = 24,
    strokeWidth = 2,
  } = {},
) {
  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;left:-9999px;top:-9999px;width:0;height:0;overflow:hidden;";
  document.body.appendChild(host);
  const root = createRoot(host);

  try {
    flushSync(() => {
      root.render(
        createElement(IconComponent, {
          absoluteStrokeWidth,
          color,
          size,
          strokeWidth,
        }),
      );
    });

    const svg = host.querySelector("svg");
    if (!svg) {
      throw new Error("lucide_icon_render_failed");
    }

    const markup = new XMLSerializer().serializeToString(svg);
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  } finally {
    root.unmount();
    host.remove();
  }
}
