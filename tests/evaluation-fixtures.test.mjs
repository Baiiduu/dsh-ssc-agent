import assert from 'node:assert/strict'
import { copyFile, mkdir, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

test('paired evaluation fixture proves the ownership defect and preserves valid access after repair', async () => {
  const root = await mkdtemp(join(process.env.SSC_TEST_TMP ?? tmpdir(), 'ssc-fixture-'))
  const source = resolve('evals/fixtures/object-access')
  const documents = [{ id: 'a', ownerId: 'alice', content: 'synthetic A' }, { id: 'b', ownerId: 'bob', content: 'synthetic B' }]
  for (const variant of ['before', 'after']) {
    const workspace = join(root, variant)
    await mkdir(workspace)
    for (const file of ['router.mjs', 'repository.mjs']) await copyFile(join(source, 'shared', file), join(workspace, file))
    await copyFile(join(source, variant, 'service.mjs'), join(workspace, 'service.mjs'))
    const { createRouter } = await import(pathToFileURL(join(workspace, 'router.mjs')).href)
    const { createRepository } = await import(pathToFileURL(join(workspace, 'repository.mjs')).href)
    const handle = createRouter(createRepository(documents))
    assert.equal((await handle(null, { operation: 'export', ids: ['b'] })).status, 401)
    assert.equal((await handle({ userId: 'alice' }, { operation: 'read', id: 'b' })).status, 403)
    assert.equal((await handle({ userId: 'alice' }, { operation: 'export', ids: ['a'] })).data[0].content, 'synthetic A')
    const crossOwner = await handle({ userId: 'alice' }, { operation: 'export', ids: ['b'] })
    assert.equal(crossOwner.status, variant === 'before' ? 200 : 403)
    if (variant === 'before') assert.equal(crossOwner.data[0].content, 'synthetic B')
  }
  // Keep a tiny, explicit artifact instead of recursively deleting test paths.
  assert.match(await readFile(join(root, 'after', 'service.mjs'), 'utf8'), /read\(userId, id\)/)
})
