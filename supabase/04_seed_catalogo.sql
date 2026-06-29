-- ════════════════════════════════════════════════════════════════
--  04 · Catálogo inicial de gestiones (las 22 definitivas)
--  El superadmin puede agregar/editar/desactivar más desde la app.
-- ════════════════════════════════════════════════════════════════

insert into public.gestiones_catalogo (nombre, categoria, umbral_min, senior_only, orden) values
  ('CREACIÓN DE CASO',                         'casos',    12, false, 1),
  ('CIERRE DE CASO',                           'casos',    12, false, 2),
  ('SEGUIMIENTO DE CASO',                      'casos',    15, false, 3),
  ('GESTIÓN DE CASO NUEVO',                    'casos',    20, false, 4),
  ('REPARTIR SEGUIMIENTO',                     'interna',  20, true,  5),
  ('AVANCE POR CORREO (saliente)',             'comms',    10, false, 6),
  ('AVANCE POR LLAMADA (saliente)',            'comms',    12, false, 7),
  ('RECEPCIÓN DE LLAMADA DE AVANCE',           'comms',    12, false, 8),
  ('DOCUMENTAR CORREO RECIBIDO',               'comms',     8, false, 9),
  ('AVANCES POR WHATSAPP',                     'comms',     8, false, 10),
  ('SESIÓN TÉCNICA',                           'tecnico',  60, false, 11),
  ('GESTIÓN CON TÉCNICO CPE',                  'tecnico',  45, false, 12),
  ('GESTIÓN CON TÉCNICO COFO',                 'tecnico',  45, false, 13),
  ('GESTIÓN PERMISOS',                         'permisos', 25, false, 14),
  ('TRAMITE DE PERMISOS DE INGRESO',           'permisos', 30, false, 15),
  ('ESCALAMIENTO POR GRUPOS INTERNOS',         'escal',    18, false, 16),
  ('ESCALAMIENTO SEGUNDO/TERCER NIVEL SF-RM',  'escal',    20, false, 17),
  ('REUNIÓN INTERNA COS',                      'reunion',  60, false, 18),
  ('REUNIÓN INTERNA MAYORISTAS',               'reunion',  60, false, 19),
  ('REUNIÓN CON CLIENTE',                      'reunion',  60, false, 20),
  ('CAPACITACIÓN',                             'reunion',  90, false, 21),
  ('GESTIÓN HORARIOS',                         'interna',  45, true,  22);
