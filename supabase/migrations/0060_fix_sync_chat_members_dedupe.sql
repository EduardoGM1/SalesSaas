-- Fix: sync_prospect_chat_members no debe upsertar el mismo usuario dos veces
-- (p. ej. gerente que también es representante del expediente).

create or replace function public.sync_prospect_chat_members(p_prospect_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wf public.prospect_workflows;
  v_conv_id uuid;
  v_titulo text;
  v_desired uuid[];
begin
  select * into v_wf from public.prospect_workflows where prospect_id = p_prospect_id;
  if not found then return null; end if;

  select coalesce(p.name1, p.name, p.prospect_code, 'Expediente')
  into v_titulo
  from public.prospects p where p.id = p_prospect_id;

  insert into public.chat_conversations (workspace_id, tipo, prospect_id, titulo)
  values (v_wf.workspace_id, 'expediente', p_prospect_id, v_titulo)
  on conflict (prospect_id) do update
    set titulo = excluded.titulo,
        workspace_id = excluded.workspace_id,
        updated_at = now()
  returning id into v_conv_id;

  -- Una fila por usuario (misma persona puede ser gerente + vendedor).
  v_desired := array(
    select distinct u
    from unnest(array[v_wf.representante_id, v_wf.gerente_id, v_wf.cerrador_id]) as u
    where u is not null
  );

  insert into public.chat_members (conversation_id, usuario_id, rol, joined_at, left_at)
  select
    v_conv_id,
    uid,
    case
      when uid = v_wf.gerente_id then 'gerente'
      when uid = v_wf.cerrador_id then 'cerrador'
      else 'vendedor'
    end,
    now(),
    null
  from unnest(v_desired) as uid
  on conflict (conversation_id, usuario_id) do update
    set left_at = null,
        rol = excluded.rol,
        joined_at = case
          when public.chat_members.left_at is not null then now()
          else public.chat_members.joined_at
        end;

  update public.chat_members
  set left_at = now()
  where conversation_id = v_conv_id
    and left_at is null
    and not (usuario_id = any (v_desired));

  update public.chat_conversations set updated_at = now() where id = v_conv_id;
  return v_conv_id;
end;
$$;

revoke all on function public.sync_prospect_chat_members(uuid) from public;
grant execute on function public.sync_prospect_chat_members(uuid) to service_role;
