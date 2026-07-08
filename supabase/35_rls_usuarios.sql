-- ════════════════════════════════════════════════════════════════
--  35 · Privacidad: cerrar la lectura de la tabla de usuarios
--  Antes: cualquier persona con sesión podía leer TODOS los usuarios
--  (incluido el correo personal y el código). Ahora:
--   · coordinador/superadmin  → ven a todos.
--   · cualquiera              → se ve a sí mismo.
--   · agente/senior           → ven solo a su propio grupo de mesa.
--  Las vistas gerenciales usan funciones SECURITY DEFINER, así que no
--  se ven afectadas. El reparto del senior (getEquipo) sigue viendo a su
--  grupo, que es lo que necesita.
--  Ejecutar después de 34.
-- ════════════════════════════════════════════════════════════════

drop policy if exists usuarios_select on public.usuarios;
create policy usuarios_select on public.usuarios for select
  using (
    public.es_privilegiado()
    or id = auth.uid()
    or public.grupo_de(mesa) = public.mi_grupo()
  );

notify pgrst, 'reload schema';
