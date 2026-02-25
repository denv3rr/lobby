import { expect, test } from "playwright/test";

test("shows fallback link hub when WebGL is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    const nativeGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(type, ...args) {
      if (type === "webgl" || type === "webgl2" || type === "experimental-webgl") {
        return null;
      }
      return nativeGetContext.call(this, type, ...args);
    };
  });

  await page.goto("/?sceneui=1");

  const fallbackPanel = page.locator("#fallback-panel");
  await expect(fallbackPanel).toBeVisible();
  await expect(fallbackPanel.locator("h2")).toHaveText("WebGL Unavailable");
  await expect(fallbackPanel.locator("p").first()).toContainText(
    "3D rendering is unavailable"
  );
  await expect.poll(async () => fallbackPanel.locator("a").count()).toBeGreaterThan(0);
  await expect(fallbackPanel.locator("button.fallback-retry")).toHaveText("Retry Boot");
});
