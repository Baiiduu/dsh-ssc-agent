import { createDocumentService } from './service.mjs'

export function createRouter(repository) {
  const service = createDocumentService(repository)
  return async function handle(session, request) {
    if (!session?.userId) return { status: 401 }
    try {
      if (request.operation === 'read') {
        return { status: 200, data: await service.read(session.userId, request.id) }
      }
      if (request.operation === 'export') {
        return { status: 200, data: await service.export(session.userId, request.ids) }
      }
      return { status: 404 }
    } catch {
      return { status: 403 }
    }
  }
}
