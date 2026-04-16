'use client';

import type { ProductCardProps } from './types';

function inventoryColor(stock: number): { color: string; bg: string; label: string } {
  if (stock === 0) return { color: '#c42a2a', bg: '#fbeaea', label: 'Out of stock' };
  if (stock < 10) return { color: '#b36b00', bg: '#fdf4e3', label: `${stock} left` };
  return { color: '#0c8a5a', bg: '#e6f6ef', label: `${stock} in stock` };
}

export default function ProductCard({
  id,
  name,
  price,
  original_price,
  inventory,
  sku,
  image_url,
}: ProductCardProps) {
  const inv = inventoryColor(inventory);
  const discounted = original_price && original_price !== price;

  return (
    <div className="tw-my-4 tw-flex tw-gap-4 tw-rounded-lg tw-border tw-border-[#d9dce9] tw-bg-white tw-p-4 tw-max-w-md">
      {image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image_url}
          alt={name}
          className="tw-w-20 tw-h-20 tw-rounded tw-object-cover tw-bg-[#fafbfc] tw-border tw-border-[#e8e9ef]"
        />
      ) : (
        <div className="tw-w-20 tw-h-20 tw-rounded tw-bg-[#fafbfc] tw-border tw-border-[#e8e9ef] tw-flex tw-items-center tw-justify-center tw-text-[#c4c6d1] tw-text-3xl tw-font-light">
          ◨
        </div>
      )}
      <div className="tw-flex-1 tw-min-w-0">
        <div className="tw-font-semibold tw-text-[#313440] tw-text-sm tw-leading-tight">
          {name}
        </div>
        {sku && <div className="tw-text-xs tw-text-[#8b8e9c] tw-mt-0.5">{sku}</div>}
        <div className="tw-mt-2 tw-flex tw-items-baseline tw-gap-2">
          <span className="tw-text-lg tw-font-semibold tw-text-[#313440] tw-tabular-nums">
            {price}
          </span>
          {discounted && (
            <span className="tw-text-sm tw-text-[#8b8e9c] tw-line-through tw-tabular-nums">
              {original_price}
            </span>
          )}
        </div>
        <div
          className="tw-mt-2 tw-inline-flex tw-items-center tw-rounded-full tw-px-2 tw-py-0.5 tw-text-xs tw-font-medium"
          style={{ color: inv.color, background: inv.bg }}
        >
          {inv.label}
        </div>
        <div className="tw-text-xs tw-text-[#8b8e9c] tw-mt-2">Product ID {id}</div>
      </div>
    </div>
  );
}
