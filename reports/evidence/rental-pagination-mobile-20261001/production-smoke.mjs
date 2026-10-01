import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { chromium, devices, expect } from '/Users/haoyuzuo/.codex/worktrees/fuel-find/Fuel Me Japan/node_modules/@playwright/test/index.mjs';
const base='https://fuel-me-japan.com';
const output='/tmp/fmj-pagination-mobile-20261001';
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
  async function layout(pagination) {
    await pagination.scrollIntoViewIfNeeded();
    const elements=['select','input[name="page"]','button[type="submit"]','.rental-page-previous','.rental-page-next'];
    const boxes=await Promise.all(elements.map(s=>pagination.locator(s).boundingBox()));
    const [size,number,jump,previous,next]=boxes;
    const bar=await pagination.boundingBox();
    assert.ok(Math.abs(size.y-number.y)<2);
    assert.ok(Math.abs(number.y-jump.y)<2);
    assert.ok(size.x+size.width+4<=number.x);
    assert.ok(Math.abs(previous.y-next.y)<2);
    assert.ok(Math.abs(previous.width-next.width)<2);
    assert.ok(previous.y>=number.y+number.height);
    assert.ok(bar.height<=150);
    for(const box of boxes){assert.ok(box.width>=44 && box.height>=44); assert.ok(box.x>=bar.x && box.x+box.width<=bar.x+bar.width);}
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    return {width:await page.evaluate(()=>innerWidth),height:bar.height,controls:boxes};
  }
  for(const width of [430,320]) {
    await page.setViewportSize({width,height:740});
    await page.goto(base+'/zh-Hans/return-car/');
    await expect(page.locator('.rental-card')).toHaveCount(25);
    const pagination=page.locator('#rental-pagination');
    const first=await layout(pagination);
    await expect(pagination.locator('.rental-page-previous')).toBeDisabled();
    await pagination.focus();
    await page.screenshot({path:output+`/production-directory-${width}.png`});
    const total=Number((await page.locator('.rental-results-count').innerText()).replace(/\D/g,''));
    const last=Math.ceil(total/25);
    const number=page.locator('#rental-page-number');
    await number.fill(String(last)); await number.press('Enter');
    await expect(number).toHaveValue(String(last));
    await expect(page.locator('.rental-cards')).toHaveAttribute('start',String((last-1)*25+1));
    await expect(pagination.locator('.rental-page-next')).toBeDisabled();
    assert.equal((await layout(pagination)).height,first.height);
    await number.fill('42'); await pagination.locator('button[type="submit"]').click();
    await expect(number).toHaveValue('42');
    await pagination.locator('.rental-page-next').click(); await expect(number).toHaveValue('43');
    await pagination.locator('.rental-page-previous').click(); await expect(number).toHaveValue('42');
    await pagination.locator('select').selectOption('100');
    await expect(page.locator('.rental-card')).toHaveCount(100); await expect(number).toHaveValue('1');
    assert.equal((await layout(pagination)).height,first.height);
    layouts.push({page:'directory',...first,totalRecords:total,lastPage:last});
  }
  await page.setViewportSize({width:430,height:740});
  await page.goto(base+'/zh-Hans/return-car/times-naha-airport/');
  await expect(page.locator('#return-fuel')).toBeVisible();
  await expect(page.locator('.return-candidates > li').first()).toBeVisible();
  const detailPagination=page.locator('#return-pagination');
  layouts.push({page:'return-candidates',...await layout(detailPagination)});
  await detailPagination.focus();
  await page.screenshot({path:output+'/production-candidates-430.png'});
  assert.deepEqual(errors,[]);
  await writeFile(output+'/production-ui.json',JSON.stringify({status:'PASS',description:'正式网站真实资源和数据，Chromium 手机视口模拟；不是实体 iPhone 验收。',checkedAt:new Date().toISOString(),checks:['两行对齐且触摸目标不小于44px','第一页与末页按钮禁用且高度稳定','输入末页及第42页跳转','上一页和下一页切换','每页100条重置页码','门店详情共用分页排版','无横向溢出或脚本异常'],layouts,pageErrors:errors},null,2)+'\n');
  console.log(JSON.stringify({status:'PASS',httpCount:http.length,productionUI:'PASS',layouts:layouts.map(({page,width,height})=>({page,width,height}))}));
} finally { await browser.close(); }
