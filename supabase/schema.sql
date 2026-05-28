-- ============================================
-- Inventory Manager - Supabase Schema
-- ============================================

-- 1. User profiles with roles
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email text NOT NULL,
  display_name text,
  role text NOT NULL DEFAULT 'viewer' CHECK (role in ('admin', 'warehouse', 'viewer', 'partner')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    'viewer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Products
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  category text,
  unit text NOT NULL DEFAULT '個',
  unit_price numeric(12, 2) NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 0,
  min_stock integer NOT NULL DEFAULT 0,
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Stock movements
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type in ('in', 'out')),
  quantity integer NOT NULL CHECK (quantity > 0),
  note text,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger: auto-update product quantity on stock movement
create or replace function public.handle_stock_movement()
returns trigger as $$
begin
  if new.type = 'in' then
    update public.products
    set quantity = quantity + new.quantity,
        updated_at = now()
    where id = new.product_id;
  elsif new.type = 'out' then
    update public.products
    set quantity = quantity - new.quantity,
        updated_at = now()
    where id = new.product_id;
  end if;
  return new;
end;
$$ language plpgsql security definer;

DROP TRIGGER IF EXISTS on_stock_movement_created ON public.stock_movements;

CREATE TRIGGER on_stock_movement_created
  AFTER INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.handle_stock_movement();

-- Trigger: auto-update updated_at on products
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

DROP TRIGGER IF EXISTS on_products_updated ON public.products;

CREATE TRIGGER on_products_updated
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS on_profiles_updated ON public.profiles;

CREATE TRIGGER on_profiles_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================
-- Row Level Security (RLS)
-- ============================================

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.stock_movements enable row level security;

-- Helper: get current user's role
create or replace function public.get_user_role()
returns text as $$
  select role from public.profiles where id = auth.uid();
$$ language sql security definer stable;

-- Profiles: users can read all profiles, only admin can update roles
DROP POLICY IF EXISTS "Anyone can view profiles" ON public.profiles;
create policy "Anyone can view profiles"
  on public.profiles for select
  to authenticated
  using (true);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and (role = (select role from public.profiles where id = auth.uid()))
  );

DROP POLICY IF EXISTS "Admin can update any profile" ON public.profiles;
create policy "Admin can update any profile"
  on public.profiles for update
  to authenticated
  using (public.get_user_role() = 'admin');

-- Products: all authenticated can read, admin/warehouse can write
DROP POLICY IF EXISTS "Authenticated can view products" ON public.products;
create policy "Authenticated can view products"
  on public.products for select
  to authenticated
  using (true);

DROP POLICY IF EXISTS "Admin/warehouse can insert products" ON public.products;
create policy "Admin/warehouse can insert products"
  on public.products for insert
  to authenticated
  with check (public.get_user_role() in ('admin', 'warehouse'));

DROP POLICY IF EXISTS "Admin/warehouse can update products" ON public.products;
create policy "Admin/warehouse can update products"
  on public.products for update
  to authenticated
  using (public.get_user_role() in ('admin', 'warehouse'));

DROP POLICY IF EXISTS "Admin can delete products" ON public.products;
create policy "Admin can delete products"
  on public.products for delete
  to authenticated
  using (public.get_user_role() = 'admin');

-- Stock movements: all authenticated can read, admin/warehouse can insert
DROP POLICY IF EXISTS "Authenticated can view stock movements" ON public.stock_movements;
create policy "Authenticated can view stock movements"
  on public.stock_movements for select
  to authenticated
  using (true);

DROP POLICY IF EXISTS "Admin/warehouse can insert stock movements" ON public.stock_movements;
create policy "Admin/warehouse can insert stock movements"
  on public.stock_movements for insert
  to authenticated
  with check (public.get_user_role() in ('admin', 'warehouse'));

-- ============================================
-- Partner Products (commission linking table)
-- ============================================

CREATE TABLE IF NOT EXISTS public.partner_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  commission_rate numeric(5, 4) NOT NULL DEFAULT 0.1 CHECK (commission_rate >= 0 and commission_rate <= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, product_id)
);

alter table public.partner_products enable row level security;

DROP POLICY IF EXISTS "Admin can manage partner_products" ON public.partner_products;
-- Admin can manage all partner_products
create policy "Admin can manage partner_products"
  on public.partner_products for all
  to authenticated
  using (public.get_user_role() = 'admin')
  with check (public.get_user_role() = 'admin');

DROP POLICY IF EXISTS "Partner can view own records" ON public.partner_products;
-- Partners can view their own records
create policy "Partner can view own records"
  on public.partner_products for select
  to authenticated
  using (partner_id = auth.uid());

