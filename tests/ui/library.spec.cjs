const { test, expect, capture } = require('./fixtures.cjs');
const AxeBuilder = require('@axe-core/playwright').default;

async function importList(page, source = 'https://www.youtube.com/playlist?list=PL_A') {
  await page.getByRole('tab', { name: 'Bibliothèque', exact: true }).click();
  await page.getByLabel('Playlist ou chaîne YouTube', { exact: true }).fill(source);
  await page.getByRole('button', { name: 'Importer', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Vidéos de la bibliothèque' })).toBeVisible();
}

test('a playlist imports into a compact selectable list without starting a download', async ({
  page
}, testInfo) => {
  await importList(page);
  const list = page.getByRole('list', { name: 'Vidéos de la bibliothèque' });
  await expect(list.getByRole('listitem')).toHaveCount(3);
  await expect(
    list.getByRole('checkbox', { name: 'Sélectionner Vidéo indisponible' })
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Télécharger la sélection', exact: true })
  ).toBeDisabled();
  expect(
    await page.evaluate(() => window.__test.calls.filter((call) => call.type === 'batch'))
  ).toEqual([]);
  await list
    .getByRole('checkbox', { name: 'Sélectionner Balade au bord de l’eau', exact: true })
    .check();
  await page.getByRole('radio', { name: '1080p pour le lot', exact: true }).click();
  await page.getByRole('button', { name: 'Télécharger 1 vidéo', exact: true }).click();
  const payload = await page.evaluate(
    () => window.__test.calls.find((call) => call.type === 'batch').payload
  );
  expect(payload).toEqual({
    items: [
      {
        id: 'BaW_jenozKc',
        title: 'Balade au bord de l’eau',
        url: 'https://www.youtube.com/watch?v=BaW_jenozKc'
      }
    ],
    outputDir: 'C:\\Videos\\Mes exports',
    targetHeight: 1080
  });
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '24');
  await capture(page, 'v52-library-batch', testInfo);
  await page.evaluate(() => window.__test.finishBatch());
  await expect(list.getByText('Enregistrée', { exact: true })).toHaveCount(1);
  await expect(
    page.getByRole('heading', { name: '1 vidéo enregistrée', exact: true })
  ).toBeVisible();
});

test('select all only affects visible available videos and preserves selections hidden by search', async ({
  page
}) => {
  await importList(page, 'https://www.youtube.com/@CarnetsDeVoyage/videos');
  await expect(page.getByRole('heading', { name: 'Chaîne de voyage', exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Rechercher dans la bibliothèque' }).fill('Montagne');
  await page
    .getByRole('checkbox', { name: 'Sélectionner les vidéos affichées', exact: true })
    .check();
  await page.getByRole('searchbox', { name: 'Rechercher dans la bibliothèque' }).fill('Balade');
  await expect(
    page.getByRole('checkbox', { name: 'Sélectionner Balade au bord de l’eau', exact: true })
  ).not.toBeChecked();
  await page
    .getByRole('checkbox', { name: 'Sélectionner les vidéos affichées', exact: true })
    .check();
  await expect(
    page.getByRole('button', { name: 'Télécharger 2 vidéos', exact: true })
  ).toBeEnabled();
  await page.getByRole('searchbox', { name: 'Rechercher dans la bibliothèque' }).fill('');
  await expect(
    page.getByRole('checkbox', { name: 'Sélectionner Vidéo indisponible', exact: true })
  ).not.toBeChecked();
});

test('individual quality uses the existing complete format chooser and overrides the batch preference', async ({
  page
}) => {
  await importList(page);
  await page
    .getByRole('checkbox', { name: 'Sélectionner Balade au bord de l’eau', exact: true })
    .check();
  await page
    .getByRole('button', { name: 'Choisir la qualité de Balade au bord de l’eau', exact: true })
    .click();
  const editor = page.getByRole('region', {
    name: 'Qualité de Balade au bord de l’eau',
    exact: true
  });
  await editor.getByRole('button', { name: 'Voir tous les formats', exact: true }).click();
  await editor.getByRole('radio', { name: /format 248$/ }).check();
  await page.getByRole('button', { name: 'Fermer les qualités', exact: true }).click();
  await page.getByRole('button', { name: 'Télécharger 1 vidéo', exact: true }).click();
  expect(
    await page.evaluate(
      () => window.__test.calls.find((call) => call.type === 'batch').payload.items[0].formatId
    )
  ).toBe('248');
  await page.evaluate(() => window.__test.finishBatch());
});

test('an edited source invalidates its selection and late imports cannot replace a newer list', async ({
  page
}) => {
  await importList(page);
  await page
    .getByRole('checkbox', { name: 'Sélectionner les vidéos affichées', exact: true })
    .check();
  const slow = 'https://www.youtube.com/playlist?list=PL_slow';
  await page.evaluate((source) => {
    window.__test.delays[source] = 600;
  }, slow);
  await page.getByLabel('Playlist ou chaîne YouTube', { exact: true }).fill(slow);
  await expect(page.getByRole('list', { name: 'Vidéos de la bibliothèque' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Importer', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Annuler l’import', exact: true })).toBeVisible();
  await page
    .getByLabel('Playlist ou chaîne YouTube', { exact: true })
    .fill('https://www.youtube.com/playlist?list=PL_B');
  await page.getByRole('button', { name: 'Importer', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Playlist B', exact: true })).toBeVisible();
  await page.waitForTimeout(650);
  await expect(page.getByRole('heading', { name: 'Playlist B', exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Télécharger la sélection', exact: true })
  ).toBeDisabled();
});

test('a running batch locks the other workflows and cancellation allows a new batch', async ({
  page
}) => {
  await importList(page);
  await page
    .getByRole('checkbox', { name: 'Sélectionner les vidéos affichées', exact: true })
    .check();
  await page.getByRole('button', { name: 'Télécharger 2 vidéos', exact: true }).click();
  await page.getByRole('tab', { name: 'Convertir / compresser', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Choisir une vidéo', exact: true })).toBeDisabled();
  await page.getByRole('tab', { name: 'Télécharger', exact: true }).click();
  await expect(page.getByLabel('Lien YouTube', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Annuler', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Traitement annulé', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Bibliothèque', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Télécharger 2 vidéos', exact: true })
  ).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('failed videos can be selected for retry without reselecting completed videos', async ({
  page
}) => {
  await importList(page);
  await page
    .getByRole('checkbox', { name: 'Sélectionner les vidéos affichées', exact: true })
    .check();
  await page.getByRole('button', { name: 'Télécharger 2 vidéos', exact: true }).click();
  await page.evaluate(() => window.__test.finishBatch(['jNQXAC9IVRw']));
  await page.getByRole('button', { name: 'Sélectionner les échecs', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Sélectionner Balade au bord de l’eau', exact: true })
  ).not.toBeChecked();
  await expect(
    page.getByRole('checkbox', { name: 'Sélectionner Montagne en été', exact: true })
  ).toBeChecked();
  await expect(
    page.getByRole('button', { name: 'Télécharger 1 vidéo', exact: true })
  ).toBeEnabled();
});

test('Google configuration, account playlists, pagination and disconnect clear the account library', async ({
  page
}) => {
  await page.getByRole('tab', { name: 'Bibliothèque', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Connecter YouTube', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Configurer', exact: true }).click();
  await page.getByRole('button', { name: 'Connecter YouTube', exact: true }).click();
  await expect(page.getByText('Ma chaîne', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mes vidéos', exact: true }).click();
  await expect(
    page.getByRole('list', { name: 'Vidéos de la bibliothèque' }).getByRole('listitem')
  ).toHaveCount(1);
  await page
    .getByRole('checkbox', { name: 'Sélectionner Balade au bord de l’eau', exact: true })
    .check();
  await page.getByRole('button', { name: 'Charger plus de vidéos', exact: true }).click();
  await expect(
    page.getByRole('list', { name: 'Vidéos de la bibliothèque' }).getByRole('listitem')
  ).toHaveCount(2);
  await expect(
    page.getByRole('checkbox', { name: 'Sélectionner Balade au bord de l’eau', exact: true })
  ).toBeChecked();
  await page.getByRole('button', { name: /Mes playlists/ }).click();
  await expect(page.getByRole('button', { name: /Ma playlist privée/ })).toBeVisible();
  await page.getByRole('button', { name: 'Déconnecter', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Vidéos de la bibliothèque' })).toHaveCount(0);
});

test('library selection and account controls remain accessible and fit narrow windows', async ({
  page
}, testInfo) => {
  await importList(page);
  await page
    .getByRole('checkbox', { name: 'Sélectionner les vidéos affichées', exact: true })
    .check();
  for (const [width, height] of [
    [1040, 720],
    [760, 580],
    [390, 844]
  ]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    await expect(
      page.getByRole('button', { name: 'Télécharger 2 vidéos', exact: true })
    ).toBeInViewport();
    await capture(page, `v52-library-${width}`, testInfo);
  }
  await page.setViewportSize({ width: 1040, height: 720 });
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
      .every((animation) => animation.playState === 'finished')
  );
  const report = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    report.violations.map(({ id, nodes }) => ({
      id,
      nodes: nodes.map((node) => node.failureSummary)
    }))
  ).toEqual([]);
});

test('private account metadata is visible but never implicitly authenticates the download engine', async ({
  page
}) => {
  await page.getByRole('tab', { name: 'Bibliothèque', exact: true }).click();
  await page.getByRole('button', { name: 'Configurer', exact: true }).click();
  await page.getByRole('button', { name: 'Connecter YouTube', exact: true }).click();
  await page.evaluate(() => {
    window.desktopAPI.getAccountVideos = async () => ({
      items: [
        {
          id: 'BaW_jenozKc',
          title: 'Ma vidéo privée',
          url: 'https://www.youtube.com/watch?v=BaW_jenozKc',
          thumbnail: null,
          duration: 120,
          available: true,
          privacyStatus: 'private'
        }
      ],
      nextPageToken: null
    });
  });
  await page.getByRole('button', { name: 'Mes vidéos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ma vidéo privée', exact: true })).toBeVisible();
  await expect(
    page.getByRole('checkbox', { name: 'Sélectionner Ma vidéo privée', exact: true })
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Télécharger la sélection', exact: true })
  ).toBeDisabled();
});

test('a late account-library response cannot restore personal data after disconnect', async ({
  page
}) => {
  await importList(page);
  await page.getByRole('button', { name: 'Configurer', exact: true }).click();
  await page.getByRole('button', { name: 'Connecter YouTube', exact: true }).click();
  await page.evaluate(() => {
    window.desktopAPI.getAccountVideos = () =>
      new Promise((resolve) => {
        window.__test.resolveAccountVideos = resolve;
      });
  });
  await page.getByRole('button', { name: 'Mes vidéos', exact: true }).click();
  await expect(page.getByText('Chargement des vidéos…', { exact: true })).toBeVisible();
  await page.evaluate(() => window.__test.setAccount({ connected: false, channel: null }));
  await page.evaluate(() =>
    window.__test.resolveAccountVideos({ items: window.__test.libraryItems, nextPageToken: null })
  );
  await expect(page.getByRole('list', { name: 'Vidéos de la bibliothèque' })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Télécharger la sélection', exact: true })
  ).toBeDisabled();
});

test('a large account page cannot select more than one batch and can clear the entire selection', async ({
  page
}) => {
  await page.getByRole('tab', { name: 'Bibliothèque', exact: true }).click();
  await page.getByRole('button', { name: 'Configurer', exact: true }).click();
  await page.getByRole('button', { name: 'Connecter YouTube', exact: true }).click();
  await page.evaluate(() => {
    window.desktopAPI.getAccountVideos = async () => ({
      items: Array.from({ length: 501 }, (_, index) => {
        const id = `V${String(index).padStart(10, '0')}`;
        return {
          id,
          title: `Vidéo ${index}`,
          url: `https://www.youtube.com/watch?v=${id}`,
          thumbnail: null,
          duration: 60,
          available: true
        };
      }),
      nextPageToken: null
    });
  });
  await page.getByRole('button', { name: 'Mes vidéos', exact: true }).click();
  await page
    .getByRole('checkbox', { name: 'Sélectionner les vidéos affichées', exact: true })
    .click();
  await expect(
    page.getByRole('checkbox', { name: 'Sélectionner les vidéos affichées', exact: true })
  ).toHaveAttribute('aria-checked', 'mixed');
  await expect(
    page.getByRole('button', { name: 'Télécharger 500 vidéos', exact: true })
  ).toBeEnabled();
  await expect(
    page.getByRole('checkbox', { name: 'Sélectionner Vidéo 500', exact: true })
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Effacer la sélection', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Télécharger la sélection', exact: true })
  ).toBeDisabled();
});
