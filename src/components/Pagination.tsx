import { PAGE_SIZES, pageNumbers, type PageInfo } from '../lib/paginate.ts';
import type { Translator } from '../lib/i18n/index.ts';

interface Props {
  info: PageInfo;
  onPage: (page: number) => void;
  onPageSize?: (size: number) => void;
  /** Cómo llamar a lo que se lista, para el resumen. */
  label?: string;
  t: Translator;
}

export default function Pagination({ info, onPage, onPageSize, label, t }: Props) {
  const what = label ?? t('common.items');
  // Con todo cabiendo en una página, los botones solo estorban.
  if (info.total === 0) return null;
  const single = info.totalPages <= 1;

  return (
    <div class="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <span class="text-xs text-text-3">
        {single
          ? t('pagination.only', { total: info.total, label: what })
          : t('pagination.of', { from: info.from, to: info.to, total: info.total, label: what })}
      </span>

      {onPageSize && (
        <label class="flex items-center gap-1 text-xs text-text-3">
          {t('pagination.perPage')}
          <select
            value={String(info.pageSize)}
            onChange={(e) => onPageSize(Number((e.target as HTMLSelectElement).value))}
            class="rounded border border-line-strong bg-bg-1 px-1.5 py-0.5 text-xs"
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
            class="rounded border border-line-strong px-2 py-1 text-xs hover:bg-bg-2 disabled:opacity-30"
          >
            {t('pagination.previous')}
          </button>

          {pageNumbers(info.page, info.totalPages).map((entry, i) =>
            entry === '…' ? (
              <span key={`gap${i}`} class="px-1 text-xs text-text-3">…</span>
            ) : (
              <button
                key={entry}
                onClick={() => onPage(entry)}
                aria-current={entry === info.page ? 'page' : undefined}
                class={`min-w-7 rounded px-2 py-1 text-xs ${
                  entry === info.page
                    ? 'bg-accent font-medium text-bg-0'
                    : 'border border-line-strong hover:bg-bg-2'
                }`}
              >
                {entry}
              </button>
            ),
          )}

          <button
            onClick={() => onPage(info.page + 1)}
            disabled={!info.hasNext}
            class="rounded border border-line-strong px-2 py-1 text-xs hover:bg-bg-2 disabled:opacity-30"
          >
            {t('pagination.next')}
          </button>
        </div>
      )}
    </div>
  );
}
