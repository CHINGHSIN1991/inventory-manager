-- ============================================
-- Inventory Manager - Supabase Schema
-- ============================================

-- 1. User profiles with roles
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  display_name text,
  role text not null default 'viewer' check (role in ('admin', 'warehouse', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Products
create table public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  description text,
  category text,
  unit text not null default '個',
  unit_price numeric(12, 2) not null default 0,
  quantity integer not null default 0,
  min_stock integer not null default 0,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Stock movements
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  type text not null check (type in ('in', 'out')),
  quantity integer not null check (quantity > 0),
  note text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
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

create trigger on_stock_movement_created
  after insert on public.stock_movements
  for each row execute function public.handle_stock_movement();

-- Trigger: auto-update updated_at on products
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger on_products_updated
  before update on public.products
  for each row execute function public.handle_updated_at();

create trigger on_profiles_updated
  before update on public.profiles
  for each row execute function public.handle_updated_at();

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
create policy "Anyone can view profiles"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and (role = (select role from public.profiles where id = auth.uid()))
  );

create policy "Admin can update any profile"
  on public.profiles for update
  to authenticated
  using (public.get_user_role() = 'admin');

-- Products: all authenticated can read, admin/warehouse can write
create policy "Authenticated can view products"
  on public.products for select
  to authenticated
  using (true);

create policy "Admin/warehouse can insert products"
  on public.products for insert
  to authenticated
  with check (public.get_user_role() in ('admin', 'warehouse'));

create policy "Admin/warehouse can update products"
  on public.products for update
  to authenticated
  using (public.get_user_role() in ('admin', 'warehouse'));

create policy "Admin can delete products"
  on public.products for delete
  to authenticated
  using (public.get_user_role() = 'admin');

-- Stock movements: all authenticated can read, admin/warehouse can insert
create policy "Authenticated can view stock movements"
  on public.stock_movements for select
  to authenticated
  using (true);

create policy "Admin/warehouse can insert stock movements"
  on public.stock_movements for insert
  to authenticated
  with check (public.get_user_role() in ('admin', 'warehouse'));

-- ============================================
-- Storage bucket for product images
-- ============================================

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true);

create policy "Authenticated can upload product images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'product-images');

create policy "Anyone can view product images"
  on storage.objects for select
  using (bucket_id = 'product-images');

create policy "Admin/warehouse can delete product images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'product-images'
    and public.get_user_role() in ('admin', 'warehouse')
  );
