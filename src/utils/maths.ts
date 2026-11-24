export const toRad = (angle = 0) => {
  return (angle * Math.PI) / 180
}

export const toDeg = (angle = 0) => {
  return angle * (180.0 / Math.PI)
}

export const clamp = (n = 0, minValue = 0, maxValue = 0) => {
  return Math.min(Math.max(n, minValue), maxValue)
}

export const lerp = (start = 0, end = 1, t = 0) => {
  return start * (1 - t) + end * t
}

export const map = (value = 0, min = 0, max = 1, nmin = 0, nmax = 1) => {
  return Math.max(nmin, Math.min(nmax, ((value - min) / (max - min)) * (nmax - nmin) + nmin))
}

export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

export const easeInPow = (x = 0, pow = 1) => {
  return Math.pow(x, pow)
}

export const easeOutPow = (x = 0, pow = 1) => {
  return 1 - Math.pow(1 - x, pow)
}
