# Regla: cambios en la BD de producción

**Siempre activa** (también en `.cursor/rules/prod-db-no-change-without-ok.mdc`).

Ningún cambio en la base de datos de producción ni en su configuración (migraciones, políticas, funciones, grants) sin OK explícito del operador **en el mismo mensaje**, con backup y rollback preparados **antes**.

- Scripts temporales no se usan sobre producción sin ese OK.
- Nada se ejecuta contra producción antes de mostrar el plan cuando se pida.
- Un test que exija cambiar la BD para pasar es una señal de **parar y preguntar**, no de arreglar la BD.
- Las ramas de refactor de arquitectura no incluyen ni aplican migraciones DDL.
