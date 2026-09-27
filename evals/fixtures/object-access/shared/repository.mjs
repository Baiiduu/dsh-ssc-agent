export function createRepository(documents) {
  return {
    async find(id) {
      return documents.find(document => document.id === id)
    },
  }
}
