-- Dos logos de branding: ícono cuadrado (selector workspace) y logo principal (header).
-- logo_url existente = logo principal; no se borra ni se mueve.

ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS logo_icono_url text;

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS logo_icono_url text;

COMMENT ON COLUMN empresas.logo_url IS 'Logo principal horizontal (header superior derecho).';
COMMENT ON COLUMN empresas.logo_icono_url IS 'Ícono cuadrado (selector de workspace, esquina superior izquierda).';
COMMENT ON COLUMN workspaces.logo_url IS 'Override del logo principal horizontal para esta sala.';
COMMENT ON COLUMN workspaces.logo_icono_url IS 'Override del ícono cuadrado para esta sala.';
