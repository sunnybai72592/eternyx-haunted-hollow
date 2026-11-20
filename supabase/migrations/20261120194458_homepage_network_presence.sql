-- Fixed-size sketches for current/recent traffic. No IP address or account ID is stored.
create schema if not exists eternyx_presence;
revoke all on schema eternyx_presence from public, anon, authenticated;

create table if not exists eternyx_presence.country_minutes (
  country text not null check (country ~ '^[A-Z]{2}$'),
  slot smallint not null check (slot in (0, 1)),
  minute bigint not null,
  networks bit(4096) not null,
  primary key (country, slot)
);
alter table eternyx_presence.country_minutes enable row level security;
revoke all on eternyx_presence.country_minutes from public, anon, authenticated;

create or replace function public.visitor_presence(contribute boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  address inet;
  region text := upper(headers->>'cf-ipcountry');
  tick bigint := floor(extract(epoch from statement_timestamp()) / 60);
  bits bit(4096) := B'0'::bit(4096);
  position_index integer;
  snapshot jsonb;
begin
  -- Use only Cloudflare gateway metadata. Ignore forwarded lists and caller-selected locations.
  begin
    address := nullif(headers->>'cf-connecting-ip', '')::inet;
  exception when invalid_text_representation then
    address := null;
  end;
  if region is null or region !~ '^[A-Z]{2}$' or region in ('XX','T1') then region := 'ZZ'; end if;
  if contribute and address is not null then
    position_index := (hashtextextended(host(address), tick / 1440) & 4095)::integer;
    bits := set_bit(bits, position_index, 1);
    insert into eternyx_presence.country_minutes as existing (country, slot, minute, networks)
      values (region, (tick % 2)::smallint, tick, bits)
      on conflict (country, slot) do update set minute = excluded.minute,
        networks = case when existing.minute = excluded.minute then existing.networks | excluded.networks else excluded.networks end
      where existing.minute < excluded.minute or
        (existing.minute = excluded.minute and get_bit(existing.networks, position_index) = 0);
  end if;
  with occupied as (
    select country, bit_count(bit_or(networks)) as n
    from eternyx_presence.country_minutes where minute between tick - 1 and tick group by country
  ), estimates as (
    select country, round(-4096 * ln(greatest(0.5, 4096 - n) / 4096.0))::int as n from occupied
  )
  select jsonb_build_object('total', coalesce(sum(n), 0), 'countries', coalesce((
    select jsonb_agg(jsonb_build_object('code', top.country, 'count', top.n) order by top.n desc, top.country)
    from (select * from estimates where country <> 'ZZ' order by n desc, country limit 8) top
  ), '[]'::jsonb), 'gatewayLocated', region <> 'ZZ', 'networkAvailable', address is not null) into snapshot from estimates;
  return snapshot;
end;
$$;
revoke all on function public.visitor_presence(boolean) from public;
grant execute on function public.visitor_presence(boolean) to anon, authenticated;