-- ============================================
-- Storage bucket for product images
-- ============================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated can upload product images" ON storage.objects;
create policy "Authenticated can upload product images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Anyone can view product images" ON storage.objects;
create policy "Anyone can view product images"
  on storage.objects for select
  using (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Admin/warehouse can delete product images" ON storage.objects;
create policy "Admin/warehouse can delete product images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'product-images'
    and public.get_user_role() in ('admin', 'warehouse')
  );

-- ============================================
-- Migration: add is_active to profiles (for existing databases)
-- ============================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- ============================================
-- Collaboration Projects (replaces partner_products)
-- ============================================

-- Drop partner_products (superseded by collaboration_project_products)
DROP TABLE IF EXISTS public.partner_products CASCADE;

-- Collaboration projects
CREATE TABLE IF NOT EXISTS public.collaboration_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  partner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Per-project product commission rates
CREATE TABLE IF NOT EXISTS public.collaboration_project_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.collaboration_projects(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  commission_rate numeric(5, 4) NOT NULL DEFAULT 0.1 CHECK (commission_rate >= 0 AND commission_rate <= 1),
  UNIQUE (project_id, product_id)
);

-- Add project_id to stock_movements
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.collaboration_projects(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE public.collaboration_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collaboration_project_products ENABLE ROW LEVEL SECURITY;

-- collaboration_projects: admin + warehouse can SELECT all
DROP POLICY IF EXISTS "Admin and warehouse can view collaboration_projects" ON public.collaboration_projects;
CREATE POLICY "Admin and warehouse can view collaboration_projects"
  ON public.collaboration_projects FOR SELECT
  TO authenticated
  USING (public.get_user_role() IN ('admin', 'warehouse'));

-- collaboration_projects: admin can INSERT/UPDATE/DELETE (ALL also covers SELECT)
DROP POLICY IF EXISTS "Admin can manage collaboration_projects" ON public.collaboration_projects;
CREATE POLICY "Admin can manage collaboration_projects"
  ON public.collaboration_projects FOR ALL
  TO authenticated
  USING (public.get_user_role() = 'admin')
  WITH CHECK (public.get_user_role() = 'admin');

-- collaboration_projects: partner can SELECT own
DROP POLICY IF EXISTS "Partner can view own collaboration_projects" ON public.collaboration_projects;
CREATE POLICY "Partner can view own collaboration_projects"
  ON public.collaboration_projects FOR SELECT
  TO authenticated
  USING (partner_id = auth.uid());

-- collaboration_project_products: admin + warehouse can SELECT
DROP POLICY IF EXISTS "Admin and warehouse can view collaboration_project_products" ON public.collaboration_project_products;
CREATE POLICY "Admin and warehouse can view collaboration_project_products"
  ON public.collaboration_project_products FOR SELECT
  TO authenticated
  USING (public.get_user_role() IN ('admin', 'warehouse'));

-- collaboration_project_products: admin can manage
DROP POLICY IF EXISTS "Admin can manage collaboration_project_products" ON public.collaboration_project_products;
CREATE POLICY "Admin can manage collaboration_project_products"
  ON public.collaboration_project_products FOR ALL
  TO authenticated
  USING (public.get_user_role() = 'admin')
  WITH CHECK (public.get_user_role() = 'admin');

-- collaboration_project_products: partner can SELECT products of own projects
DROP POLICY IF EXISTS "Partner can view own collaboration_project_products" ON public.collaboration_project_products;
CREATE POLICY "Partner can view own collaboration_project_products"
  ON public.collaboration_project_products FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.collaboration_projects cp
      WHERE cp.id = project_id AND cp.partner_id = auth.uid()
    )
  );

-- ============================================
-- Orders (出貨單)
-- ============================================

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  project_id uuid REFERENCES public.collaboration_projects(id) ON DELETE SET NULL,
  note text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'shipped', 'completed', 'cancelled')),
  cancelled_note text,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Auto-generate order_number: ORD-YYYYMMDD-NNN
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TRIGGER AS $$
DECLARE
  today text;
  seq integer;
BEGIN
  today := to_char(now() AT TIME ZONE 'Asia/Taipei', 'YYYYMMDD');
  SELECT COUNT(*) + 1 INTO seq FROM public.orders WHERE order_number LIKE 'ORD-' || today || '-%';
  NEW.order_number := 'ORD-' || today || '-' || LPAD(seq::text, 3, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_order_created ON public.orders;
CREATE TRIGGER on_order_created
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.generate_order_number();

-- Order items
CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0)
);

-- Add order_id to stock_movements
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- orders: admin/warehouse can view all
DROP POLICY IF EXISTS "Admin and warehouse can view orders" ON public.orders;
CREATE POLICY "Admin and warehouse can view orders"
  ON public.orders FOR SELECT
  TO authenticated
  USING (public.get_user_role() IN ('admin', 'warehouse'));

