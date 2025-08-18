import fs from 'fs/promises';
import path from 'path';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';

const PORT = 8787;
const BASE_URL = `http://localhost:${PORT}`;

const pages = [
  { name: 'Home', url: '/' },
  { name: 'Breakout', url: '/games/breakout/breakout.html' },
  { name: 'Space-Shooter', url: '/games/space-shooter/space-shooter.html' },
  { name: 'Highway-Hopper', url: '/games/highway-hopper/index.html' },
];

const thresholds = {
  performance: 80,
  accessibility: 90,
  'best-practices': 90,
};

// Main function to run the audits
async function main() {
  let chrome;
  try {
    console.log('🚀 Starting Lighthouse audit...');

    // Ensure output directory exists
    const reportDir = path.join(process.cwd(), 'lighthouse');
    await fs.mkdir(reportDir, { recursive: true });

    // Launch Chrome
    chrome = await chromeLauncher.launch({
      chromeFlags: ['--headless', '--disable-gpu', '--no-sandbox'],
    });

    const results = [];

    for (const page of pages) {
      console.log(`\n🔍 Auditing: ${page.name} (${page.url})`);

      const runnerResult = await lighthouse(`${BASE_URL}${page.url}`, {
        port: chrome.port,
        output: 'html',
        logLevel: 'info',
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
        screenEmulation: {
          mobile: true,
          width: 360,
          height: 740,
          deviceScaleFactor: 2,
          disabled: false,
        },
        throttlingMethod: 'provided',
      });

      const reportHtml = runnerResult.report;

      const pageSlug = page.name.toLowerCase().replace(/ /g, '-');
      const htmlPath = path.join(reportDir, `${pageSlug}-report.html`);
      const jsonPath = path.join(reportDir, `${pageSlug}-report.json`);

      await fs.writeFile(htmlPath, reportHtml);
      await fs.writeFile(jsonPath, JSON.stringify(runnerResult.lhr, null, 2));

      console.log(`✅ Reports saved:`);
      console.log(`   - HTML: ${htmlPath}`);
      console.log(`   - JSON: ${jsonPath}`);

      const scores = {
        performance: Math.round(runnerResult.lhr.categories.performance.score * 100),
        accessibility: Math.round(runnerResult.lhr.categories.accessibility.score * 100),
        'best-practices': Math.round(runnerResult.lhr.categories['best-practices'].score * 100),
      };

      results.push({ name: page.name, scores, reports: { html: htmlPath, json: jsonPath } });

      // Check thresholds
      console.log('📊 Scores:');
      for (const [key, threshold] of Object.entries(thresholds)) {
        const score = scores[key];
        if (score < threshold) {
          console.warn(`   - ⚠️  ${key}: ${score} (Threshold: ${threshold})`);
        } else {
          console.log(`   - ✅ ${key}: ${score}`);
        }
      }
    }

    console.log('\n🎉 Lighthouse audit complete.');

  } catch (error) {
    console.error('❌ Lighthouse audit failed:', error);
    process.exit(1);
  } finally {
    if (chrome) {
      await chrome.kill();
    }
  }
}

main();
