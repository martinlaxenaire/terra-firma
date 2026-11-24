const fetchTile = async ({ url, type = 'image' }) => {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Tile request failed: ${response.status} ${response.statusText}`)
  }

  if (type === 'image') {
    return await response.blob()
  }

  if (type === 'lerc') {
    return await response.arrayBuffer()
  }

  throw new Error(`Unsupported tile type: ${type}`)
}

self.addEventListener('message', async (e) => {
  try {
    const data = await fetchTile(e.data)

    self.postMessage(data)
  } catch (error) {
    self.postMessage({
      error: error.message || 'Tile loading failed',
    })
  }
})
