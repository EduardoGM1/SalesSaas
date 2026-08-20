/** Columnas mínimas para pull/reconcile (alineadas al esquema real en prod). */
export const SYNC_SELECT = {
  prospects:
    "id,user_id,workspace_id,prospect_code,name,name1,name2,occupation1,occupation2,city,country,phone,email,contract,status,tour_date,process_date,process_amount,note,tipo_tour,tour_cuantificable,completed,quick_expedient,created_at,updated_at",
  sales:
    "id,user_id,workspace_id,prospect_id,prospect_name,sale_date,vol,tours,contract,status,processing,process_date,add_processing_followup,note,created_at",
  calendar_entries:
    "id,user_id,workspace_id,prospect_id,sale_id,type,entry_date,note,vol,tours,contract,source,status,processing,process_date,completed,kind,client_name,created_at",
  goals:
    "user_id,workspace_id,year,month,vol,tours,ventas,dias,descansos,updated_at",
  activities:
    "id,user_id,workspace_id,prospect_id,sale_id,type,title,note,activity_date,source,vol,tours,contract,created_at",
  /** Pull: metadata only. El JSON `data` se pide en GET /tool-calculations. */
  tool_calculations:
    "id,user_id,workspace_id,prospect_id,tool,updated_at",
  tool_calculations_full:
    "id,user_id,workspace_id,prospect_id,tool,data,updated_at",
};

export const PROSPECT_LIST_COLUMNS =
  "id,user_id,workspace_id,prospect_code,name,name1,name2,city,country,phone,email,contract,status,tour_date,process_date,process_amount,note,tipo_tour,tour_cuantificable,completed,quick_expedient,created_at,updated_at";

export const PROSPECT_DETAIL_COLUMNS = SYNC_SELECT.prospects;

export const SALE_LIST_COLUMNS =
  "id,user_id,workspace_id,prospect_id,prospect_name,sale_date,vol,tours,contract,status,processing,process_date,add_processing_followup,note,created_at";

export const ACTIVITY_LIST_COLUMNS =
  "id,user_id,workspace_id,prospect_id,sale_id,type,title,note,activity_date,source,vol,tours,contract,created_at";
