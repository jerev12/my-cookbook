
# My Cookbook (Supabase + Next.js Starter)

This is a tiny starter that lets users **add recipes** and browse them:
- Home page: recipe cards (title + cuisine). Click to open details (ingredients + numbered steps).
- `/add-recipe`: form to submit a new recipe. Saves recipe + ingredients + steps via a Supabase RPC.

## 1) Prereqs
- Node 18+
- A Supabase project (free)

## 2) Setup
1. Clone or unzip this folder
2. Install deps:
   ```bash
   npm install
   ```
3. Add your Supabase keys:
   - Copy `.env.example` to `.env.local`
   - Fill `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from Supabase → Project Settings → API

4. Make sure your database has these tables, RLS policies, and RPC:
   - See the "SQL to run" section below.

5. Run:
   ```bash
   npm run dev
   ```

## SQL to run in Supabase (SQL editor)

```sql
create table if not exists public.recipes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  title         text not null,
  cuisine       text,
  photo_url     text,
  source_url    text,
  instructions  text not null,
  created_at    timestamptz default now()
);

create table if not exists public.recipe_ingredients (
  id         uuid primary key default gen_random_uuid(),
  recipe_id  uuid not null references public.recipes(id) on delete cascade,
  item_name  text not null,
  quantity   numeric,
  unit       text,
  note       text
);

create table if not exists public.recipe_steps (
  id          uuid primary key default gen_random_uuid(),
  recipe_id   uuid not null references public.recipes(id) on delete cascade,
  step_number int not null,
  body        text not null
);

alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_steps enable row level security;

create policy "read_all_recipes" on public.recipes for select using (true);
create policy "insert_own_recipes" on public.recipes for insert with check (auth.uid() = user_id);
create policy "update_own_recipes" on public.recipes for update using (auth.uid() = user_id);
create policy "delete_own_recipes" on public.recipes for delete using (auth.uid() = user_id);

create policy "read_all_ingredients" on public.recipe_ingredients for select using (true);
create policy "write_ingredients_of_own_recipe" on public.recipe_ingredients
for all using (exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = auth.uid()))
with check   (exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = auth.uid()));

create policy "read_all_steps" on public.recipe_steps for select using (true);
create policy "write_steps_of_own_recipe" on public.recipe_steps
for all using (exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = auth.uid()))
with check   (exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = auth.uid()));

create or replace function public.add_full_recipe(
  p_title text,
  p_cuisine text,
  p_photo_url text,
  p_source_url text,
  p_instructions text,
  p_ingredients jsonb,
  p_steps jsonb
) returns uuid
language plpgsql
security definer
as $$
declare
  v_recipe_id uuid;
begin
  insert into public.recipes (user_id, title, cuisine, photo_url, source_url, instructions)
  values (auth.uid(), p_title, p_cuisine, p_photo_url, p_source_url, p_instructions)
  returning id into v_recipe_id;

  insert into public.recipe_ingredients (recipe_id, item_name, quantity, unit, note)
  select v_recipe_id,
         (ing->>'item_name'),
         nullif((ing->>'quantity')::numeric, null),
         (ing->>'unit'),
         (ing->>'note')
  from jsonb_array_elements(coalesce(p_ingredients, '[]'::jsonb)) ing;

  insert into public.recipe_steps (recipe_id, step_number, body)
  select v_recipe_id,
         coalesce((st->>'step_number')::int, row_number() over (order by (select 1))),
         (st->>'body')
  from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb)) st;

  return v_recipe_id;
end;
$$;

grant execute on function public.add_full_recipe(text, text, text, text, text, jsonb, jsonb) to authenticated;
```

## 3) Pages
- `/` — shows recipe cards; click to open details (ingredients + numbered steps)
- `/add-recipe` — form to submit a recipe

## 4) Notes
- This starter expects you to be signed in for inserts (RLS uses `auth.uid()`). Enable Auth in Supabase (Email/Magic Link is easiest) and add a simple sign-in later.
- Photos: later, upload to a Storage bucket and save the public URL to `photo_url`.



