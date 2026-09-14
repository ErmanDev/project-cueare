import { describe, expect, it } from 'bun:test'

import { explainCameraFailure, pickCameraId } from '../../web/src/lib/camera.ts'

describe('pickCameraId', () => {
  it('prefers a rear camera label', () => {
    expect(
      pickCameraId([
        { id: 'front', label: 'FaceTime HD Camera' },
        { id: 'back', label: 'Back Camera' },
      ]),
    ).toBe('back')
  })

  it('falls back to the first camera', () => {
    expect(pickCameraId([{ id: 'only', label: 'Integrated Camera' }])).toBe('only')
  })

  it('returns undefined when none exist', () => {
    expect(pickCameraId([])).toBeUndefined()
  })
})

describe('explainCameraFailure', () => {
  it('names a blocked permission', () => {
    const err = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' })
    expect(explainCameraFailure(err)).toMatch(/permission/i)
  })

  it('names an insecure page', () => {
    expect(explainCameraFailure(new Error('Only secure origins are allowed'))).toMatch(/HTTPS/i)
  })
})
