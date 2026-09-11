// One-off visual click-through of the admin Import Wizard against a local
// server. Preview-only: it never presses Apply and never presses Undo.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:3000";
const SHOTS = "/tmp/wizard-shots";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const say = (m) => console.log("•", m);

try {
  // 1. Login
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', process.env.INITIAL_ADMIN_EMAIL || "admin@smsstores.local");
  await page.fill('input[type="password"]', process.env.INITIAL_ADMIN_PASSWORD || "AdminLocal#2026");
  await page.click('button[type="submit"]');
  await page.waitForSelector("text=Products & Stock", { timeout: 15000 });
  say("logged in, dashboard visible");

  // 2. Products section → Import
  await page.click("text=Products & Stock");
  await page.waitForSelector('button:has-text("Import")', { timeout: 10000 });
  await page.click('button:has-text("Import")');
  await page.waitForSelector("text=Import stock & products.", { timeout: 10000 });
  say("wizard opened");

  // 3. Mode picker
  const modes = await page.$$eval(
    'button:has(p.text-\\[14px\\])',
    (els) => els.map((e) => e.querySelector("p")?.textContent?.trim()).filter(Boolean)
  );
  say("mode cards: " + JSON.stringify(modes));
  await page.screenshot({ path: `${SHOTS}/1-modes.png` });

  // 4. Receipt mode + template download
  await page.click('text=New stock received (add)');
  await page.waitForSelector("text=Download template (.xlsx)");
  say("upload step visible with template link");
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    page.click("text=Download template (.xlsx)"),
  ]);
  const tplPath = `/tmp/wizard-shots/template-receipt.xlsx`;
  await download.saveAs(tplPath);
  say(`template downloaded: ${download.suggestedFilename()}`);
  await page.screenshot({ path: `${SHOTS}/2-upload.png` });

  // 5. Upload a small real CSV (SKUs exist in the seeded shop)
  const csvPath = "/tmp/wizard-shots/receipt.csv";
  writeFileSync(csvPath, "SKU,Stock\nSMS-MOB1000,5\nSMS-MOB1001,3\nSMS-MOB1002,2\n");
  await page.setInputFiles('input[type="file"]', csvPath);
  await page.click('button:has-text("Upload & preview")');
  await page.waitForSelector("text=Total stock", { timeout: 20000 });
  say("preview rendered");
  const previewText = (await page.textContent("body")) || "";
  for (const probe of ["Update", "Total stock", "Apply"]) {
    say(`preview contains "${probe}": ${previewText.includes(probe)}`);
  }
  await page.screenshot({ path: `${SHOTS}/3-preview.png`, fullPage: false });

  // 6. History (never Undo)
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page.waitForSelector("text=Import history.", { timeout: 10000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/4-history.png` });
  const histText = (await page.textContent("body")) || "";
  say(`history mentions Undo: ${histText.includes("Undo")}`);

  // 7. Close without applying
  await page.getByRole("button", { name: "Close", exact: true }).click();
  say("closed wizard without applying anything");
  console.log("CLICK-THROUGH OK");
} catch (err) {
  await page.screenshot({ path: `${SHOTS}/error.png` }).catch(() => {});
  console.error("CLICK-THROUGH FAILED:", err.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
