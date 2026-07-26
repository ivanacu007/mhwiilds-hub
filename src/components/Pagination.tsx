import { PAGE_SIZES, pageNumbers, type PageInfo } from '../lib/paginate.ts';

interface Props {
  info: PageInfo;
  onPage: (page: number) => void;
  onPageSize?: (size: number) => void;
  /** Cómo llamar a lo que se lista, para el resumen. */
  label?: string;
}

export default function Pagination({ info, onPage, onPageSize, label = 'elementos' }: Props) {
  // Con todo cabiendo en una página, los botones solo estorban.
  if (info.total === 0) return null;
  const single = info.totalPages <= 1;

  return (
    <div class="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <span class="text-xs text-base-500">
        {single ? `${info.total} ${label}` : `${info.from}–${info.to} de ${info.total} ${label}`}
      </span>

      {onPageSize && (
        <label class="flex items-center gap-1 text-xs text-base-500">
          por página
          <select
            value={String(info.pageSize)}
            onChange={(e) => onPageSize(Number((e.target as HTMLSelectElement).value))}
            class="rounded border border-base-700 bg-base-900 px-1.5 py-0.5 text-xs"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={String(size)}>{size}</option>
            ))}
          </select>
        </label>
      )}

      {!single && (
        <div class="ml-auto flex flex-wrap items-center gap-1">
          <button
            onClick={() => onPage(info.page - 1)}
            disabled={!info.hasPrev}
            class="rounded border border-base-700 px-2 py-1 text-xs hover:bg-base-850 disabled:opacity-30"
          >
            Anterior
          </button>

          {pageNumbers(info.page, info.totalPages).map((entry, i) =>
            entry === '…' ? (
              <span key={`gap${i}`} class="px-1 text-xs text-base-600">…</span>
            ) : (
              <button
                key={entry}
                onClick={() => onPage(entry)}
                aria-current={entry === info.page ? 'page' : undefined}
                class={`min-w-7 rounded px-2 py-1 text-xs ${
                  entry === info.page
                    ? 'bg-ember-500 font-medium text-base-950'
                    : 'border border-base-700 hover:bg-base-850'
                }`}
              >
                {entry}
              </button>
            ),
          )}

          <button
            onClick={() => onPage(info.page + 1)}
            disabled={!info.hasNext}
            class="rounded border border-base-700 px-2 py-1 text-xs hover:bg-base-850 disabled:opacity-30"
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}
