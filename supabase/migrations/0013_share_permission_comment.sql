-- Permiso "comment" + revocación mutua al quitar contacto

alter type public.share_permission add value if not exists 'comment';

create or replace function public.revoke_mutual_shares(peer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if peer_id is null or peer_id = uid then
    return;
  end if;

  delete from public.prospect_shares
  where (owner_id = uid and shared_with_id = peer_id)
     or (owner_id = peer_id and shared_with_id = uid);
end;
$$;

grant execute on function public.revoke_mutual_shares(uuid) to authenticated;
