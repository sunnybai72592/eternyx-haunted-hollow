// Built-frontend smoke only. No staging credentials, no remote provider traffic.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.ETERNYX_PLAYWRIGHT_MODULE);
const origin = 'http://127.0.0.1:4173';
const publicRoutes = ['/', '/developer-studio', '/cybersecurity', '/automation', '/ai-arsenal', '/education', '/workspace', '/integrations', '/services-hub', '/labs', '/subscriptions'];
const privateRoutes = ['/account','/profile','/settings','/cybersecurity/cases','/ai-arsenal/video','/integrations/docker-control','/services/requests','/education/history'];
const browser = await chromium.launch({headless:true});
const report = [];
try {
  for (const viewport of [{width:1440,height:900},{width:390,height:844}]) {
    const context = await browser.newContext({viewport, serviceWorkers:'block', reducedMotion:'reduce'});
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      return route.abort('blockedbyclient');
    });
    try {
      for (const path of [...publicRoutes,...privateRoutes]) {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', () => errors.push('UNHANDLED_PAGE_ERROR'));
        try {
          const response = await page.goto(origin+path,{waitUntil:'domcontentloaded',timeout:20_000});
          assert.equal(response?.status(),200,'DOCUMENT_RESPONSE');
          if(privateRoutes.includes(path)) {
            await page.waitForURL(origin+'/auth',{timeout:20_000});
            await page.locator('#main-content').waitFor({state:'visible',timeout:15_000});
            await page.locator('#auth-email').waitFor({state:'visible',timeout:15_000});
          } else {
            await page.locator('#main-content').waitFor({state:'visible',timeout:15_000});
            await page.waitForFunction(() => {
              const main=document.querySelector('#main-content');
              return main && main.innerText.trim().length>100 && !!main.querySelector('h1,h2');
            },{},{timeout:20_000});
            assert.equal(new URL(page.url()).pathname,path,'UNEXPECTED_REDIRECT');
          }
          assert.equal(await page.getByTestId('eternyx-error-recovery').count(),0,'RECOVERY_SCREEN');
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth+2);
          assert.equal(overflow,false,'DOCUMENT_HORIZONTAL_OVERFLOW');
          assert.deepEqual(errors,[],'UNHANDLED_PAGE_ERROR');
          report.push({viewport:viewport.width,path,status:'PASS'});
        } catch {
          report.push({viewport:viewport.width,path,status:'FAIL'});
        } finally { await page.close(); }
      }
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
console.log(JSON.stringify({kind:'LOCAL_BUILT_FRONTEND_SMOKE',hostedAcceptance:false,report}));
if (report.length !== (publicRoutes.length+privateRoutes.length)*2 || report.some(r=>r.status!=='PASS')) process.exitCode=1;
