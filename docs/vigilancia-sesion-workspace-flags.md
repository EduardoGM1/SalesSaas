# Vigilancia: sesión / flags al cambiar workspace

**Contexto (2026-10):** En expediente personal se reportó UI de Worksheet RH (“Datos Venta”) sin que `worksheet.royal_holiday` apareciera en `resolver_session_flags` del workspace personal — posible desalineación temporal (caché, PWA, URL con `sub=venta` tras sala).

**Qué vigilar tras deploy:** Si vuelve a aparecer subnav RH en personal sin flag en sesión, tratarlo como bug de **refresco de sesión al cambiar `workspace_activo`**, no como regresión del fix de tarjeta Money Box en expediente.

**No investigado en el fix de Money Box (commits `35e92ce` + redirect).**
