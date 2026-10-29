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

  it('sends a bearer only to https or this computer, and calls a token function that throws signed out', async () => {
    const seen: RequestInit[] = []
    const fetcher = async (_url: string, init: RequestInit): Promise<Response> => {
      seen.push(init)
      return new Response(CHECKOUT_SVG)
    }
    const signal = new AbortController().signal
    expect(await fetchPictureText('http://localhost:8787/v1/library/a.svg', 'https://example.com/', signal, false, { fetch: fetcher, token: 'pwa_1' })).toBe(CHECKOUT_SVG)
    expect(seen[0]?.headers).toMatchObject({ Authorization: 'Bearer pwa_1' })
    await expect(fetchPictureText('http://example.org/a.svg', 'https://example.com/', signal, false, { fetch: fetcher, token: 'pwa_1' })).rejects.toMatchObject({ reason: 'address' })
    const failing = (): string => {
      throw new Error('signed out')
    }
    await expect(fetchPictureText('https://api.plotwork.dev/v1/library/a.svg', 'https://example.com/', signal, false, { fetch: fetcher, token: failing })).rejects.toMatchObject({ reason: 'signed-out' })
    expect(await fetchPictureText('http://example.org/a.svg', 'https://example.com/', signal, false, { fetch: fetcher, token: '' })).toBe(CHECKOUT_SVG)
    expect(seen.at(-1)?.headers).not.toHaveProperty('Authorization')
  })

  it('refuses an address it will not fetch', async () => {
    await expect(fetchPictureText('javascript:alert(1)', 'https://example.com/', new AbortController().signal, false)).rejects.toMatchObject({ reason: 'address' })
  })
})
