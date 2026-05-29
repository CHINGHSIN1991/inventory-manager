export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          display_name: string | null;
          role: "admin" | "warehouse" | "viewer" | "partner";
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          display_name?: string | null;
          role?: "admin" | "warehouse" | "viewer" | "partner";
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          display_name?: string | null;
          role?: "admin" | "warehouse" | "viewer" | "partner";
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          sku: string;
          name: string;
          description: string | null;
          category: string | null;
          unit: string;
          unit_price: number;
          quantity: number;
          min_stock: number;
          image_url: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          sku: string;
          name: string;
          description?: string | null;
          category?: string | null;
          unit?: string;
          unit_price?: number;
          quantity?: number;
          min_stock?: number;
          image_url?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          sku?: string;
          name?: string;
          description?: string | null;
          category?: string | null;
          unit?: string;
          unit_price?: number;
          quantity?: number;
          min_stock?: number;
          image_url?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      collaboration_projects: {
        Row: {
          id: string;
          name: string;
          partner_id: string;
          start_date: string;
          end_date: string | null;
          status: "active" | "closed";
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          partner_id: string;
          start_date: string;
          end_date?: string | null;
          status?: "active" | "closed";
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          partner_id?: string;
          start_date?: string;
          end_date?: string | null;
          status?: "active" | "closed";
          note?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      collaboration_project_bundles: {
        Row: {
          id: string;
          project_id: string;
          bundle_id: string;
          commission_rate: number;
        };
        Insert: {
          id?: string;
          project_id: string;
          bundle_id: string;
          commission_rate?: number;
        };
        Update: {
          id?: string;
          project_id?: string;
          bundle_id?: string;
          commission_rate?: number;
        };
        Relationships: [];
      };
      collaboration_project_products: {
        Row: {
          id: string;
          project_id: string;
          product_id: string;
          commission_rate: number;
        };
        Insert: {
          id?: string;
          project_id: string;
          product_id: string;
          commission_rate?: number;
        };
        Update: {
          id?: string;
          project_id?: string;
          product_id?: string;
          commission_rate?: number;
        };
        Relationships: [];
      };
      stock_movements: {
        Row: {
          id: string;
          product_id: string;
          type: "in" | "out";
          quantity: number;
          note: string | null;
          created_by: string;
          project_id: string | null;
          order_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          type: "in" | "out";
          quantity: number;
          note?: string | null;
          created_by: string;
          project_id?: string | null;
          order_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          type?: "in" | "out";
          quantity?: number;
          note?: string | null;
          created_by?: string;
          project_id?: string | null;
          order_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          order_number: string;
          project_id: string | null;
          note: string | null;
          status: "active" | "shipped" | "completed" | "cancelled";
          cancelled_note: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_number?: string;
          project_id?: string | null;
          note?: string | null;
          status?: "active" | "shipped" | "completed" | "cancelled";
          cancelled_note?: string | null;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_number?: string;
          project_id?: string | null;
          note?: string | null;
          status?: "active" | "shipped" | "completed" | "cancelled";
          cancelled_note?: string | null;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          product_id: string;
          quantity: number;
        };
        Insert: {
          id?: string;
          order_id: string;
          product_id: string;
          quantity: number;
        };
        Update: {
          id?: string;
          order_id?: string;
          product_id?: string;
          quantity?: number;
        };
        Relationships: [];
      };
      bundles: {
        Row: {
          id: string;
          sku: string;
          name: string;
          description: string | null;
          price: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          sku: string;
          name: string;
          description?: string | null;
          price: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          sku?: string;
          name?: string;
          description?: string | null;
          price?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      order_bundles: {
        Row: {
          id: string;
          order_id: string;
          bundle_id: string;
          quantity: number;
          unit_price: number;
        };
        Insert: {
          id?: string;
          order_id: string;
          bundle_id: string;
          quantity: number;
          unit_price: number;
        };
        Update: {
          id?: string;
          order_id?: string;
          bundle_id?: string;
          quantity?: number;
          unit_price?: number;
        };
        Relationships: [];
      };
      bundle_items: {
        Row: {
          id: string;
          bundle_id: string;
          product_id: string;
          quantity: number;
        };
        Insert: {
          id?: string;
          bundle_id: string;
          product_id: string;
          quantity: number;
        };
        Update: {
          id?: string;
          bundle_id?: string;
          product_id?: string;
          quantity?: number;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Product = Database["public"]["Tables"]["products"]["Row"];
export type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];
export type ProductUpdate = Database["public"]["Tables"]["products"]["Update"];
export type StockMovement = Database["public"]["Tables"]["stock_movements"]["Row"];
export type StockMovementInsert = Database["public"]["Tables"]["stock_movements"]["Insert"];
export type CollaborationProject = Database["public"]["Tables"]["collaboration_projects"]["Row"];
export type CollaborationProjectInsert = Database["public"]["Tables"]["collaboration_projects"]["Insert"];
export type CollaborationProjectUpdate = Database["public"]["Tables"]["collaboration_projects"]["Update"];
export type CollaborationProjectProduct = Database["public"]["Tables"]["collaboration_project_products"]["Row"];
export type CollaborationProjectProductInsert = Database["public"]["Tables"]["collaboration_project_products"]["Insert"];
export type CollaborationProjectBundle = Database["public"]["Tables"]["collaboration_project_bundles"]["Row"];
export type CollaborationProjectBundleInsert = Database["public"]["Tables"]["collaboration_project_bundles"]["Insert"];
export type Order = Database["public"]["Tables"]["orders"]["Row"];
export type OrderInsert = Database["public"]["Tables"]["orders"]["Insert"];
export type OrderItem = Database["public"]["Tables"]["order_items"]["Row"];
export type OrderItemInsert = Database["public"]["Tables"]["order_items"]["Insert"];
export type Bundle = Database["public"]["Tables"]["bundles"]["Row"];
export type BundleInsert = Database["public"]["Tables"]["bundles"]["Insert"];
export type BundleUpdate = Database["public"]["Tables"]["bundles"]["Update"];
export type BundleItem = Database["public"]["Tables"]["bundle_items"]["Row"];
export type BundleItemInsert = Database["public"]["Tables"]["bundle_items"]["Insert"];
export type OrderBundle = Database["public"]["Tables"]["order_bundles"]["Row"];
export type OrderBundleInsert = Database["public"]["Tables"]["order_bundles"]["Insert"];
export type UserRole = Profile["role"];
