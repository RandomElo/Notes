import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { editeur, fermer, lancer, ouvrirPage, preparer } from './app';

// La poignée d'une sous-tâche reste quand la souris quitte sa case pour aller la saisir, même en passant sur la tâche parente.

test('la poignée d’une sous-tâche ne disparaît pas quand la souris va de la case à la poignée', async () => {
  const preparation = await preparer();
  await writeFile(
    join(preparation.vault, 'Courses', 'page.md'),
    '---\nid: 0199a0b0-0000-7000-8000-0000000000c1\ntitle: Courses\nmode: todo\ncreated: 2026-01-01T00:00:00.000Z\nupdated: 2026-01-01T00:00:00.000Z\n---\n- [ ] Parent\n  - [ ] Enfant\n- [ ] Autre\n',
  );
  const session = await lancer(preparation);
  const { page } = session;
  await ouvrirPage(page, 'Courses');
  const enfant = editeur(page).locator('li', { hasText: 'Enfant' }).last();
  const case_ = await enfant.locator('input[type=checkbox]').boundingBox();
  expect(case_).not.toBeNull();
  const x = case_!.x + case_!.width / 2;
  const y = case_!.y + case_!.height / 2;
  await page.mouse.move(x, y);
  const poignee = page.getByRole('button', { name: 'Déplacer le bloc ou ouvrir son menu' });
  await expect(poignee).toBeVisible();
  const cadre = (await poignee.boundingBox())!;
  // La souris part de la case et va vers la poignée par un chemin direct, puis en biais ; la poignée ne doit jamais disparaître.
  const manques: string[] = [];
  const cibleX = cadre.x + cadre.width / 2;
  const cibleY = cadre.y + cadre.height / 2;
  for (const [decalageDepart, decalageY] of [[0, 0], [0, 10], [0, -10]] as const) {
    await page.mouse.move(x, y + decalageDepart);
    for (let pas = 1; pas <= 30; pas++) {
      await page.mouse.move(x + ((cibleX - x) * pas) / 30, y + decalageY + ((cibleY - y - decalageY) * pas) / 30);
      await page.waitForTimeout(15);
      if ((await poignee.count()) === 0) {
        manques.push(`décalage ${decalageY}, pas ${pas}`);
        break;
      }
    }
  }
  expect(manques).toEqual([]);
  // Devant la case d'une sous-tâche (pas sur le texte), la poignée est celle de la sous-tâche, pas celle du parent juste au-dessus.
  await page.mouse.move(x + 100, y);
  await page.mouse.move(case_!.x - 45, y);
  await page.waitForTimeout(100);
  for (const dx of [10, 20, 30, 45, 60]) {
    await page.mouse.move(x + 100, y);
    await page.mouse.move(case_!.x - dx, y);
    await page.waitForTimeout(100);
    const b = (await poignee.boundingBox())!;
    expect(Math.abs(b.y + b.height / 2 - y), `devant la case, à ${dx} px`).toBeLessThan(case_!.height);
  }
  await fermer(session);
});
