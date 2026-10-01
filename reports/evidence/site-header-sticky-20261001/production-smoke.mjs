import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { chromium, devices, expect } from '/Users/haoyuzuo/.codex/worktrees/fuel-find/Fuel Me Japan/node_modules/@playwright/test/index.mjs';
const base='https://fuel-me-japan.com';
const output='/tmp/fmj-sticky-header-20261001';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const assets=(await readdir('dist/assets')).filter(name=>/\.(js|css)$/.test(name)).map(name=>'/assets/'+name);
const paths=[...['en','zh-Hant','ko','zh-Hans','th'].map(locale=>'/'+locale+'/'), '/zh-Hans/return-car/','/zh-Hans/refuel-guide/','/zh-Hans/about/','/robots.txt','/sitemap.xml','/ads.txt',...assets];
const http=[];
for(const path of paths){
  const response=await fetch(base+path,{headers:{'Cache-Control':'no-cache'}, signal:AbortSignal.timeout(20000)});
  assert.equal(response.status,200,path);
  const bytes=Buffer.from(await response.arrayBuffer());
  const local=await readFile('dist'+path+(path.endsWith('/')?'index.html':''));
  assert.equal(hash(bytes),hash(local),path+' 内容必须与已验收构建相同');
  http.push({path,status:response.status,sha256:hash(bytes)});
}
await writeFile(output+'/production-http.json',JSON.stringify({status:'PASS',description:'正式域名页面与 JS/CSS 内容均与本地已验收构建一致。',checkedAt:new Date().toISOString(),count:http.length,checks:http},null,2)+'\n');
const browser=await chromium.launch();
const layouts=[];
try {
  const context=await browser.newContext({...devices['iPhone 13'],viewport:{width:430,height:740}});
  const page=await context.newPage();
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  async function settle() {
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  }
  async function pinned() {
    const header=page.locator('.site-header');
    await expect.poll(async()=>Math.abs((await header.boundingBox()).y)).toBeLessThan(1);
    for(const selector of ['.brand','.locale-trigger','.primary-navigation a']) {
      for(const control of await header.locator(selector).all()) {
        await expect(control).toBeInViewport({ratio:1});
        assert.equal(await control.evaluate(el=>{
          const rect=el.getBoundingClientRect();
          const target=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
          return !!target && el.contains(target);
        }),true);
      }
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    return header.boundingBox();
  }
  for(const width of [430,320,1280]) {
    await page.setViewportSize({width,height:740});
    for(const path of ['about/','refuel-guide/','return-car/','return-car/times-naha-airport/','']) {
      await page.goto(base+'/zh-Hans/'+path);
      await settle();
      if(path==='return-car/') await expect(page.locator('.rental-card')).toHaveCount(25);
      else if(path.includes('times-naha')) await expect(page.locator('#return-fuel')).toBeVisible();
      else if(!path) await expect(page.locator('.map-surface.leaflet-container')).toBeVisible();
      const initialHeader=await pinned();
      const main=await page.locator('#main').boundingBox();
      assert.ok(main.y>=initialHeader.height-1,'正文不能被页头遮挡');
      await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
      const scroll=await page.evaluate(()=>scrollY);
      const header=await pinned();
      await page.locator('.locale-trigger').click();
      assert.equal(await page.evaluate(()=>scrollY),scroll,'打开语言菜单不能带动网页跳转');
      await expect(page.locator('.locale-menu')).toBeInViewport({ratio:1});
      if((width===430 && path==='about/')||(width===320 && path==='return-car/')||(width===1280 && path==='refuel-guide/')) {
        await page.screenshot({path:output+`/production-header-${width}.png`});
      }
      await page.keyboard.press('Escape');
      layouts.push({path:'/zh-Hans/'+path,width,scrollY:scroll,headerHeight:header.height,headerY:header.y});
    }
  }
  await page.setViewportSize({width:430,height:740});
  await page.goto(base+'/zh-Hans/about/'); await settle();
  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
  await page.locator('.locale-trigger').click();
  await page.locator('.locale-menu a[lang="en"]').click();
  await expect(page).toHaveURL(base+'/en/about/');
  await expect(page.locator('h1')).toHaveText('About Fuel Me Japan');
  await settle(); await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
  await pinned();
  await page.locator('#refuel-guide-link').click();
  await expect(page).toHaveURL(base+'/en/refuel-guide/');
  await expect(page.locator('h1')).toBeVisible();
  assert.deepEqual(errors,[]);
  await writeFile(output+'/production-ui.json',JSON.stringify({status:'PASS',description:'正式网站真实资源与数据，Chromium 手机和桌面视口模拟；不是实体 iPhone 验收。',checkedAt:new Date().toISOString(),checks:['320／430／1280px下五类页面滚到底部，Logo、语言与所有导航持续可见且可点','正文顶部预留实际页头高度，无横向溢出','打开语言菜单不改变页面滚动位置，菜单完整位于视口','页面底部切换语言后保留About路径','通过固定导航进入加油指引','页面无脚本异常'],layouts,pageErrors:errors},null,2)+'\n');
  console.log(JSON.stringify({status:'PASS',httpCount:http.length,productionUI:'PASS',layouts:layouts.length}));
} finally { await browser.close(); }
