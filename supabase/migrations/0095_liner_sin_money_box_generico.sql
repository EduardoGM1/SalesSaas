-- El Liner de Royal Holiday usa Money Box como pestaña de Worksheet RH
-- (worksheet.royal_holiday.money_box). El flag genérico worksheet.money_box
-- queda fuera de ese paquete. No toca Cerrador, Gerente ni permisos ver_equipo.

delete from public.paquete_flags pf
using public.paquetes_acceso pa, public.flags f
where pf.paquete_id = pa.id
  and pf.flag_id = f.id
  and pa.slug = 'liner'
  and f.clave = 'worksheet.money_box';
