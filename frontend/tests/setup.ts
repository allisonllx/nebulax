import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
export const plan = JSON.parse(readFileSync(new URL('../../docs/api-examples/plan.json', import.meta.url), 'utf8'));
export async function seed(page: Page, mode: 'elder' | 'caregiver' = 'elder', live = false) {
  await page.addInitScript(({plan,mode,live}) => {
    const key = `nebulax:journey:${live?'live':'demo'}:1`;
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify({schemaVersion:1, journey:plan, stepIndex:0, phase:'planned', language:'en', large:true, blocked:false, proposal:null}));
      localStorage.setItem('nebulax:mode',mode);
    }
  }, {plan,mode,live});
}
export async function mode(page: Page, value: 'elder'|'caregiver') {
  const details=page.locator('.calm-demo-switch');
  if (!(await details.getAttribute('open') !== null)) await details.locator('summary').click();
  await details.getByRole('button', {name: value==='elder'?"Mr Tan's view":'Family view', exact:true}).click();
}
export async function setupLive(page: Page) {
  await page.goto('/');
  await page.getByRole('button',{name:'English',exact:true}).first().click();
  await page.getByRole('button',{name:'Start',exact:true}).click();
  await page.getByRole('button',{name:/Use sample/}).click();
  for(let i=0;i<4;i++)await page.getByRole('button',{name:'Next',exact:true}).click();
  await page.getByRole('button',{name:'Plan his route',exact:true}).click();
}
