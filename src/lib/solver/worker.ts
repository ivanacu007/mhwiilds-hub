/// <reference lib="webworker" />
/**
 * El solver corre aquí y no en el hilo principal: una búsqueda exhaustiva puede
 * tardar cientos de milisegundos y congelaría la interfaz mientras tanto.
 */
import { indexCatalog, type Catalog, type CatalogIndex } from '../catalog/types.ts';
import { solve } from './solve.ts';
import type { SolveRequest } from './types.ts';

export type WorkerRequest =
  | { type: 'catalogo'; catalog: Catalog }
  | { type: 'resolver'; id: number; request: SolveRequest };

let index: CatalogIndex | null = null;

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;

  if (message.type === 'catalogo') {
    // Se indexa una sola vez y se reutiliza en cada búsqueda.
    index = indexCatalog(message.catalog);
    self.postMessage({ type: 'listo' });
    return;
  }

  if (message.type === 'resolver') {
    if (!index) {
      self.postMessage({ type: 'error', id: message.id, error: 'El catálogo todavía no está cargado.' });
      return;
    }
    try {
      const response = solve(message.request, index);
      self.postMessage({ type: 'resultado', id: message.id, response });
    } catch (err) {
      self.postMessage({
        type: 'error',
        id: message.id,
        error: err instanceof Error ? err.message : 'Fallo inesperado del solver.',
      });
    }
  }
};
