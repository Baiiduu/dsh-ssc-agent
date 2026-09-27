export function createDocumentService(repository) {
  async function read(userId, id) {
    const document = await repository.find(id)
    if (!document || document.ownerId !== userId) throw new Error('denied')
    return document
  }
  return {
    read,
    async export(userId, ids) {
      return Promise.all(ids.map(id => repository.find(id)))
    },
  }
}
