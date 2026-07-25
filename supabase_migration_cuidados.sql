-- ── CUIDADOS POSTERIORES POR TRATAMIENTO ──
-- Instructivo que se envía al paciente por email tras el tratamiento.
-- Se edita desde Precios/Tratamientos. NULL = el tratamiento no tiene instructivo.
ALTER TABLE tratamientos ADD COLUMN IF NOT EXISTS cuidados_posteriores TEXT;

-- Sugerencias iniciales para tratamientos habituales (solo si estaban vacías).
UPDATE tratamientos SET cuidados_posteriores =
  'Durante las primeras 48 horas evitá alimentos y bebidas con colorantes fuertes (café, té, vino tinto, gaseosas oscuras, remolacha) y no fumes, porque el esmalte queda más poroso y puede mancharse.' || E'\n\n' ||
  'Puede aparecer sensibilidad dental pasajera: es normal y cede en 1-3 días. Usá pasta para dientes sensibles si lo necesitás.' || E'\n\n' ||
  'Mantené una buena higiene: cepillado suave y evitá enjuagues con alcohol. Ante dolor persistente o molestias que no ceden, comunicate con el consultorio.'
  WHERE cuidados_posteriores IS NULL AND lower(nombre) LIKE '%blanqueamiento%';

UPDATE tratamientos SET cuidados_posteriores =
  'Mordé firme la gasa durante 30-45 minutos para frenar el sangrado. Si continúa, colocá una gasa limpia y repetí.' || E'\n\n' ||
  'Las primeras 24 horas: no escupas ni hagas buches fuertes, no uses pajita, no fumes y evitá esfuerzos físicos. Comé alimentos blandos y fríos.' || E'\n\n' ||
  'Podés aplicar frío en la zona (20 min sí, 20 min no) para la hinchazón. Tomá la medicación indicada. Ante sangrado abundante, dolor intenso o fiebre, comunicate con el consultorio.'
  WHERE cuidados_posteriores IS NULL AND (lower(nombre) LIKE '%extrac%' OR lower(nombre) LIKE '%cirug%');