-- orders: admin/warehouse can insert
DROP POLICY IF EXISTS "Admin and warehouse can insert orders" ON public.orders;
CREATE POLICY "Admin and warehouse can insert orders"
  ON public.orders FOR INSERT
  TO authenticated
  WITH CHECK (public.get_user_role() IN ('admin', 'warehouse'));

-- orders: only admin can update (for cancellation)
DROP POLICY IF EXISTS "Admin can update orders" ON public.orders;
CREATE POLICY "Admin can update orders"
  ON public.orders FOR UPDATE
  TO authenticated
  USING (public.get_user_role() IN ('admin', 'warehouse'))
  WITH CHECK (public.get_user_role() IN ('admin', 'warehouse'));

-- order_items: admin/warehouse can view
DROP POLICY IF EXISTS "Admin and warehouse can view order_items" ON public.order_items;
CREATE POLICY "Admin and warehouse can view order_items"
  ON public.order_items FOR SELECT
  TO authenticated
  USING (public.get_user_role() IN ('admin', 'warehouse'));

-- order_items: admin/warehouse can insert
DROP POLICY IF EXISTS "Admin and warehouse can insert order_items" ON public.order_items;
CREATE POLICY "Admin and warehouse can insert order_items"
  ON public.order_items FOR INSERT
  TO authenticated
  WITH CHECK (public.get_user_role() IN ('admin', 'warehouse'));

-- ============================================
-- Bundle Products (組合商品)
-- ============================================

CREATE TABLE IF NOT EXISTS public.bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  price numeric(12, 2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bundle_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id uuid NOT NULL REFERENCES public.bundles(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  UNIQUE (bundle_id, product_id)
);

DROP TRIGGER IF EXISTS on_bundles_updated ON public.bundles;
CREATE TRIGGER on_bundles_updated
  BEFORE UPDATE ON public.bundles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bundle_items ENABLE ROW LEVEL SECURITY;

-- bundles: admin/warehouse can view all
DROP POLICY IF EXISTS "Admin and warehouse can view bundles" ON public.bundles;
CREATE POLICY "Admin and warehouse can view bundles"
  ON public.bundles FOR SELECT
  TO authenticated
  USING (public.get_user_role() IN ('admin', 'warehouse'));

-- bundles: admin can manage
DROP POLICY IF EXISTS "Admin can manage bundles" ON public.bundles;
CREATE POLICY "Admin can manage bundles"
  ON public.bundles FOR ALL
  TO authenticated
  USING (public.get_user_role() = 'admin')
  WITH CHECK (public.get_user_role() = 'admin');

-- bundle_items: admin/warehouse can view
DROP POLICY IF EXISTS "Admin and warehouse can view bundle_items" ON public.bundle_items;
CREATE POLICY "Admin and warehouse can view bundle_items"
  ON public.bundle_items FOR SELECT
  TO authenticated
  USING (public.get_user_role() IN ('admin', 'warehouse'));

-- bundle_items: admin can manage
DROP POLICY IF EXISTS "Admin can manage bundle_items" ON public.bundle_items;
CREATE POLICY "Admin can manage bundle_items"
  ON public.bundle_items FOR ALL
  TO authenticated
  USING (public.get_user_role() = 'admin')
  WITH CHECK (public.get_user_role() = 'admin');

-- ============================================
-- Order Bundles (出貨單組合商品)
-- ============================================

CREATE TABLE IF NOT EXISTS public.order_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  bundle_id uuid NOT NULL REFERENCES public.bundles(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(12, 2) NOT NULL DEFAULT 0
);

ALTER TABLE public.order_bundles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin and warehouse can view order_bundles" ON public.order_bundles;
CREATE POLICY "Admin and warehouse can view order_bundles"
  ON public.order_bundles FOR SELECT
  TO authenticated
  USING (public.get_user_role() IN ('admin', 'warehouse'));

DROP POLICY IF EXISTS "Admin and warehouse can manage order_bundles" ON public.order_bundles;
CREATE POLICY "Admin and warehouse can manage order_bundles"
  ON public.order_bundles FOR ALL
  TO authenticated
  USING (public.get_user_role() IN ('admin', 'warehouse'))
  WITH CHECK (public.get_user_role() IN ('admin', 'warehouse'));

-- ============================================
-- Migration: add price to bundles
-- ============================================
ALTER TABLE public.bundles
  ADD COLUMN IF NOT EXISTS price numeric(12, 2) NOT NULL DEFAULT 0;

-- ============================================
-- Migration: update orders status constraint
-- ============================================
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('active', 'shipped', 'completed', 'cancelled'));
