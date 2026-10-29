import { describe, expect, it } from 'vitest'

import { fingerprintOf } from '../core/index.js'
import { PictureLoadError } from '../core/picture-loader.js'
import { fetchPictureText, readPicture } from '../element/loading.js'
import { CHECKOUT_SVG } from './fixtures.js'

describe('readPicture', () => {
  it('reads the fingerprint and the boxes of a picture', async () => {
    const reading = await readPicture(CHECKOUT_SVG, null, null)
    expect(reading?.fingerprint).toBe(await fingerprintOf(CHECKOUT_SVG))
    expect(reading?.map.nodes.length).toBeGreaterThan(0)
  })

  it('returns null for a picture equal to the one shown', async () => {
    expect(await readPicture(CHECKOUT_SVG, null, await fingerprintOf(CHECKOUT_SVG))).toBeNull()
  })

  it('refuses a picture that is not the pinned one, before anything else', async () => {
    const pinned = `sha256-${'0'.repeat(64)}`
    await expect(readPicture(CHECKOUT_SVG, pinned, null)).rejects.toMatchObject({ reason: 'fingerprint' })
  })

  it('ignores a pin that is not a fingerprint', async () => {
    expect(await readPicture(CHECKOUT_SVG, 'not a fingerprint', null)).not.toBeNull()
  })

  it('refuses text that is not a picture', async () => {
    await expect(readPicture('<p>hello</p>', null, null)).rejects.toBeInstanceOf(PictureLoadError)
    await expect(readPicture('<p>hello</p>', null, null)).rejects.toMatchObject({ reason: 'not-a-picture' })
  })
})

describe('fetchPictureText', () => {
  it('is null without a src', async () => {
    const signal = new AbortController().signal
    expect(await fetchPictureText(null, 'https://example.com/', signal, false)).toBeNull()
    expect(await fetchPictureText('  ', 'https://example.com/', signal, false)).toBeNull()
  })

  it('refuses an address it will not fetch', async () => {
    await expect(fetchPictureText('javascript:alert(1)', 'https://example.com/', new AbortController().signal, false)).rejects.toMatchObject({ reason: 'address' })
  })
})
