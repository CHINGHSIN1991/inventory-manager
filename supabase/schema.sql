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
