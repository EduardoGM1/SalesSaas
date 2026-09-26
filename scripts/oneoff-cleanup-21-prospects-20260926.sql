-- YA APLICADO en producción el 2026-09-26.
-- Limpieza puntual de 21 expedientes de prueba. No es una migración.
-- El trigger workflow_events_append_only se apaga y se vuelve a encender
-- dentro de la misma transacción. La función no cambia.
-- Reejecutar aborta: exige que sigan existiendo exactamente esos 21 folios.

BEGIN;
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.prospects
  WHERE prospect_code IN (
    'P-912059','P-767128','P-TST732159','P-115432','P-658026',
    'P-316718','P-169782','P-840402','P-275856','P-604772',
    'P-561499','P-191844','P-551134','P-637633','P-528391',
    'P-996740','P-645107','P-643385','P-908842','P-905850','P-114025'
  );
  IF n <> 21 THEN
    RAISE EXCEPTION 'expected 21 prospects, got %', n;
  END IF;
END $$;
ALTER TABLE public.prospect_workflow_events DISABLE TRIGGER workflow_events_append_only;
DELETE FROM public.sales
 WHERE prospect_id IN (
   SELECT id FROM public.prospects WHERE prospect_code IN (
    'P-912059','P-767128','P-TST732159','P-115432','P-658026',
    'P-316718','P-169782','P-840402','P-275856','P-604772',
    'P-561499','P-191844','P-551134','P-637633','P-528391',
    'P-996740','P-645107','P-643385','P-908842','P-905850','P-114025'
   )
 );
DELETE FROM public.rh_ventas
 WHERE prospect_id IN (
   SELECT id FROM public.prospects WHERE prospect_code IN (
    'P-912059','P-767128','P-TST732159','P-115432','P-658026',
    'P-316718','P-169782','P-840402','P-275856','P-604772',
    'P-561499','P-191844','P-551134','P-637633','P-528391',
    'P-996740','P-645107','P-643385','P-908842','P-905850','P-114025'
   )
 );
DELETE FROM public.calendar_entries
 WHERE prospect_id IN (
   SELECT id FROM public.prospects WHERE prospect_code IN (
    'P-912059','P-767128','P-TST732159','P-115432','P-658026',
    'P-316718','P-169782','P-840402','P-275856','P-604772',
    'P-561499','P-191844','P-551134','P-637633','P-528391',
    'P-996740','P-645107','P-643385','P-908842','P-905850','P-114025'
   )
 );
DELETE FROM public.prospects WHERE prospect_code IN (
  'P-912059','P-767128','P-TST732159','P-115432','P-658026',
  'P-316718','P-169782','P-840402','P-275856','P-604772',
  'P-561499','P-191844','P-551134','P-637633','P-528391',
  'P-996740','P-645107','P-643385','P-908842','P-905850','P-114025'
);
ALTER TABLE public.prospect_workflow_events ENABLE TRIGGER workflow_events_append_only;
COMMIT;
