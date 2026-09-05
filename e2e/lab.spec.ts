import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("lab configures a blocking modal, resets data, and provides a repeatable launch URL", async ({
  page,
}) => {
  await page.goto("/lab");
  await page.getByLabel("Announcement on the first dashboard visit").check();
  await page.getByLabel("Data loading delay").selectOption("1500");
  await page.getByRole("button", { name: "Apply challenges" }).click();
  await expect(page.getByRole("status")).toContainText("Challenges applied");
  await page.getByRole("link", { name: "Launch capture scenario" }).click();
  await page.getByLabel("Email").fill("demo@acme.example");
  await page.getByLabel("Password").fill("demo-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  const modal = page.getByRole("dialog", {
    name: "Welcome to the new forecast",
  });
  await expect(modal).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Loading revenue streams…");
  await page.getByRole("button", { name: "Got it" }).click();
  await expect(page.getByRole("cell", { name: "Wholesale" })).toBeVisible();
  await page.reload();
  await expect(modal).toHaveCount(0);
  await page.goto("/lab");
  await page.getByRole("button", { name: "Reset fixture data" }).click();
  await expect(page.getByRole("status")).toContainText("Fixture reset");
  await page.goto("/dashboard");
  await expect(modal).toBeVisible();
});

test("fixture names render as text", async ({ page }) => {
  await page.goto("/login");
  await page.evaluate(() => localStorage.setItem("acme-authed", "1"));
  await page.request.post("/api/streams", {
    data: { name: "<b>Example</b>", pricing: "unit", monthly: 1 },
  });
  await page.goto("/dashboard");
  await expect(
    page.getByRole("cell", { name: "<b>Example</b>", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#streams b")).toHaveCount(0);
});

for (const id of ["rename-control", "forecast-export", "internal-refactor"]) {
  test(`product scenario works in the browser: ${id}`, async ({ page }) => {
    const catalog: {
      id: string;
      edits: { before: string; after: string }[];
    }[] = JSON.parse(readFileSync("lab/catalog.json", "utf8"));
    let html = readFileSync("src/pages/dashboard.html", "utf8");
    const active = JSON.parse(readFileSync("lab/state.json", "utf8")).scenario;
    if (active !== "baseline")
      for (const edit of [
        ...catalog.find((s) => s.id === active)!.edits,
      ].reverse())
        html = html.split(edit.after).join(edit.before);
    for (const edit of catalog.find((s) => s.id === id)!.edits)
      html = html.split(edit.before).join(edit.after);
    await page.route("**/dashboard", (route) =>
      route.fulfill({ contentType: "text/html", body: html }),
    );
    await page.goto("/login");
    await page.evaluate(() => localStorage.setItem("acme-authed", "1"));
    await page.goto("/dashboard");
    await expect(page.getByRole("cell", { name: "$14,200" })).toBeVisible();
    if (id === "forecast-export") {
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: "Export forecast CSV" }).click();
      const file = await download;
      expect(file.suggestedFilename()).toBe("forecast.csv");
      expect(readFileSync((await file.path())!, "utf8")).toBe(
        '"Stream","Pricing model","Per month"\r\n"Wholesale","unit","14200"\r\n"Retail","unit","9850"\r\n',
      );
    } else {
      const label =
        id === "rename-control" ? "New revenue stream" : "Add revenue stream";
      await page.getByRole("button", { name: label, exact: true }).click();
      await expect(page.getByRole("dialog", { name: label })).toBeVisible();
    }
  });
}
