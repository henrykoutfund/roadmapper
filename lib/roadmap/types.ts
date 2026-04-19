export type RevenueConfidence = "low" | "medium" | "high";

export type TimeMode = "fixed" | "range" | "vague";

export type RoadmapRow = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
};

export type ProductRow = {
  id: string;
  roadmap_id: string;
  name: string;
  color: string;
  sort_order: number;
  created_at: string;
};

export type ItemRow = {
  id: string;
  roadmap_id: string;
  product_id: string;
  title: string;
  description: string | null;
  public_summary?: string | null;
  internal_notes?: string | null;
  status: string;
  time_mode: TimeMode;
  start_date: string | null;
  end_date: string | null;
  position_x: number | null;
  position_y: number | null;
  revenue_low: number | null;
  revenue_high: number | null;
  revenue_currency: string;
  revenue_confidence: RevenueConfidence;
  impact_score: number | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
};
