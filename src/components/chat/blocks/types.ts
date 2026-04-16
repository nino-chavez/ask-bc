/**
 * Block types mirrored from the Worker's blocks.ts. Types only —
 * runtime validation happens in the registry at block-parse time.
 *
 * When you add a new block, update both this file and the Worker's
 * src/blocks.ts so the prompt and the renderer stay in sync.
 */

export interface KPICardProps {
  label: string;
  value: string | number;
  trend?: {
    direction: "up" | "down" | "flat";
    label: string;
  };
  hint?: string;
}

export interface DataTableColumn {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
}

export interface DataTableProps {
  caption?: string;
  columns: DataTableColumn[];
  rows: Array<Record<string, string | number | boolean | null>>;
}

export interface ProductCardProps {
  id: number;
  name: string;
  price: string;
  original_price?: string;
  inventory: number;
  sku?: string;
  image_url?: string | null;
}

export interface OrderTimelineEvent {
  label: string;
  date: string | null;
  done: boolean;
}

export interface OrderTimelineProps {
  order_id: number;
  customer: string;
  total: string;
  current_status_id: number;
  current_status_label: string;
  events: OrderTimelineEvent[];
}

export interface InventoryBarItem {
  label: string;
  value: number;
  threshold_low: number;
  threshold_ok: number;
}

export interface InventoryBarProps {
  caption?: string;
  items: InventoryBarItem[];
}

export interface SparklinePoint {
  x: string | number;
  y: number;
}

export interface SparklineChartProps {
  label: string;
  points: SparklinePoint[];
  total?: number | string;
}

/** Discriminated union for all known block types. */
export type Block =
  | { type: "KPICard"; props: KPICardProps }
  | { type: "DataTable"; props: DataTableProps }
  | { type: "ProductCard"; props: ProductCardProps }
  | { type: "OrderTimeline"; props: OrderTimelineProps }
  | { type: "InventoryBar"; props: InventoryBarProps }
  | { type: "SparklineChart"; props: SparklineChartProps };

export type BlockType = Block["type"];
