-- ════════════════════════════════════════════════════════════════
--  28 · Alcance de horarios por rol
--  Antes: el agente veía el suyo; el senior veía TODA la operación.
--  Ahora: agente → el suyo; senior → los de SU GRUPO de mesa;
--  coordinador/superadmin → todos. (La vista de Horarios usa esto.)
--  Ejecutar después de 27.
-- ════════════════════════════════════════════════════════════════

drop policy if exists hor_select on public.horarios;
create policy hor_select on public.horarios for select
  using (
    user_id = auth.uid()
    or public.es_privilegiado()
    or (public.mi_rol() = 'senior'
        and public.grupo_de((select u.mesa from public.usuarios u where u.id = horarios.user_id)) = public.mi_grupo())
  );

notify pgrst, 'reload schema';
